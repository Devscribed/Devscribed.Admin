/**
 * The probes that make the UI invariants falsifiable.
 *
 * Each one asserts a **measurement**, not an appearance: a rectangle that did not move, a
 * scroll box that did not grow, a message counted once, content that survived a reload. A
 * screen defect that no assertion here can express is a defect no suite can hold, and belongs
 * in the register as a note rather than as a case.
 *
 * The register these serve is `.claude/skills/ui-invariants/`.
 */

import { expect, type Locator, type Page } from './fixtures';

/** A rectangle, rounded to the pixel. Sub-pixel noise is not motion. */
async function boxOf(locator: Locator): Promise<[number, number, number, number]> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('the element has no box — it is not rendered, or it is display:none');
  return [Math.round(box.x), Math.round(box.y), Math.round(box.width), Math.round(box.height)];
}

/**
 * UI-01, UI-02 — the element is in the same place, at the same size, after `act` as before it.
 *
 * This is the probe for every control positioned by the length of something: a label that names
 * the window it steps, a picker as wide as its selection, a panel that grows a status line, a
 * row whose second line is optional. Assert it on the control that must NOT move, and drive
 * `act` with the thing that changes the content beside it.
 *
 * `settle` is given the change that proves the interaction landed. Without it the measurement
 * can be taken before the render it is meant to judge, and the assertion passes by being early.
 */
export async function expectHoldsBox(
  locator: Locator,
  act: () => Promise<void>,
  settle: () => Promise<unknown>,
): Promise<void> {
  const before = await boxOf(locator);
  await act();
  await settle();
  expect(await boxOf(locator), 'the element moved or resized as a consequence of the interaction (UI-01/UI-02)').toEqual(before);
}

/**
 * UI-04 — opening `act` adds nothing to `scroller`'s scroll box.
 *
 * An absolutely positioned list, a portalled bubble and a transformed region are all drawn
 * outside their own flow, and all three can still be counted by an ancestor that scrolls. The
 * failure looks like a dialog growing a scrollbar the moment a select is opened inside it, and
 * clipping the list it just opened.
 */
export async function expectNoScrollGrowth(
  scroller: Locator,
  act: () => Promise<void>,
  settle: () => Promise<unknown>,
): Promise<void> {
  const before = await scroller.evaluate((el) => el.scrollHeight);
  const width = await scroller.evaluate((el) => el.scrollWidth);
  await act();
  await settle();
  expect(await scroller.evaluate((el) => el.scrollHeight), 'the open overlay is counted in the ancestor scroll box, which will clip it (UI-04)').toBeLessThanOrEqual(before);
  expect(await scroller.evaluate((el) => el.scrollWidth), 'the open overlay widened the ancestor scroll box (UI-04)').toBeLessThanOrEqual(width);
}

/**
 * UI-03 — what is on screen survives a re-read of the same question.
 *
 * `sample` reads something only the current answer can produce — a row's text, a cell count.
 * The assertion is that it never becomes empty while the re-read is in flight: the answer is
 * replaced by the next answer, never by a wait.
 */
export async function expectSurvivesReread(
  sample: () => Promise<number>,
  act: () => Promise<void>,
  settle: () => Promise<unknown>,
): Promise<void> {
  const before = await sample();
  expect(before, 'nothing was on screen before the re-read, so this proves nothing').toBeGreaterThan(0);
  const readings: number[] = [];
  const poll = setInterval(() => { void sample().then((n) => readings.push(n)).catch(() => {}); }, 25);
  try {
    await act();
    await settle();
  } finally {
    clearInterval(poll);
  }
  expect(readings.filter((n) => n === 0), 'the screen was emptied before it was refilled (UI-03)').toEqual([]);
}

/**
 * UI-05 — the message appears exactly once inside `scope`.
 *
 * Never assert a user-facing message by its `data-testid`: an id proves presence and never
 * uniqueness, so a screen that hands the message to a component *and* draws it beside the
 * component passes every id-based assertion while printing the sentence twice.
 *
 * `text` comes from `packages/validation`, never from a literal — a literal in a test is a
 * second copy of the message and drifts from the first.
 */
export async function expectMessageOnce(scope: Locator | Page, text: string): Promise<void> {
  await expect(
    scope.getByText(text, { exact: true }),
    `"${text}" must be drawn exactly once (UI-05)`,
  ).toHaveCount(1);
}

/** UI-05, in the negative: the message is nowhere in `scope`. */
export async function expectMessageAbsent(scope: Locator | Page, text: string): Promise<void> {
  await expect(scope.getByText(text, { exact: true }), `"${text}" must not be drawn (UI-05)`).toHaveCount(0);
}
