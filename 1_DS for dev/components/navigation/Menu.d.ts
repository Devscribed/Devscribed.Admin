import * as React from 'react';

export interface MenuItem {
  key?: string;
  label: React.ReactNode;
  onSelect?: () => void;
  /** Shown but not activatable, and still focusable so its `tooltip` can be reached. */
  disabled?: boolean;
  /** The reason it is disabled. Rendered as a `Tooltip` and referenced by `aria-describedby`. */
  tooltip?: React.ReactNode;
  tooltipTestId?: string;
  tone?: 'default' | 'danger';
  testId?: string;
}

export interface MenuProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  items: MenuItem[];
  /** Accessible name for the trigger and the menu. Defaults to "Actions". */
  label?: string;
  /** Replaces the default ⋮ glyph. */
  trigger?: React.ReactNode;
  /** Which edge the popover aligns to. Defaults to `right`. */
  align?: 'left' | 'right';
  style?: React.CSSProperties;
}

/**
 * Dropdown menu with the full keyboard contract: `Escape` closes and returns focus to
 * the trigger, arrows and `Home`/`End` move, and a disabled item stays reachable so the
 * reason it is disabled can be read. Props beyond the named ones land on the trigger,
 * matching `Select`.
 */
export declare function Menu(props: MenuProps): JSX.Element;
