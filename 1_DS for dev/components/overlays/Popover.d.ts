import { ButtonHTMLAttributes, ReactNode } from 'react';

export interface PopoverItem {
  label: ReactNode;
  /** React key and identity. Falls back to `label`. */
  key?: string;
  /** §22 — `onSelect` is §16's name for the same thing; `onClick` is blue's own. Either works. */
  onSelect?: () => void;
  onClick?: () => void;
  danger?: boolean;
  /** §22 — blocked rather than removed: `aria-disabled`, still focusable, not activatable. */
  disabled?: boolean;
  /** §22 — a second line under the label, saying what the row is *about*. Wired as the row's
   *  `aria-describedby`. For *why a row cannot be used*, see `tooltip`. */
  description?: ReactNode;
  descriptionTestId?: string;
  /** §62 — why this row is blocked, in a `Tooltip` bubble to the left of the menu, on hover
   *  and on focus. Also the row's `aria-describedby`; a row never carries both. */
  tooltip?: ReactNode;
  /** `data-testid` for the reason. It rides the always-present copy, not the bubble. */
  tooltipTestId?: string;
  testId?: string;
}

export interface PopoverProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onSelect'> {
  /** Omit to render ActionsPopover's own 32x32 kebab circle. */
  trigger?: ReactNode;
  items?: (PopoverItem | string)[];
  align?: 'left' | 'right';
  /** `.disabledBtn`: not-allowed cursor, no hover colour change, menu cannot open. */
  disabled?: boolean;
  /** §22 — accessible name for the trigger and the menu. Defaults to `Actions` on the kebab. */
  label?: string;
}

export function Popover(props: PopoverProps): JSX.Element;
