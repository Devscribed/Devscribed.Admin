export interface PageTabsProps {
  tabs?: string[];
  active?: string;
  onChange?: (tab: string) => void;
}

export function PageTabs(props: PageTabsProps): JSX.Element;
