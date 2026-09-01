import { HTMLAttributes, ReactNode } from 'react';

/**
 * §45 — the object form, beside prod's `string[]`. `Table` (§18) took column objects for the
 * same reason and in the same shape: the pair blue measured is what a hand-written kit screen
 * passes, not an API a real screen can use.
 *
 * There is no `count` — a count composes into `label`, and a strip that grew one would then
 * need a badge for it, and an icon.
 */
export interface TabItem {
  /** What `onChange` hands back and what `active` is compared against. */
  value: string;
  /** Drawn inside the uppercase span, so a node composes freely. Defaults to nothing. */
  label?: ReactNode;
  /** §45 — the tab is drawn by the component, so a caller has no other way to name it. */
  testId?: string;
  /** `id` of the panel this tab shows, wired as `aria-controls`. */
  controls?: string;
}

export interface PageTabsProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  tabs?: Array<string | TabItem>;
  /** The chosen tab's value. Omit to let the component hold its own. */
  active?: string;
  onChange?: (value: string) => void;
  /** §45 — accessible name for the tablist. Blue draws the row and names nothing. */
  label?: string;
}

export function PageTabs(props: PageTabsProps): JSX.Element;
