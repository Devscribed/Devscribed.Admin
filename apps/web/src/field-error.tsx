/**
 * The DS `Input` renders its `error` prop as the message node but exposes no way to
 * tag that node. It renders whatever node it is handed, so we hand it a span carrying
 * the spec's `field-error-{fieldName}` test id and the `aria-describedby` target.
 * See the design docs' "DS gaps" — a first-class `errorId` prop belongs in the DS.
 *
 * Shared by every auth form so the cast lives in exactly one place.
 */
export function errorNode(field: string, message: string) {
  return (
    <span id={`field-error-${field}`} data-testid={`field-error-${field}`}>
      {message}
    </span>
  ) as unknown as string;
}

/** `Input`'s `hint` has the same node-typed-as-string problem. */
export function hintNode(id: string, message: string) {
  return (<span id={id}>{message}</span>) as unknown as string;
}

/** The same node where the spec names the id itself, not the `field-error-*` scheme. */
export function errorNodeById(id: string, message: string) {
  return (<span id={id} data-testid={id}>{message}</span>) as unknown as string;
}

/** Moves focus to the field the validator named, by its test id. */
export function focusByTestId(testId: string): void {
  document.querySelector<HTMLInputElement>(`[data-testid="${testId}"]`)?.focus();
}
