import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  ENVELOPE_EVENT_TYPES,
  ENVELOPE_LIMITS,
  ENVELOPE_MESSAGES,
  ENVELOPE_STATUSES,
  ENVELOPE_TRANSITIONS,
  TERMINAL_STATUSES,
  canEditOrDelete,
  canTransition,
  canVoid,
  canonicalJson,
  computeEventHash,
  decodeBase64,
  effectiveStatus,
  fieldsOwnedBy,
  filterSubmittedValues,
  isTerminal,
  pngHasInk,
  sha256Hex,
  sha256HexOfString,
  validateEnvelopeTitle,
  validateExpiryDays,
  validateReason,
  validateSignature,
  validateSignerEmail,
  validateSignerName,
  verifyChain,
  type ChainInput,
  type ChainLink,
  type EnvelopeStatus,
} from './envelopes';

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/**
 * Builds a real, byte-correct 8-bit RGBA PNG. `raw` is the pre-compression scanline data
 * — one filter byte per row followed by `width * 4` sample bytes — so a test can control
 * both the pixels and the row filters. Compression goes through Node's own zlib, which is
 * the point: the inflate implementation in envelopes.ts is verified against the same
 * encoder a browser canvas uses, not against a stream this test hand-rolled.
 */
function makePng(width: number, height: number, raw: Uint8Array, level = 9): Uint8Array {
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const idat = new Uint8Array(deflateSync(Buffer.from(raw), { level }));

  const parts = [
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', new Uint8Array(0)),
  ];

  let total = 0;
  for (const part of parts) total += part.length;
  const png = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }
  return png;
}

function blankRaw(width: number, height: number, filter = 0): Uint8Array {
  const stride = width * 4;
  const raw = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y++) raw[y * (stride + 1)] = filter;
  return raw;
}

function inkedRaw(width: number, height: number, filter = 0): Uint8Array {
  const raw = blankRaw(width, height, filter);
  // One opaque black pixel at (0, 0). With filter None the alpha byte is literal; with
  // filter Sub the left neighbour is outside the row and therefore zero, so it is literal
  // there too — either way this is exactly one non-transparent pixel.
  raw[4] = 0xff;
  return raw;
}

