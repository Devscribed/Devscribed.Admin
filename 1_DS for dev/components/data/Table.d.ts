import * as React from 'react';

export interface TableColumn<Row = any> {
  key?: keyof Row;
  label: React.ReactNode;
  /** Flex ratio inside the row. */
  flex?: number;
  align?: 'flex-start' | 'center' | 'flex-end';
  /** Grotesk 600 for numerals (Meridian pattern). */
  mono?: boolean;
  render?: (row: Row) => React.ReactNode;
}

export interface TableProps<Row = any> {
  columns: TableColumn<Row>[];
  rows: (Row & { id?: string | number; dim?: boolean })[];
  /** Turns each row into a real anchor. A string applies to every row. */
  rowHref?: string | ((row: Row) => string | null | undefined);
  /** `data-testid` for each row — a function so it can carry the row's own id. */
  rowTestId?: string | ((row: Row) => string);
  onRowClick?: (row: Row, event: React.MouseEvent) => void;
  /**
   * A refetch is in flight: dims the body and sets `aria-busy`, leaving the rows in
   * place. Meridian never replaces a filtered table with a spinner — the shape that is
   * already there is what stops the page reflowing under the reader.
   */
  busy?: boolean;
  /**
   * Drops the uppercase header rule, keeping the column widths. For a short list whose
   * columns are self-evident and whose grouping label already names it.
   */
  hideHeader?: boolean;
  style?: React.CSSProperties;
}

/** Simple flex table — uppercase Grotesk header, hover-tinted body rows. */
export declare function Table<Row = any>(props: TableProps<Row>): JSX.Element;
