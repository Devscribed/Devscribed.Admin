export interface CircleListItem {
  id: number | string;
  /** Only the first character is rendered inside the circle. */
  label: string;
  isSelected?: boolean;
}

export interface CircleListProps {
  items?: CircleListItem[];
  /** `maxCountCircle` in source — 5. */
  max?: number;
  /** Fires with the currently selected items whenever a circle is clicked. */
  onChange?: (selected: CircleListItem[]) => void;
}

export function CircleList(props: CircleListProps): JSX.Element;
