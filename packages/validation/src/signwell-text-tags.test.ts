import { describe, expect, it } from 'vitest';
import {
  EXECUTION_PAGE,
  UnresolvedPlaceholdersError,
  executionPageRowBox,
  fieldBoxAttributes,
  prepareSignWellDocument,
  readSignWellFieldBoxes,
} from '../../../apps/api/src/documents/signwell-text-tags';

/**
 * Spec 04 requirement 14 — the copy that goes to SignWell, and the field list beside it.
 *
 * The module under test lives in `apps/api` and is imported across the workspace on
 * purpose. It is pure string work with no Nest and no Prisma in it — and no import of the
 * shared validation package either, which is what lets the unit suite load it without a
 * build step. These cases are unit cases by the repository's own rule: building a copy is
 * not a server rule and has no business costing half a second of integration time.
 */

/** The two signers spec 02's fixtures use, in their pinned order. */
const SIGNERS = [
  { roleKey: 'company', order: 1 },
  { roleKey: 'contractor', order: 2 },
];

/**
 * A signature row exactly as `envelope-renderer.ts` writes it, including the box the grid
 * gives row `index`. It is built here rather than imported because the renderer imports the
 * validation package's build output, which this suite deliberately does not depend on; the
 * agreement between that writer and this reader is what TC-04-INT-25 exercises, against the
 * real renderer, on the real send path.
 */
function signatureBlock(roleKey: string, index: number): string {
  return (
    `<div class="signature-slot"${fieldBoxAttributes(
      'signature',
      roleKey,
      executionPageRowBox(index),
    )}>` +
    `<div class="signature-block" data-signer-role="${roleKey}">` +
    `<div class="signature-line"><span class="signature-mark" data-signature-for="${roleKey}"></span></div>` +
    '</div></div>'
  );
}

/** The frozen document's shape: a body, then the marked signature section. */
function frozenDocument(body: string, blocks: string): string {
  return (
    '<html><head></head><body>\n' +
    `<div class="document-body">${body}</div>\n` +
    `<!--signatures:start--><div class="signatures">${blocks}</div><!--signatures:end-->\n` +
    '</body></html>'
  );
}

