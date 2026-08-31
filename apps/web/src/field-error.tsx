/** Moves focus to the field the validator named, by its test id. */
export function focusByTestId(testId: string): void {
  document.querySelector<HTMLInputElement>(`[data-testid="${testId}"]`)?.focus();
}
