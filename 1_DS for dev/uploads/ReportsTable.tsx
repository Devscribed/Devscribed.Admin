import React, { FC, memo } from 'react';
import {
  IReportsTableColumnHeading,
  ITimeAndActivityReportsGroup,
} from 'features/timeAndActivityReports/timeAndActivityReportsTypes';
import ReportsGroupBody from './ReportsGroupBody';
import TableHeadItem from './TableHeadItem';
import styles from './ReportsTable.module.scss';

interface ReportsTableProps {
  data: ITimeAndActivityReportsGroup[];
  tableHeaders: IReportsTableColumnHeading[];
}

const ReportsTable: FC<ReportsTableProps> = ({ data, tableHeaders }) => {
  return (
    <>
      <div className={styles.wrapper}>
        <table className={styles.tableGeneral}>
          <thead>
            <tr className={styles.tableGeneralHeader}>
              {tableHeaders.map((item) => (
                <TableHeadItem key={item.title} item={item} />
              ))}
            </tr>
          </thead>

          {data.map((group) => (
            <ReportsGroupBody
              key={group.id}
              group={group}
              tableHeaders={tableHeaders}
            />
          ))}
        </table>
      </div>
    </>
  );
};

export default memo(ReportsTable);