describe('TC-04-UNIT-01: The copy resolves signer placeholders, and the field list matches the page', () => {
  const SENDER_VALUE = 'AGREEMENT with Alex Kaminski, tax id 191234567.';
  const frozen = frozenDocument(
    `<p>${SENDER_VALUE}</p><p>Note: {{signer_note}}</p>`,
    signatureBlock('contractor', 0),
  );

  const copy = prepareSignWellDocument(frozen, SIGNERS, [
    { key: 'signer_note', roleKey: 'contractor', required: false },
  ]);

  it('binds the signer-owned placeholder to that signer as a text field', () => {
    // The contractor is recipient 2, and the template says the field is not required.
    expect(copy.expectedFields).toContainEqual({
      type: 'text',
      recipientNumber: 2,
      required: false,
      fieldKey: 'signer_note',
    });
  });

  it('leaves a numbered blank where the placeholder was, pointing at its row', () => {
    expect(copy.html).not.toContain('{{signer_note}}');
    expect(copy.html).toContain('<span class="signer-entry-ref">______ [1]</span>');
    expect(copy.html).toContain('[1] signer_note');
  });

  it('emits one signature field for the block that carries data-signer-role', () => {
    expect(copy.expectedFields).toContainEqual({
      type: 'signature',
      recipientNumber: 2,
      required: true,
    });
    expect(copy.expectedFields.filter((field) => field.type === 'signature')).toHaveLength(1);
  });

  it('leaves the sender-substituted text byte-identical', () => {
    // The document is the thing being signed. A copy that touched a word of it would mean
    // the PDF the counterparty signs is not the document that was frozen.
    expect(copy.html).toContain(SENDER_VALUE);
  });

  it('leaves no `{{` behind at all — we emit none', () => {
    expect([...copy.html.matchAll(/\{\{([^{}]*)\}\}/g)]).toHaveLength(0);
  });

  it('hoists the signature section onto an execution page at the front', () => {
    const executionPage = copy.html.indexOf('<div class="signatures execution-page">');
    const documentBody = copy.html.indexOf('<div class="document-body">');

    expect(executionPage).toBeGreaterThan(-1);
    expect(executionPage).toBeLessThan(documentBody);
    // The section it came from is gone, markers and all: one signature section, not two.
    expect(copy.html).not.toContain('<!--signatures:start-->');
    expect(copy.html.split('signature-slot').length - 1).toBe(1);
  });

  it('gives every field a row, and every row the box the grid computes for it', () => {
    const boxes = readSignWellFieldBoxes(copy.html);

    // One signature row, then one entry row — the entry takes the row *after* the
    // signatures, so a signature's box means the same thing whether or not entries exist.
    expect(boxes.map((box) => `${box.kind}:${box.ref}`)).toEqual([
      'signature:contractor',
      'text:signer_note',
    ]);
    expect({ ...boxes[0] }).toEqual({
      kind: 'signature',
      ref: 'contractor',
      ...executionPageRowBox(0),
    });
    expect({ ...boxes[1] }).toEqual({
      kind: 'text',
      ref: 'signer_note',
      ...executionPageRowBox(1),
    });
    // Every field in the list is one of those rows, and there are no spare rows.
    expect(boxes).toHaveLength(copy.expectedFields.length);
  });

  it('numbers one key once however often it appears', () => {
    const twice = frozenDocument(
      '<p>{{signer_note}}</p><p>and again: {{signer_note}}</p>',
      signatureBlock('contractor', 0),
    );
    const result = prepareSignWellDocument(twice, SIGNERS, [
      { key: 'signer_note', roleKey: 'contractor', required: true },
    ]);

    expect(result.expectedFields.filter((field) => field.type === 'text')).toHaveLength(1);
    expect(result.html.split('______ [1]').length - 1).toBe(2);
    expect(readSignWellFieldBoxes(result.html).filter((box) => box.kind === 'text')).toHaveLength(
      1,
    );
  });

  it('refuses a row past the end of the page rather than inventing a coordinate', () => {
    expect(executionPageRowBox(EXECUTION_PAGE.maxRows - 1)).not.toBeNull();
    expect(executionPageRowBox(EXECUTION_PAGE.maxRows)).toBeNull();
    // No box means no attributes, which is what makes the adapter refuse the send instead
    // of placing a signature line in the middle of somebody's contract.
    expect(fieldBoxAttributes('text', 'overflowing', executionPageRowBox(EXECUTION_PAGE.maxRows)))
      .toBe('');
  });
});

describe('TC-04-UNIT-02: A stray placeholder aborts the copy', () => {
  it('throws document_tags_unresolved and names the key', () => {
    const frozen = frozenDocument(
      '<p>Rate: {{unbound_key}}</p>',
      signatureBlock('company', 0),
    );

    let thrown: unknown;
    try {
      prepareSignWellDocument(frozen, SIGNERS, []);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(UnresolvedPlaceholdersError);
    expect((thrown as UnresolvedPlaceholdersError).keys).toEqual(['unbound_key']);
  });

  it('aborts when a signer-owned placeholder names a role nobody fills (edge case 2)', () => {
    // Spec 01's validation should have caught it; this is the second gate, and it is the
    // one that matters, because the placeholder would otherwise print on the contract.
    const frozen = frozenDocument('<p>{{witness_note}}</p>', '');

    expect(() =>
      prepareSignWellDocument(frozen, SIGNERS, [
        { key: 'witness_note', roleKey: 'witness', required: true },
      ]),
    ).toThrow(UnresolvedPlaceholdersError);
  });
});

describe('TC-04-UNIT-03: A sender value containing braces aborts the copy', () => {
  it('names the brace-wrapped text the sender typed', () => {
    // This is the case that would otherwise print `{{tbd}}` on a contract somebody signs,
    // in a document our own hash calls final.
    const frozen = frozenDocument(
      '<p>The rate is {{tbd}} per hour.</p>',
      signatureBlock('company', 0),
    );

    let thrown: unknown;
    try {
      prepareSignWellDocument(frozen, SIGNERS, []);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(UnresolvedPlaceholdersError);
    expect((thrown as UnresolvedPlaceholdersError).keys).toEqual(['tbd']);
    expect((thrown as UnresolvedPlaceholdersError).message).toContain('tbd');
  });
});
