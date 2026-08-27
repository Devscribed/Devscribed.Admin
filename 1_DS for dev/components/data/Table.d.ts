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

export interface TableProps<Row = any> extends Omit<React.HTMLAttributes<HTMLDivElement>, 'style'> {
  columns: TableColumn<Row>[];
  rows: (Row & { id?: string | number; dim?: boolean; testId?: string })[];
  style?: React.CSSProperties;
  /** Makes every row clickable (cursor: pointer) and calls back with the row's data. */
  onRowClick?: (row: Row) => void;
}

/** Simple flex table — uppercase Grotesk header, hover-tinted body rows. */
export declare function Table<Row = any>(props: TableProps<Row>): JSX.Element;
