import { ComponentType, HTMLAttributes, MouseEvent, ReactNode } from 'react';

export interface SidebarSubItem {
  label: string;
  /** Real destination. Without one the row falls back to prod's own `href="#"`. */
  href?: string;
  testId?: string;
  /** Overrides the `activeSub` match — pass it when a router owns the current-row question. */
  active?: boolean;
}

export interface SidebarItem {
  type: 'link' | 'submenu';
  title: string;
  Icon: ComponentType<{ [key: string]: unknown }>;
  /** `link` only. */
  href?: string;
  /** `link` only. */
  testId?: string;
  /** `submenu` only. Strings are prod's own shape; objects carry routing. */
  subs?: (string | SidebarSubItem)[];
  /** Overrides the `active` title match. */
  active?: boolean;
}

export interface SidebarProps extends Omit<HTMLAttributes<HTMLElement>, 'onSelect'> {
  /** Navigation content. Defaults to Teamplay's own seven groups. */
  items?: SidebarItem[];
  active?: string;
  /** Sub-item of the active section to highlight (defaults to the section's first sub-item). */
  activeSub?: string;
  onSelect?: (title: string, sub?: string) => void;
  /**
   * Runs before the row's own handler on every click, with the row's `href`. Call
   * `preventDefault()` to keep the navigation client-side; leave it alone and the browser
   * follows the link.
   */
  onNavigate?: (event: MouseEvent, href?: string) => void;
  /** Logo click — in prod the wordmark is a `<Link to="/">` to the start page. */
  onLogoClick?: () => void;
  /** Destination for the wordmark, so it is a real link rather than a click handler. */
  logoHref?: string;
  /** Closes the drawer below the breakpoint; wires prod's hidden "Close sidebar" button. */
  onClose?: () => void;
  /** Accessible name for the navigation landmark. Default "Main". */
  label?: string;
  children?: ReactNode;
}

export function Sidebar(props: SidebarProps): JSX.Element;
