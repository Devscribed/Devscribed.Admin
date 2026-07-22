import React, { FC } from 'react';
import {
  IReportsGroupTotalItem,
  IReportsTableColumnHeading,
} from 'features/timeAndActivityReports/timeAndActivityReportsTypes';
import { numToCurrencyWithLocale } from 'helpers/numToCurrencyWithLocale';

interface TotalRowItemProps {
  item: IReportsGroupTotalItem;
  column: IReportsTableColumnHeading;
}

export const TotalRowItem: FC<TotalRowItemProps> = ({ item, column }) => {
  return (
    <>
      <td key={column.value}>
        {column.value === 'billedAmount'
          ? numToCurrencyWithLocale(item[column.value], 'USD', 'en-US')
          : column.value === 'time' ||
            column.value === 'billableTime' ||
            column.value === 'nonBillableTime'
          ? item[column.value]
          : ''}
      </td>
    </>
  );
};

export default TotalRowItem;
