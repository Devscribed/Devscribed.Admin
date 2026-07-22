import React, { FC } from 'react';
import { IReportsTableColumnHeading } from 'features/timeAndActivityReports/timeAndActivityReportsTypes';

interface TableHeadItemProps {
  item: IReportsTableColumnHeading;
}

const TableHeadItem: FC<TableHeadItemProps> = ({ item }) => {
  return (
    <>
      <th>{item.title}</th>
    </>
  );
};

export default TableHeadItem;
