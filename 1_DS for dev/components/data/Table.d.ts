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
  /** Defaults to 96 on the last column — prod's actions column, §60 — and none elsewhere. */
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
  /** §34 — dims the rows and sets `aria-busy` together, for a list being refiltered in place.
   *  The rows stay and stay clickable; only the header is left alone, because it did not change. */
  busy?: boolean;
  /** §34 — drops the header row, for a short grouped list already named by the surface it sits in. */
  hideHeader?: boolean;
  /** §34 — a node in the row position after the last row, centred. The infinite-scroll load-more
   *  indicator, which prod renders inside the table rather than as a control beneath it. */
  footer?: ReactNode;
}

export function Table<Row = any>(props: TableProps<Row>): JSX.Element;
