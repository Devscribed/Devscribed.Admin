import { ReactNode } from 'react';
export interface PopoverItem {
  label: string;
  onClick?: () => void;
  danger?: boolean;
}

export interface PopoverProps {
  /** Omit to render ActionsPopover's own 32x32 kebab circle. */
  trigger?: ReactNode;
  items?: PopoverItem[];
  align?: 'left' | 'right';
  /** `.disabledBtn`: not-allowed cursor, no hover colour change, menu cannot open. */
  disabled?: boolean;
}

export function Popover(props: PopoverProps): JSX.Element;
