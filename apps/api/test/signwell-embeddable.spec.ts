import { embeddable } from '../src/signature/signwell/signwell-signing-provider';

/**
 * TC-04-INT-26 — the adapter hands the page a URL a browser will frame.
 *
 * `embedded_signing_url` is the ordinary signing page and the provider serves it with
 * `X-Frame-Options: SAMEORIGIN`; it drops the header only for
 * `signwell_embedded_iframe=1` (BUG-003). Nothing above the adapter should have to know
 * that, so the adapter is where it is asserted.
 */
describe('TC-04-INT-26: the signing URL is made embeddable before it leaves the adapter', () => {
  it('adds the parameter the provider requires', () => {
    expect(embeddable('https://www.signwell.com/docs/eef953bce8/')).toBe(
      'https://www.signwell.com/docs/eef953bce8/?signwell_embedded_iframe=1',
    );
  });

  it('keeps a query string the URL already carries', () => {
    const url = embeddable('https://www.signwell.com/docs/abc/?foo=1&bar=2');
    const parsed = new URL(url as string);
    expect(parsed.searchParams.get('foo')).toBe('1');
    expect(parsed.searchParams.get('bar')).toBe('2');
    expect(parsed.searchParams.get('signwell_embedded_iframe')).toBe('1');
  });

  it('does not add the parameter twice', () => {
    const once = embeddable('https://www.signwell.com/docs/abc/');
    expect(embeddable(once)).toBe(once);
  });

  it('passes a missing URL through as null, so no caller frames the string "null"', () => {
    expect(embeddable(null)).toBeNull();
    expect(embeddable(undefined)).toBeNull();
    expect(embeddable('')).toBeNull();
  });

  it('returns a URL it cannot parse untouched, so the failure is a refused frame and not a mangled address', () => {
    expect(embeddable('not a url')).toBe('not a url');
  });
});

import { toProviderUnits } from '../src/signature/signwell/signwell-signing-provider';

/**
 * TC-04-INT-27 — the field list leaves in the provider's units.
 *
 * The execution-page grid is in PDF points, because that is what the renderer lays out in.
 * SignWell places fields in CSS pixels at 96dpi: its viewer draws A4 794 pixels wide, not
 * 595 points. Sending points is accepted, stored and echoed back unchanged, and draws the
 * signature a third of a page above its line (BUG-003) — so nothing but this assertion and
 * a person looking at the document can catch it.
 */
describe('TC-04-INT-27: box geometry is converted to the provider’s units', () => {
  it('converts points to 96dpi pixels', () => {
    expect(toProviderUnits(72)).toBe(96);
    expect(toProviderUnits(595.28)).toBeCloseTo(793.71, 1);
  });

  it('places the first execution-page row where its signature line starts', () => {
    // The grid's first row: contentTop 86.7 + heading 48 + offset 2 = 136.7pt.
    expect(toProviderUnits(136.7)).toBe(182.27);
  });

  it('keeps the box a box: width and height scale with the origin', () => {
    expect(toProviderUnits(240)).toBe(320);
    expect(toProviderUnits(36)).toBe(48);
    expect(toProviderUnits(81)).toBe(108);
  });

  it('rounds to two places, so no coordinate arrives as a long float', () => {
    expect(String(toProviderUnits(208.7))).toBe('278.27');
  });
});
