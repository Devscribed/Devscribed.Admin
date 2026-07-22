import React, { FC, useState } from 'react';
import { ArrowIcon } from 'assets/icons/ArrowIcon';
import {
  IReportsTableColumnHeading,
  ITimeAndActivityReportsGroup,
} from 'features/timeAndActivityReports/timeAndActivityReportsTypes';
import ProjectReportsGroup from '../ProjectReportsGroup';
import TotalRowItem from '../TotalRowItem';
import styles from './ReportsGroupBody.module.scss';

interface ReportsGroupBodyProps {
  group: ITimeAndActivityReportsGroup;
  tableHeaders: IReportsTableColumnHeading[];
}

const ReportsGroupBody: FC<ReportsGroupBodyProps> = ({
  group,
  tableHeaders,
}) => {
  const [fullReport, setFullReport] = useState(true);
  const toggleReportView = () => setFullReport(!fullReport);
  return (
    <>
      <tbody className={styles.groupTitle}>
        <tr>
          <td colSpan={tableHeaders.length}>{group.title}</td>
        </tr>
      </tbody>

      <tbody
        className={`${styles.groupTotal} ${
          !fullReport ? styles.collapsedTotal : ''
        }`}
      >
        <tr onClick={toggleReportView}>
          {tableHeaders.map((col, index) => {
            if (index === 0) {
              return (
                <td
                  key={col.title}
                  className={`${styles.totalLabel} ${
                    !fullReport ? styles.collapsedTotalLabel : ''
                  }`}
                >
                  <ArrowIcon />
                  Total
                </td>
              );
            }
            return (
              <TotalRowItem key={col.title} item={group.total} column={col} />
            );
          })}
        </tr>
      </tbody>

      <tbody
        className={`${styles.groupBody} ${
          !fullReport ? styles.collapsedGroupBody : ''
        }`}
      >
        {group.reports.map((item) => (
          <ProjectReportsGroup
            key={item.id}
            item={item}
            columns={tableHeaders}
          />
        ))}
      </tbody>
    </>
  );
};

export default ReportsGroupBody;
