import { describe, expect, it } from 'vitest';
import {
  documentCanceled,
  documentCreated,
  documentSent,
  WEBHOOK_ID,
} from '../../../apps/api/test/signwell-webhook-fixtures';
import {
  readSignWellNotification,
  verifySignWellHash,
} from '../../../apps/api/src/webhooks/signwell-notification';
import {
  REDACTED,
  redactProviderPayload,
} from '../../../apps/api/src/webhooks/redact-payload';

/**
 * Hash verification and redaction, against **three real deliveries** SignWell sent.
 *
 * Both modules are pure — `node:crypto` and object walking, no Nest and no Prisma — so
 * they are unit cases, and both are imported across the workspace for the same reason the
 * text-tag cases are.
 */

describe('TC-04-UNIT-04: Webhook hash verification, against a hash SignWell produced', () => {
  const deliveries = [
    ['document_created', documentCreated],
    ['document_sent', documentSent],
    ['document_canceled', documentCanceled],
  ] as const;

  for (const [name, delivery] of deliveries) {
    it(`accepts the captured ${name} delivery`, () => {
      // This is the case that proves our HMAC agrees with *theirs* rather than with
      // itself: the hash in the fixture was produced by SignWell, not by us.
      expect(
        verifySignWellHash(
          delivery.event.type,
          delivery.event.time,
          delivery.event.hash,
          WEBHOOK_ID,
        ),
      ).toBe(true);
    });
  }

  it('rejects a hash computed with a different webhook id', () => {
    expect(
      verifySignWellHash(
        documentSent.event.type,
        documentSent.event.time,
        documentSent.event.hash,
        '00000000-0000-4000-8000-000000000000',
      ),
    ).toBe(false);
  });

  it('rejects the right id over a mutated event.time', () => {
    // A skewed time produces a different hash. A *correct* hash over a skewed time is
    // indistinguishable from a delayed delivery, and convergence makes both harmless
    // (edge case 31) — which is why this is the only skew case worth a test.
    expect(
      verifySignWellHash(
        documentSent.event.type,
        documentSent.event.time + 1,
        documentSent.event.hash,
        WEBHOOK_ID,
      ),
    ).toBe(false);
  });

  it('denies everything when the secret is unset', () => {
    // Failing open on a missing environment variable is how a session-less endpoint
    // becomes a public write during a botched deploy.
    expect(
      verifySignWellHash(documentSent.event.type, documentSent.event.time, documentSent.event.hash, ''),
    ).toBe(false);
    expect(
      verifySignWellHash(
        documentSent.event.type,
        documentSent.event.time,
        documentSent.event.hash,
        undefined,
      ),
    ).toBe(false);
  });

  it('compares in constant time rather than short-circuiting on the first byte', () => {
    // `timingSafeEqual` throws on a length mismatch, so the length is checked first and
    // the digest is compared whole. A hash of the right length that differs in its first
    // character must be refused exactly like one that differs in its last.
    const hash = documentSent.event.hash;
    const firstDiffers = `${hash[0] === '0' ? '1' : '0'}${hash.slice(1)}`;
    const lastDiffers = `${hash.slice(0, -1)}${hash.at(-1) === '0' ? '1' : '0'}`;

    for (const candidate of [firstDiffers, lastDiffers]) {
      expect(candidate).toHaveLength(hash.length);
      expect(
        verifySignWellHash(documentSent.event.type, documentSent.event.time, candidate, WEBHOOK_ID),
      ).toBe(false);
    }
  });

  it('reads the reference and the type out of a delivery, and nothing else', () => {
    const facts = readSignWellNotification(documentSent);

    expect(facts).not.toBeNull();
    expect(facts!.providerRef).toBe(documentSent.data.object.id);
    expect(facts!.eventType).toBe('document_sent');
    expect(facts!.eventTime.getTime()).toBe(documentSent.event.time * 1000);
    // `related_signer` was absent from both captured deliveries, which is why the dedupe
    // key defaults it to the empty string rather than requiring it.
    expect(facts!.relatedSignerEmail).toBe('');
  });

  it('refuses a body that is not a notification', () => {
    expect(readSignWellNotification(null)).toBeNull();
    expect(readSignWellNotification({})).toBeNull();
    expect(readSignWellNotification({ event: {} })).toBeNull();
    expect(readSignWellNotification({ event: { type: '  ' } })).toBeNull();
  });
});

/**
 * The parts of a redacted delivery the cases below read.
 *
 * `redactProviderPayload` returns `unknown` deliberately — it walks a body whose shape is
 * SignWell's, not ours — so these cases narrow it with `readRedacted`, which *checks* that
 * shape at runtime and throws when it differs. The page grouping under `fields` is exactly
 * the detail a cast would hide, and pinning it down is half of why this suite exists.
 */
interface RedactedField {
  api_id: unknown;
  value: unknown;
}

interface RedactedDelivery {
  event: { hash: string; time: number; type: string };
  data: {
    object: {
      /** Page-grouped: an array of pages, each an array of fields. */
      fields: RedactedField[][];
      recipients: Array<{ embedded_signing_url: unknown }>;
      metadata: Record<string, unknown>;
    };
  };
}

const describeValue = (value: unknown): string =>
  value === null ? 'null' : Array.isArray(value) ? 'an array' : typeof value;

