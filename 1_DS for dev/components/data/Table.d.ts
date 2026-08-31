import { HTMLAttributes, MouseEvent, ReactNode } from 'react';

export interface TableColumn<Row = any> {
  label: ReactNode;
  /** Field to read when no `render` is given and rows are records. */
  key?: keyof Row;
  render?: (row: Row) => ReactNode;
  /** Flex ratio. Defaults to an equal share, as in source. */
  flex?: number;
  /** Defaults to prod's positional rule: first left, last right, everything between centred. */
  align?: 'flex-start' | 'center' | 'flex-end';
  /** Defaults to 80 on the last column — prod's actions column — and none elsewhere. */
  maxWidth?: number | 'none';
}

export interface TableProps<Row = any> extends Omit<HTMLAttributes<HTMLDivElement>, 'rows'> {
  /** Strings are prod's own shape; objects carry alignment and a renderer. */
  columns?: (string | TableColumn<Row>)[];
  /** Arrays of cells (prod's shape), or the records themselves when columns say how to read them. */
  rows?: Row[] | ReactNode[][];
  /** A string names the field to read; a function reads the row. Falls back to the index. */
  rowKey?: string | ((row: Row) => string | number);
  /** `data-testid` per row — a function so it can carry the row's own id. */
  rowTestId?: string | ((row: Row) => string | undefined);
  /** Turns each row into a real anchor. A string applies to every row. */
  rowHref?: string | ((row: Row) => string | null | undefined);
  onRowClick?: (row: Row, event: MouseEvent) => void;
  /** Row indices to render grayscale/disabled (matches the source's inactive-member styling). */
  disabledRowIds?: number[];
}

export function Table<Row = any>(props: TableProps<Row>): JSX.Element;
