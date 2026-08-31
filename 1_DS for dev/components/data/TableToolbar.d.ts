import * as React from 'react';

export interface TableToolbarProps {
  tabs?: string[];
  activeTab?: string;
  onTab?: (tab: string) => void;
  search?: string;
  onSearch?: (event: any) => void;
  onClearSearch?: () => void;
  searchPlaceholder?: string;
  searchWidth?: number | string;
  /** Set false on tables with no search. */
  showSearch?: boolean;
  /** Action buttons, right-aligned after the search field. */
  children?: React.ReactNode;
}

export function TableToolbar(props: TableToolbarProps): JSX.Element;