function asObject(value: unknown, what: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${what} is not an object (got ${describeValue(value)})`);
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${what} is not an array (got ${describeValue(value)})`);
  }
  return value;
}

/**
 * Redacts a body and narrows the result, verifying every part of the shape first. What
 * comes back is the redactor's own object rather than a rebuilt copy, so `JSON.stringify`
 * over it still covers the whole payload — including any key this interface omits.
 */
function readRedacted(body: unknown): RedactedDelivery {
  const value = redactProviderPayload(body);
  const root = asObject(value, 'the redacted payload');

  const event = asObject(root.event, 'event');
  if (
    typeof event.hash !== 'string' ||
    typeof event.time !== 'number' ||
    typeof event.type !== 'string'
  ) {
    throw new Error('event.hash, event.time and event.type must survive redaction as they arrived');
  }

  const object = asObject(asObject(root.data, 'data').object, 'data.object');
  asArray(object.fields, 'data.object.fields').forEach((page, pageIndex) =>
    asArray(page, `data.object.fields[${pageIndex}]`).forEach((field, index) =>
      asObject(field, `data.object.fields[${pageIndex}][${index}]`),
    ),
  );
  asArray(object.recipients, 'data.object.recipients').forEach((recipient, index) =>
    asObject(recipient, `data.object.recipients[${index}]`),
  );
  asObject(object.metadata, 'data.object.metadata');

  return value as RedactedDelivery;
}

describe('TC-04-UNIT-06: Redaction strips signing URLs and field values from a real payload', () => {
  const redacted = readRedacted(documentSent);
  const serialized = JSON.stringify(redacted);

  it('leaves no embedded_signing_url behind', () => {
    // Each of these is a working link that signs **as** its recipient, sitting next to
    // that recipient's email address. Stored verbatim it would put live signing
    // credentials in a forensics table for as long as the row lives.
    for (const recipient of redacted.data.object.recipients) {
      expect(recipient.embedded_signing_url).toBe(REDACTED);
    }
    expect(serialized).not.toContain('/docs/REDACTED/');
  });

  it('leaves no field value behind, and keeps every api_id', () => {
    // WATCH THE SHAPE: `fields` is an ARRAY OF ARRAYS, page-grouped. A redactor written
    // as `fields.map(f => …)` type-checks against a hand-written interface and silently
    // redacts nothing. `readRedacted` walks that grouping before this case runs, and the
    // page count is asserted here, so a flattened shape fails rather than passing hollow.
    const pages = redacted.data.object.fields;
    expect(pages).toHaveLength(1);
    expect(Array.isArray(pages[0])).toBe(true);

    const fields = pages.flat();
    expect(fields).toHaveLength(3);
    for (const field of fields) {
      expect(field.value === REDACTED || field.value === null).toBe(true);
      expect(typeof field.api_id).toBe('string');
    }
    expect(fields.map((f) => f.api_id)).toEqual(['TextField_1', 'Signature_1', 'Signature_2']);
  });

  it('keeps our own two metadata keys, which are what correlate the row', () => {
    expect(redacted.data.object.metadata.envelope_id).toBe('envelope-under-test');
    expect(redacted.data.object.metadata.organization_id).toBe('organization-under-test');
  });

  it('redacts a foreign metadata key', () => {
    const withForeign = JSON.parse(JSON.stringify(documentSent));
    withForeign.data.object.metadata.customer_reference = 'ACME-SECRET-42';

    const result = readRedacted(withForeign);
    expect(result.data.object.metadata.customer_reference).toBe(REDACTED);
    expect(JSON.stringify(result)).not.toContain('ACME-SECRET-42');
  });

  it('keeps event.hash, event.time and event.type, so a stored row can be re-verified', () => {
    expect(redacted.event.hash).toBe(documentSent.event.hash);
    expect(redacted.event.time).toBe(documentSent.event.time);
    expect(redacted.event.type).toBe(documentSent.event.type);
    expect(
      verifySignWellHash(redacted.event.type, redacted.event.time, redacted.event.hash, WEBHOOK_ID),
    ).toBe(true);
  });

  it('is total: no redacted value survives anywhere in the serialized result', () => {
    // Read as "the redacted value does not appear anywhere in the output". The empty
    // string is skipped because it is a substring of everything and cannot be a leak.
    const secrets = new Set<string>();
    for (const recipient of documentSent.data.object.recipients) {
      if (recipient.embedded_signing_url) secrets.add(recipient.embedded_signing_url);
    }

    const filled = JSON.parse(JSON.stringify(documentSent));
    filled.data.object.fields[0][0].value = 'BY13 ALFA 3014 0000 0100 0000 0000';
    secrets.add('BY13 ALFA 3014 0000 0100 0000 0000');

    const output = JSON.stringify(redactProviderPayload(filled));
    for (const secret of secrets) {
      expect(secret.length).toBeGreaterThan(0);
      expect(output).not.toContain(secret);
    }
  });

  it('does not mutate the payload it was given', () => {
    // Redaction happens before the first write and never on read, so the caller keeps the
    // body it received for verification while only the copy is stored.
    expect(documentSent.data.object.recipients[0].embedded_signing_url).toBe(
      'https://www.signwell.com/docs/REDACTED/',
    );
  });
});
