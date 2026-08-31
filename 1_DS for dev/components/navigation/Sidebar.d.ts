/**
 * @startingPoint section="App shell" subtitle="290px Teammerly app sidebar with submenus" viewport="290x700"
 */
export interface SidebarProps {
  active?: string;
  /** Sub-item of the active section to highlight (defaults to the section's first sub-item). */
  activeSub?: string;
  onSelect?: (title: string, sub?: string) => void;
  /** Logo click — in prod the wordmark is a `<Link to="/">` to the start page. */
  onLogoClick?: () => void;
}

export function Sidebar(props: SidebarProps): JSX.Element;
