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
  /** §22 — the reason, drawn under the label and wired as the row's `aria-describedby`. */
  description?: ReactNode;
  descriptionTestId?: string;
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
