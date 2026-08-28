import { describe, expect, it } from 'vitest';
import {
  UnresolvedPlaceholdersError,
  signatureTag,
  textTag,
  translateToTextTags,
} from '../../../apps/api/src/documents/signwell-text-tags';

/**
 * Spec 04 requirement 14 — the placeholder collision, which is the single most dangerous
 * detail in this integration: SignWell's text tags are delimited by `{{` and `}}`, byte
 * for byte our own placeholder syntax from spec 01.
 *
 * The module under test lives in `apps/api` and is imported across the workspace on
 * purpose. It is pure string work with no Nest and no Prisma in it, and these three cases
 * are unit cases by the repository's own rule — a translation is not a server rule and
 * has no business costing half a second of integration time.
 */

/** The two signers spec 02's fixtures use, in their pinned order. */
const SIGNERS = [
  { roleKey: 'company', order: 1 },
  { roleKey: 'contractor', order: 2 },
];

/** The frozen document as `envelope-renderer.ts` writes it: the slot is empty and named. */
function signatureBlock(roleKey: string): string {
  return (
    `<div class="signature-block" data-signer-role="${roleKey}">` +
    `<div class="signature-line"><span class="signature-mark" data-signature-for="${roleKey}"></span></div>` +
    '</div>'
  );
}

describe('TC-04-UNIT-01: Text-tag translation replaces signer placeholders and nothing else', () => {
  const SENDER_VALUE = 'AGREEMENT with Alex Kaminski, tax id 191234567.';
  const frozen =
    `<p>${SENDER_VALUE}</p><p>Note: {{signer_note}}</p>` + signatureBlock('contractor');

  const translated = translateToTextTags(frozen, SIGNERS, [
    { key: 'signer_note', roleKey: 'contractor', required: false },
  ]);

  it('binds the signer-owned placeholder to that signer as a text tag', () => {
    // The contractor is recipient 2, and `:n` is what makes the field not required.
    expect(translated.html).toContain(textTag(2, false));
    expect(translated.html).not.toContain('{{signer_note}}');
    expect(translated.expectedFields).toContainEqual({
      type: 'text',
      recipientNumber: 2,
      required: false,
      fieldKey: 'signer_note',
    });
  });

  it('emits a signature tag for the block that carries data-signer-role', () => {
    expect(translated.html).toContain(signatureTag(2));
    expect(translated.expectedFields).toContainEqual({
      type: 'signature',
      recipientNumber: 2,
      required: true,
    });
  });

  it('leaves the sender-substituted text byte-identical', () => {
    // The document is the thing being signed. A translation that touched a word of it
    // would mean the PDF the counterparty signs is not the document that was frozen.
    expect(translated.html).toContain(SENDER_VALUE);
  });

  it('leaves no `{{` behind that it did not emit itself', () => {
    const remaining = [...translated.html.matchAll(/\{\{([^{}]*)\}\}/g)].map((m) => m[0]);
    const emitted = new Set([textTag(2, false), signatureTag(2)]);
    expect(remaining.length).toBeGreaterThan(0);
    for (const tag of remaining) expect(emitted.has(tag)).toBe(true);
  });

  it('emits a tag per block when one signer signs in two places (edge case 3)', () => {
    const twice =
      signatureBlock('contractor') + '<p>and again</p>' + signatureBlock('contractor');
    const result = translateToTextTags(twice, SIGNERS, []);

    expect(result.html.split(signatureTag(2)).length - 1).toBe(2);
    expect(result.expectedFields.filter((f) => f.type === 'signature')).toHaveLength(2);
  });
});

describe('TC-04-UNIT-02: A stray placeholder aborts translation', () => {
  it('throws document_tags_unresolved and names the key', () => {
    const frozen = '<p>Rate: {{unbound_key}}</p>' + signatureBlock('company');

    let thrown: unknown;
    try {
      translateToTextTags(frozen, SIGNERS, []);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(UnresolvedPlaceholdersError);
    expect((thrown as UnresolvedPlaceholdersError).keys).toEqual(['unbound_key']);
  });

  it('aborts when a signer-owned placeholder names a role nobody fills (edge case 2)', () => {
    // Spec 01's validation should have caught it; this is the second gate, and it is the
    // one that matters, because the field would be invisible in the signed PDF.
    const frozen = '<p>{{witness_note}}</p>';

    expect(() =>
      translateToTextTags(frozen, SIGNERS, [
        { key: 'witness_note', roleKey: 'witness', required: true },
      ]),
    ).toThrow(UnresolvedPlaceholdersError);
  });
});

describe('TC-04-UNIT-03: A sender value containing braces aborts translation', () => {
  it('names the brace-wrapped text the sender typed', () => {
    // This is the case that would otherwise put an invisible extra field on a signed
    // contract: SignWell does not strip tags, and ours are painted the page background
    // colour, so an unresolved placeholder consumes a field nobody can see.
    const frozen = '<p>The rate is {{tbd}} per hour.</p>' + signatureBlock('company');

    let thrown: unknown;
    try {
      translateToTextTags(frozen, SIGNERS, []);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(UnresolvedPlaceholdersError);
    expect((thrown as UnresolvedPlaceholdersError).keys).toEqual(['tbd']);
    expect((thrown as UnresolvedPlaceholdersError).message).toContain('tbd');
  });
});
