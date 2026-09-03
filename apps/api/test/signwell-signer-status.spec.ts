import { normalizeSignerStatus } from '../src/signature/signwell/signwell-signing-provider';

/**
 * TC-04-INT-28 — the adapter reads the provider's word for "this person has signed".
 *
 * A SignWell recipient who has signed reads `completed`. The word `signed` appears
 * nowhere in a recipient object, and `Completed` at document level means something else
 * entirely: the whole envelope is finished. Mapping the recipient's word to our `signed`
 * is what lets convergence close a turn and open the next one (BUG-005).
 *
 * Captured from `GET /api/v1/documents/{id}` on a two-signer document after the first
 * signature: `recipients[0].status === 'completed'`, `recipients[1].status === 'sent'`,
 * `document.status === 'Pending'`.
 */
describe('TC-04-INT-28: recipient statuses are read in the provider’s vocabulary', () => {
  it('reads a recipient who has signed', () => {
    expect(normalizeSignerStatus('completed')).toBe('signed');
    expect(normalizeSignerStatus('Completed')).toBe('signed');
  });

  it('reads the rest of the observed vocabulary', () => {
    expect(normalizeSignerStatus('created')).toBe('pending');
    expect(normalizeSignerStatus('waiting')).toBe('pending');
    expect(normalizeSignerStatus('sent')).toBe('notified');
    expect(normalizeSignerStatus('viewed')).toBe('viewed');
    expect(normalizeSignerStatus('declined')).toBe('declined');
  });

  it('treats an absent status as pending without calling it unknown', () => {
    const unknown = jest.fn();
    expect(normalizeSignerStatus(null, unknown)).toBe('pending');
    expect(normalizeSignerStatus(undefined, unknown)).toBe('pending');
    expect(normalizeSignerStatus('', unknown)).toBe('pending');
    expect(unknown).not.toHaveBeenCalled();
  });

  /**
   * The stall is deliberate — advancing on a status we cannot read would move an envelope
   * on a guess — but it must never be silent, which is exactly how this defect survived.
   */
  it('reports a status it does not know instead of swallowing it', () => {
    const unknown = jest.fn();
    expect(normalizeSignerStatus('bounced', unknown)).toBe('pending');
    expect(unknown).toHaveBeenCalledWith('bounced');
  });

  /**
   * `signed` is **not** in the provider's vocabulary. Accepting it would let a double say
   * a word the API never says and pass, which is how every suite stayed green while no
   * second signer could ever be let in.
   */
  it('does not accept a word the provider never sends', () => {
    const unknown = jest.fn();
    expect(normalizeSignerStatus('signed', unknown)).toBe('pending');
    expect(unknown).toHaveBeenCalledWith('signed');
  });
});
