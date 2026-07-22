import React, { FC } from 'react';
import { Tooltip as ReactTooltip } from 'react-tooltip';
import {
  IReportsTableColumnHeading,
  ITimeAndActivityReport,
} from 'features/timeAndActivityReports/timeAndActivityReportsTypes';
import { numToCurrencyWithLocale } from 'helpers/numToCurrencyWithLocale';
import { truncateString } from 'helpers/truncateString';

interface TableRowItemProps {
  item: ITimeAndActivityReport;
  columns: IReportsTableColumnHeading[];
}

export const ProjectReportsGroup: FC<TableRowItemProps> = ({
  item,
  columns,
}) => {
  const normalizedItems = item.detailedReport.map((report) => ({
    project: item.project,
    client: item.client,
    ...report,
  }));

  const projectGroupHeaderRow = normalizedItems[0];
  const remainingGroupRows = normalizedItems.slice(1);

  return (
    <>
      {projectGroupHeaderRow && (
        <tr>
          {columns.map((col) => {
            if (col.value === 'notes') {
              return (
                <>
                  <td
                    id="notes"
                    key={col.value}
                    data-tooltip-content={projectGroupHeaderRow[col.value]}
                  >
                    {projectGroupHeaderRow[col.value].length > 0
                      ? truncateString(projectGroupHeaderRow[col.value], 20)
                      : ''}
                  </td>
                  <ReactTooltip
                    anchorId="notes"
                    place="top"
                    style={{ maxWidth: '300px' }}
                  />
                </>
              );
            }
            return (
              <td key={col.value}>
                {col.value === 'billedAmount'
                  ? numToCurrencyWithLocale(
                      projectGroupHeaderRow[col.value],
                      'USD',
                      'en-US'
                    )
                  : projectGroupHeaderRow[col.value]}
              </td>
            );
          })}
        </tr>
      )}

      {!!remainingGroupRows.length &&
        remainingGroupRows.map((item) => (
          <tr key={item.id}>
            {columns.map((col) => {
              return (
                <td key={col.value}>
                  {col.value === 'billedAmount'
                    ? numToCurrencyWithLocale(item[col.value], 'USD', 'en-US')
                    : col.value === 'client' || col.value === 'project'
                    ? ''
                    : item[col.value]}
                </td>
              );
            })}
          </tr>
        ))}
    </>
  );
};

export default ProjectReportsGroup;