const dataUri = (bytes: Uint8Array) =>
  `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;

const drawn = (bytes: Uint8Array) => ({ type: 'drawn', value: dataUri(bytes) });

/* ------------------------------------------------------------------ *
 * TC-02-UNIT-01: Event hash chain
 * ------------------------------------------------------------------ */

const ENVELOPE_ID = '6f1c2f2e-8f2a-4a52-9f0e-0f1a2b3c4d5e';

function buildChain(inputs: readonly Omit<ChainInput, 'previousEventHash'>[]): ChainLink[] {
  let previousEventHash: string | null = '';
  return inputs.map((input) => {
    const link = { ...input, previousEventHash };
    const eventHash = computeEventHash(link);
    previousEventHash = eventHash;
    return { ...link, eventHash };
  });
}

const THREE_EVENTS: readonly Omit<ChainInput, 'previousEventHash'>[] = [
  {
    envelopeId: ENVELOPE_ID,
    type: 'created',
    occurredAt: '2026-08-20T13:41:00.000Z',
    actor: 'a1b2c3d4-0000-0000-0000-000000000001',
    metadata: { templateVersionNumber: 3 },
  },
  {
    envelopeId: ENVELOPE_ID,
    type: 'sent',
    occurredAt: '2026-08-20T13:57:00.000Z',
    actor: 'a1b2c3d4-0000-0000-0000-000000000001',
    metadata: { notifiedSignerOrder: 1 },
  },
  {
    envelopeId: ENVELOPE_ID,
    type: 'signed',
    occurredAt: '2026-08-20T14:02:00.000Z',
    actor: 'ivan@devscribed.io',
    metadata: null,
  },
];

describe('TC-02-UNIT-01: Event hash chain', () => {
  it('1. is deterministic — the same event hashes to the same digest', () => {
    const input: ChainInput = { ...THREE_EVENTS[0], previousEventHash: '' };
    expect(computeEventHash(input)).toBe(computeEventHash(input));
    expect(computeEventHash(input)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('1b. the first event of an envelope uses an empty previous hash', () => {
    const chain = buildChain(THREE_EVENTS);
    expect(chain[0].previousEventHash).toBe('');
    // A NULL column and an empty string are the same genesis marker.
    expect(
      computeEventHash({ ...THREE_EVENTS[0], previousEventHash: null }),
    ).toBe(chain[0].eventHash);
  });

  it('2. a three-event chain verifies, each link naming its predecessor', () => {
    const chain = buildChain(THREE_EVENTS);
    expect(verifyChain(chain)).toEqual({ valid: true });
    expect(chain[1].previousEventHash).toBe(chain[0].eventHash);
    expect(chain[2].previousEventHash).toBe(chain[1].eventHash);
  });

  it('3. altering Type of the second event is reported at index 1', () => {
    const chain = buildChain(THREE_EVENTS);
    chain[1] = { ...chain[1], type: 'voided' };
    expect(verifyChain(chain)).toEqual({ valid: false, brokenAtIndex: 1 });
  });

  it('4. altering OccurredAt of the second event is reported at index 1', () => {
    const chain = buildChain(THREE_EVENTS);
    chain[1] = { ...chain[1], occurredAt: '2026-08-20T13:58:00.000Z' };
    expect(verifyChain(chain)).toEqual({ valid: false, brokenAtIndex: 1 });
  });

  it('5. deleting the second event entirely is reported at index 1', () => {
    const chain = buildChain(THREE_EVENTS);
    const withHole = [chain[0], chain[2]];
    expect(verifyChain(withHole)).toEqual({ valid: false, brokenAtIndex: 1 });
  });

  it('reports the first divergence only, even when several rows were touched', () => {
    const chain = buildChain(THREE_EVENTS);
    chain[1] = { ...chain[1], actor: 'someone-else' };
    chain[2] = { ...chain[2], actor: 'someone-else' };
    expect(verifyChain(chain)).toEqual({ valid: false, brokenAtIndex: 1 });
  });

  it('detects a rewritten metadata payload', () => {
    const chain = buildChain(THREE_EVENTS);
    chain[0] = { ...chain[0], metadata: { templateVersionNumber: 4 } };
    expect(verifyChain(chain)).toEqual({ valid: false, brokenAtIndex: 0 });
  });

  it('detects a re-pointed previous hash even when the event itself is untouched', () => {
    const chain = buildChain(THREE_EVENTS);
    chain[1] = { ...chain[1], previousEventHash: 'f'.repeat(64) };
    expect(verifyChain(chain)).toEqual({ valid: false, brokenAtIndex: 1 });
  });

  it('accepts an empty chain — an envelope with no events is not tampered with', () => {
    expect(verifyChain([])).toEqual({ valid: true });
  });

  it('key order in metadata does not change the hash', () => {
    const a = computeEventHash({
      ...THREE_EVENTS[0],
      previousEventHash: '',
      metadata: { b: 2, a: 1, nested: { z: 1, y: 2 } },
    });
    const b = computeEventHash({
      ...THREE_EVENTS[0],
      previousEventHash: '',
      metadata: { nested: { y: 2, z: 1 }, a: 1, b: 2 },
    });
    expect(a).toBe(b);
  });

  it('array order in metadata does change the hash — order is content, not layout', () => {
    const a = computeEventHash({ ...THREE_EVENTS[0], previousEventHash: '', metadata: [1, 2] });
    const b = computeEventHash({ ...THREE_EVENTS[0], previousEventHash: '', metadata: [2, 1] });
    expect(a).not.toBe(b);
  });

  it('a null actor and an empty-string actor are the same input', () => {
    const base = { ...THREE_EVENTS[0], previousEventHash: '' };
    expect(computeEventHash({ ...base, actor: null })).toBe(
      computeEventHash({ ...base, actor: '' }),
    );
  });
});

describe('canonicalJson', () => {
  it('sorts object keys recursively and keeps array order', () => {
    expect(canonicalJson({ b: 1, a: { d: 4, c: [3, 1, 2] } })).toBe(
      '{"a":{"c":[3,1,2],"d":4},"b":1}',
    );
  });

  it('encodes null and undefined identically, matching what the column stores', () => {
    expect(canonicalJson(null)).toBe('null');
    expect(canonicalJson(undefined)).toBe('null');
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it('encodes dates as ISO-8601 and non-finite numbers as null', () => {
    expect(canonicalJson(new Date('2026-08-20T14:02:00.000Z'))).toBe('"2026-08-20T14:02:00.000Z"');
    expect(canonicalJson({ n: Number.NaN })).toBe('{"n":null}');
  });

  it('is stable for primitives', () => {
    expect(canonicalJson('x')).toBe('"x"');
    expect(canonicalJson(7)).toBe('7');
    expect(canonicalJson(true)).toBe('true');
  });
});

describe('sha256Hex', () => {
  // The three published FIPS 180-4 / RFC 6234 vectors. If these pass, the hand-written
  // digest is the same function every other SHA-256 implementation computes.
  it('matches the published test vectors', () => {
    expect(sha256HexOfString('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(sha256HexOfString('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(
      sha256HexOfString('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
    ).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });

  it('hashes multi-byte UTF-8 the same way a Node Buffer would', () => {
    // Non-ASCII matters: envelope titles and signer names are routinely Cyrillic.
    expect(sha256HexOfString('Кириллица')).toBe(
      sha256Hex(new Uint8Array(Buffer.from('Кириллица', 'utf8'))),
    );
    expect(sha256HexOfString('😀')).toBe(sha256Hex(new Uint8Array(Buffer.from('😀', 'utf8'))));
  });

  it('handles inputs that straddle the 64-byte block boundary', () => {
    for (const length of [55, 56, 63, 64, 65, 119, 120, 128]) {
      const input = 'a'.repeat(length);
      expect(sha256HexOfString(input)).toBe(
        sha256Hex(new Uint8Array(Buffer.from(input, 'utf8'))),
      );
    }
  });
});

describe('decodeBase64', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = Uint8Array.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    const encoded = Buffer.from(bytes).toString('base64');
    expect(Array.from(decodeBase64(encoded) ?? [])).toEqual(Array.from(bytes));
  });

  it('rejects malformed input rather than guessing', () => {
    expect(decodeBase64('abc')).toBeNull();
    expect(decodeBase64('!!!!')).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * TC-02-UNIT-02: State machine transitions
 * ------------------------------------------------------------------ */

describe('TC-02-UNIT-02: State machine transitions', () => {
  // The full legal set, read off the diagram in the spec. Everything not listed here is
  // illegal, and the exhaustive loop below asserts exactly that.
  const LEGAL: ReadonlyArray<[EnvelopeStatus, EnvelopeStatus]> = [
    ['draft', 'sent'],
    ['sent', 'partially_signed'],
    ['sent', 'declined'],
    ['sent', 'voided'],
    ['sent', 'expired'],
    ['partially_signed', 'completed'],
    ['partially_signed', 'declined'],
    ['partially_signed', 'voided'],
    ['partially_signed', 'expired'],
  ];

  it('allows every legal transition', () => {
    for (const [from, to] of LEGAL) {
      expect(canTransition(from, to), `${from} → ${to}`).toBe(true);
    }
  });

  it('refuses every transition not on the diagram', () => {
    const legal = new Set(LEGAL.map(([from, to]) => `${from}>${to}`));
    for (const from of ENVELOPE_STATUSES) {
      for (const to of ENVELOPE_STATUSES) {
        const expected = legal.has(`${from}>${to}`);
        expect(canTransition(from, to), `${from} → ${to}`).toBe(expected);
      }
    }
  });

  it('matches the worked examples in the test case', () => {
    expect(canTransition('draft', 'sent')).toBe(true); // draft → send legal
    expect(canTransition('sent', 'sent')).toBe(false); // sent → send illegal
    expect(canTransition('sent', 'voided')).toBe(true); // sent → void legal
    expect(canTransition('completed', 'voided')).toBe(false); // completed → void illegal
    expect(canTransition('voided', 'partially_signed')).toBe(false); // voided → sign illegal
    expect(canTransition('declined', 'voided')).toBe(false); // declined → void illegal
    expect(canTransition('expired', 'partially_signed')).toBe(false); // expired → sign illegal
    expect(canTransition('draft', 'voided')).toBe(false); // draft → void illegal
    expect(canEditOrDelete('draft')).toBe(true); // draft → delete legal
    expect(canEditOrDelete('sent')).toBe(false); // sent → delete illegal
  });

  it('treats all four terminal statuses as accepting nothing at all', () => {
    expect(TERMINAL_STATUSES).toEqual(['completed', 'declined', 'voided', 'expired']);
    for (const status of TERMINAL_STATUSES) {
      expect(isTerminal(status)).toBe(true);
      expect(ENVELOPE_TRANSITIONS[status]).toEqual([]);
      for (const to of ENVELOPE_STATUSES) {
        expect(canTransition(status, to), `${status} → ${to}`).toBe(false);
      }
    }
  });

  it('treats draft, sent and partially_signed as non-terminal', () => {
    expect(isTerminal('draft')).toBe(false);
    expect(isTerminal('sent')).toBe(false);
    expect(isTerminal('partially_signed')).toBe(false);
  });

  it('permits editing and deleting only a draft (invariant 1)', () => {
    for (const status of ENVELOPE_STATUSES) {
      expect(canEditOrDelete(status), status).toBe(status === 'draft');
    }
  });

  it('permits voiding only an in-flight envelope (invariant 2)', () => {
    for (const status of ENVELOPE_STATUSES) {
      expect(canVoid(status), status).toBe(status === 'sent' || status === 'partially_signed');
    }
  });

  it('carries the seventeen event types of the audit trail', () => {
    // Fifteen from spec 02, plus the two the spec 04 Data Model adds for the reconciler.
    // Adding values to the enum is additive: existing rows are untouched, and every one of
    // the original fifteen is still here.
    expect(ENVELOPE_EVENT_TYPES).toHaveLength(17);
    expect(new Set(ENVELOPE_EVENT_TYPES).size).toBe(17);
    expect(ENVELOPE_EVENT_TYPES).toContain('provider_synced');
    expect(ENVELOPE_EVENT_TYPES).toContain('provider_error');
  });
});

describe('TC-02-UNIT-02: effectiveStatus (lazy expiry, requirement 34)', () => {
  const now = new Date('2026-08-24T12:00:00.000Z');
  const past = new Date('2026-08-23T12:00:00.000Z');
  const future = new Date('2026-09-23T12:00:00.000Z');

  it('reports a past expiry as expired for every non-terminal status', () => {
    for (const status of ['draft', 'sent', 'partially_signed'] as const) {
      expect(effectiveStatus(status, past, now), status).toBe('expired');
    }
  });

  it('leaves a terminal status alone even when the expiry has passed', () => {
    for (const status of TERMINAL_STATUSES) {
      expect(effectiveStatus(status, past, now), status).toBe(status);
    }
  });

  it('leaves a non-terminal status alone while the expiry is still ahead', () => {
    expect(effectiveStatus('sent', future, now)).toBe('sent');
    expect(effectiveStatus('partially_signed', future, now)).toBe('partially_signed');
  });

  it('treats an envelope with no expiry as never expiring', () => {
    expect(effectiveStatus('draft', null, now)).toBe('draft');
    expect(effectiveStatus('sent', null, now)).toBe('sent');
  });

  it('is not expired at the exact instant of the deadline — strictly ExpiresAt < now', () => {
    expect(effectiveStatus('sent', new Date(now.getTime()), now)).toBe('sent');
    expect(effectiveStatus('sent', new Date(now.getTime() - 1), now)).toBe('expired');
  });

  it('defaults `now` to the wall clock, so a caller cannot forget to pass it', () => {
    expect(effectiveStatus('sent', new Date(Date.now() - 60_000))).toBe('expired');
    expect(effectiveStatus('sent', new Date(Date.now() + 60_000))).toBe('sent');
  });
});

/* ------------------------------------------------------------------ *
 * TC-02-UNIT-03 / 04: Signature validation
 * ------------------------------------------------------------------ */

describe('TC-02-UNIT-03: Drawn signature validation', () => {
  it('rejects a fully transparent PNG — an untouched canvas is not a signature', () => {
    const png = makePng(240, 80, blankRaw(240, 80));
    expect(validateSignature(drawn(png))).toEqual({
      valid: false,
      error: ENVELOPE_MESSAGES.signing.emptySignature,
    });
  });

  it('accepts a PNG with ink, keeping the data URI verbatim', () => {
    const png = makePng(240, 80, inkedRaw(240, 80));
    const uri = dataUri(png);
    expect(validateSignature({ type: 'drawn', value: uri })).toEqual({
      valid: true,
      value: { type: 'drawn', image: uri },
    });
  });

  it('rejects an image over the 512 KB cap', () => {
    // Random samples do not compress, so this is genuinely oversized rather than a
    // declared size the encoder talked down.
    const width = 400;
    const height = 400;
    const raw = blankRaw(width, height);
    for (let i = 0; i < raw.length; i++) raw[i] = Math.floor(Math.random() * 256);
    for (let y = 0; y < height; y++) raw[y * (width * 4 + 1)] = 0;
    const png = makePng(width, height, raw, 1);
    expect(png.length).toBeGreaterThan(ENVELOPE_LIMITS.signatureImageMaxBytes);
    expect(validateSignature(drawn(png))).toEqual({
      valid: false,
      error: ENVELOPE_MESSAGES.signing.signatureTooLarge,
    });
  });

  it('rejects a data URI of some other type', () => {
    const png = makePng(240, 80, inkedRaw(240, 80));
    const jpeg = `data:image/jpeg;base64,${Buffer.from(png).toString('base64')}`;
    expect(validateSignature({ type: 'drawn', value: jpeg })).toEqual({
      valid: false,
      error: ENVELOPE_MESSAGES.signing.emptySignature,
    });
  });

  it('rejects a plain string that is not a data URI at all', () => {
    expect(validateSignature({ type: 'drawn', value: 'squiggle' })).toEqual({
      valid: false,
      error: ENVELOPE_MESSAGES.signing.emptySignature,
    });
    expect(validateSignature({ type: 'drawn', value: '' })).toEqual({
      valid: false,
      error: ENVELOPE_MESSAGES.signing.emptySignature,
    });
  });

  it('rejects a payload that is not an object, or has no recognized type', () => {
    for (const payload of [null, undefined, 'data:image/png;base64,AAAA', 42, {}, { type: 'x' }]) {
      expect(validateSignature(payload).valid).toBe(false);
    }
  });

  it('accepts the { type, image } spelling as well as the wire { type, value } one', () => {
    const uri = dataUri(makePng(240, 80, inkedRaw(240, 80)));
    expect(validateSignature({ type: 'drawn', image: uri })).toEqual({
      valid: true,
      value: { type: 'drawn', image: uri },
    });
  });

  it('rejects base64 that is not decodable', () => {
    expect(validateSignature({ type: 'drawn', value: 'data:image/png;base64,AAA' })).toEqual({
      valid: false,
      error: ENVELOPE_MESSAGES.signing.emptySignature,
    });
  });
});

describe('pngHasInk', () => {
  it('reverses row filters before looking at the alpha channel', () => {
    // Up-filtered rows of zeroes still decode to a fully transparent image…
    expect(pngHasInk(makePng(64, 16, blankRaw(64, 16, 2)))).toBe(false);
    // …and a Sub-filtered row carrying one opaque pixel still decodes to ink.
    expect(pngHasInk(makePng(64, 16, inkedRaw(64, 16, 1)))).toBe(true);
    expect(pngHasInk(makePng(64, 16, blankRaw(64, 16, 4)))).toBe(false);
  });

  it('inflates stored (uncompressed) DEFLATE blocks as well as compressed ones', () => {
    expect(pngHasInk(makePng(64, 16, inkedRaw(64, 16), 0))).toBe(true);
    expect(pngHasInk(makePng(64, 16, blankRaw(64, 16), 0))).toBe(false);
  });

  it('finds ink anywhere in the image, not only on the first row', () => {
    const raw = blankRaw(32, 32);
    raw[31 * (32 * 4 + 1) + 1 + 4 * 31 + 3] = 0x01;
    expect(pngHasInk(makePng(32, 32, raw))).toBe(true);
  });

  it('returns null — cannot tell, so do not reject — for anything it cannot analyse', () => {
    expect(pngHasInk(Uint8Array.from([1, 2, 3]))).toBeNull();
    expect(pngHasInk(new Uint8Array(0))).toBeNull();
    // A truncated PNG: correct magic, no usable chunks.
    expect(pngHasInk(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBeNull();
  });
});

describe('TC-02-UNIT-04: Typed signature validation', () => {
  it('rejects an empty name', () => {
    expect(validateSignature({ type: 'typed', value: '' })).toEqual({
      valid: false,
      error: ENVELOPE_MESSAGES.signing.typedSignatureEmpty,
    });
  });

  it('rejects a whitespace-only name', () => {
    for (const value of ['   ', '\t', '\n \n']) {
      expect(validateSignature({ type: 'typed', value })).toEqual({
        valid: false,
        error: ENVELOPE_MESSAGES.signing.typedSignatureEmpty,
      });
    }
  });

  it('accepts a real name and trims it', () => {
    expect(validateSignature({ type: 'typed', value: '  Ivan Demchenko  ' })).toEqual({
      valid: true,
      value: { type: 'typed', name: 'Ivan Demchenko' },
    });
  });

  it('accepts a name of exactly 100 characters and rejects 101', () => {
    expect(validateSignature({ type: 'typed', value: 'a'.repeat(100) }).valid).toBe(true);
    expect(validateSignature({ type: 'typed', value: 'a'.repeat(101) })).toEqual({
      valid: false,
      error: ENVELOPE_MESSAGES.signing.typedSignatureEmpty,
    });
  });

  it('accepts the { type, name } spelling as well as the wire { type, value } one', () => {
    expect(validateSignature({ type: 'typed', name: 'Alex Kaminski' })).toEqual({
      valid: true,
      value: { type: 'typed', name: 'Alex Kaminski' },
    });
  });

  it('rejects a missing or non-string name', () => {
    expect(validateSignature({ type: 'typed' }).valid).toBe(false);
    expect(validateSignature({ type: 'typed', value: 42 }).valid).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * TC-02-UNIT-05: Field ownership filter
 * ------------------------------------------------------------------ */

describe('TC-02-UNIT-05: Field ownership filter', () => {
  const FIELDS = [
    { key: 'a', filledBy: 'sender' },
    { key: 'b', filledBy: 'signer:contractor' },
    { key: 'c', filledBy: 'signer:company' },
  ] as const;

  it('keeps only the contractor-owned key and drops the rest without erroring', () => {
    expect(
      filterSubmittedValues({ a: 'sender value', b: 'IBAN BY…', c: 'company value' }, FIELDS, 'contractor'),
    ).toEqual({ b: 'IBAN BY…' });
  });

  it('lists the keys an owner may write', () => {
    expect(fieldsOwnedBy(FIELDS, 'contractor')).toEqual(['b']);
    expect(fieldsOwnedBy(FIELDS, 'company')).toEqual(['c']);
    expect(fieldsOwnedBy(FIELDS, 'sender')).toEqual(['a']);
    expect(fieldsOwnedBy(FIELDS, 'stranger')).toEqual([]);
  });

  it('accepts an owner given with or without the signer: prefix', () => {
    expect(fieldsOwnedBy(FIELDS, 'signer:contractor')).toEqual(['b']);
    expect(
      filterSubmittedValues({ b: 'x' }, FIELDS, 'signer:contractor'),
    ).toEqual({ b: 'x' });
  });

  it('never lets a signer key be read as the sender key, or the reverse', () => {
    expect(filterSubmittedValues({ a: 'x' }, FIELDS, 'contractor')).toEqual({});
    expect(filterSubmittedValues({ b: 'x' }, FIELDS, 'sender')).toEqual({});
  });

  it('drops keys that are not fields of the pinned version at all', () => {
    expect(filterSubmittedValues({ nope: 'x', b: 'y' }, FIELDS, 'contractor')).toEqual({ b: 'y' });
  });

  it('normalizes scalars to strings and drops anything that is not one', () => {
    const fields = [
      { key: 'n', filledBy: 'signer:contractor' },
      { key: 'f', filledBy: 'signer:contractor' },
      { key: 'o', filledBy: 'signer:contractor' },
      { key: 'z', filledBy: 'signer:contractor' },
    ];
    expect(
      filterSubmittedValues({ n: 42, f: true, o: { nested: 1 }, z: null }, fields, 'contractor'),
    ).toEqual({ n: '42', f: 'true', z: '' });
  });

  it('tolerates an empty submission', () => {
    expect(filterSubmittedValues({}, FIELDS, 'contractor')).toEqual({});
  });
});

/* ------------------------------------------------------------------ *
 * Field validators and messages
 * ------------------------------------------------------------------ */

describe('validateEnvelopeTitle', () => {
  it('requires a title', () => {
    expect(validateEnvelopeTitle('')).toEqual({
      valid: false,
      error: ENVELOPE_MESSAGES.title.required,
    });
    expect(validateEnvelopeTitle('   ')).toEqual({
      valid: false,
      error: ENVELOPE_MESSAGES.title.required,
    });
  });

  it('trims and accepts up to 200 characters', () => {
    expect(validateEnvelopeTitle('  Contractor agreement  ')).toEqual({
      valid: true,
      value: 'Contractor agreement',
    });
    expect(validateEnvelopeTitle('t'.repeat(200)).valid).toBe(true);
  });

  it('rejects 201 characters', () => {
    expect(validateEnvelopeTitle('t'.repeat(201))).toEqual({
      valid: false,
      error: ENVELOPE_MESSAGES.title.tooLong,
    });
  });
});

describe('validateSignerName', () => {
  it('requires a name', () => {
    expect(validateSignerName('  ')).toEqual({
      valid: false,
      error: ENVELOPE_MESSAGES.signer.nameRequired,
    });
  });

  it('accepts 1–100 characters and trims', () => {
    expect(validateSignerName(' Alex Kaminski ')).toEqual({ valid: true, value: 'Alex Kaminski' });
    expect(validateSignerName('n'.repeat(100)).valid).toBe(true);
  });

  it('rejects 101 characters', () => {
    expect(validateSignerName('n'.repeat(101))).toEqual({
      valid: false,
      error: ENVELOPE_MESSAGES.signer.nameTooLong,
    });
  });

  it('does not apply the signup name character rule — a counterparty is not an account', () => {
    // "ООО «Северный ветер», рук. И. Петров" is a perfectly ordinary signer name.
    expect(validateSignerName('ООО «Северный ветер»').valid).toBe(true);
    expect(validateSignerName('J. Doe (Jr.)').valid).toBe(true);
  });
});

describe('validateSignerEmail', () => {
  it('normalizes to lowercase, reusing the package email rule', () => {
    expect(validateSignerEmail('  Alex@Example.COM ')).toEqual({
      valid: true,
      value: 'alex@example.com',
    });
  });

  it('gives one message for empty, malformed, and over-long alike', () => {
    for (const input of ['', '   ', 'not-an-email', 'a@b', `${'a'.repeat(250)}@example.com`]) {
      expect(validateSignerEmail(input)).toEqual({
        valid: false,
        error: ENVELOPE_MESSAGES.signer.emailInvalid,
      });
    }
  });
});

describe('validateReason', () => {
  it('requires a void reason', () => {
    expect(validateReason('', true)).toEqual({
      valid: false,
      error: ENVELOPE_MESSAGES.void.reasonRequired,
    });
    expect(validateReason(null, true)).toEqual({
      valid: false,
      error: ENVELOPE_MESSAGES.void.reasonRequired,
    });
    expect(validateReason('  ', true).valid).toBe(false);
  });

  it('allows an absent decline reason', () => {
    expect(validateReason(undefined, false)).toEqual({ valid: true, value: '' });
    expect(validateReason('', false)).toEqual({ valid: true, value: '' });
  });

  it('accepts 500 characters and rejects 501, required or not', () => {
    expect(validateReason('r'.repeat(500), true).valid).toBe(true);
    expect(validateReason('r'.repeat(501), true)).toEqual({
      valid: false,
      error: ENVELOPE_MESSAGES.decline.reasonTooLong,
    });
    expect(validateReason('r'.repeat(501), false)).toEqual({
      valid: false,
      error: ENVELOPE_MESSAGES.decline.reasonTooLong,
    });
  });

  it('trims', () => {
    expect(validateReason('  Terms renegotiated  ', true)).toEqual({
      valid: true,
      value: 'Terms renegotiated',
    });
  });
});

describe('validateExpiryDays', () => {
  it('accepts the inclusive bounds and the default', () => {
    expect(validateExpiryDays(1)).toEqual({ valid: true, value: 1 });
    expect(validateExpiryDays(365)).toEqual({ valid: true, value: 365 });
    expect(validateExpiryDays(ENVELOPE_LIMITS.expiryDaysDefault)).toEqual({
      valid: true,
      value: 30,
    });
  });

  it('accepts the numeric string an <input type="number"> produces', () => {
    expect(validateExpiryDays('30')).toEqual({ valid: true, value: 30 });
    expect(validateExpiryDays(' 30 ')).toEqual({ valid: true, value: 30 });
  });

  it('rejects everything outside the range, and everything that is not an integer', () => {
    for (const input of [0, -1, 366, 30.5, '30.5', 'abc', '', ' ', null, undefined, {}, [], NaN]) {
      expect(validateExpiryDays(input), JSON.stringify(input) ?? String(input)).toEqual({
        valid: false,
        error: ENVELOPE_MESSAGES.expiry.outOfRange,
      });
    }
  });
});

describe('ENVELOPE_MESSAGES', () => {
  it('carries the spec table verbatim, including the parameterized rows', () => {
    expect(ENVELOPE_MESSAGES.field.required('Bank details')).toBe('Bank details is required');
    expect(ENVELOPE_MESSAGES.field.tooLong('Address', 200)).toBe(
      'Address must be at most 200 characters',
    );
    expect(ENVELOPE_MESSAGES.signing.expired('23 September 2026')).toBe(
      'This link expired on 23 September 2026.',
    );
    expect(ENVELOPE_MESSAGES.signing.voided('21 Aug 2026')).toBe(
      'This document was withdrawn by the sender on 21 Aug 2026.',
    );
    expect(ENVELOPE_MESSAGES.bounce('alex@example.com')).toBe(
      'We could not deliver the invitation to alex@example.com',
    );
  });

  it('renders the ESIGN/UETA consent sentence exactly as the signing page must show it', () => {
    expect(ENVELOPE_MESSAGES.signing.consentText).toBe(
      'I agree to sign this document electronically and that my electronic signature is legally binding.',
    );
  });

  it('keeps the generic failure sentence identical to the rest of the product', () => {
    expect(ENVELOPE_MESSAGES.generic).toBe('Something went wrong. Please try again.');
  });
});

describe('ENVELOPE_LIMITS', () => {
  it('matches the data model column widths', () => {
    expect(ENVELOPE_LIMITS).toEqual({
      titleMax: 200,
      signerNameMax: 100,
      signerEmailMax: 254,
      reasonMax: 500,
      typedSignatureMax: 100,
      signatureImageMaxBytes: 512 * 1024,
      expiryDaysMin: 1,
      expiryDaysMax: 365,
      expiryDaysDefault: 30,
    });
  });
});
