/**
 * What is left of this module after the design system arrived.
 *
 * It also held `errorNode` and `hintNode`: two helpers that wrapped a message in a span
 * carrying `field-error-{field}` and an `aria-describedby` id, and then cast the node to a
 * string, because the previous system's `Input` rendered whatever it was handed but offered
 * no way to tag it. `TextInput` has `errorId` and `hintId` of its own (§4), so a screen
 * moved onto it needs neither the wrapper nor the cast — and every screen still importing
 * them is a screen still importing `@/ds`, which is the same list.
 *
 * They are recoverable from git history; nothing here should bring them back.
 */

/** The same node where the spec names the id itself, not the `field-error-*` scheme. */
export function errorNodeById(id: string, message: string) {
  return (<span id={id} data-testid={id}>{message}</span>) as unknown as string;
}

/** Moves focus to the field the validator named, by its test id. */
export function focusByTestId(testId: string): void {
  document.querySelector<HTMLInputElement>(`[data-testid="${testId}"]`)?.focus();
}
