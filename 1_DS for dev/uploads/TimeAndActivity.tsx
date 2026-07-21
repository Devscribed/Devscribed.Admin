import React, { FC, useEffect, useState } from 'react';
import {
  createSearchParams,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import { useSelector } from 'react-redux';
import { IoCloudDownloadOutline } from 'react-icons/io5';
import isEmpty from 'lodash.isempty';
import { addDays } from 'date-fns';
import { useAppDispatch } from 'app/store';
import TimeAndActivityReportsFilter from 'components/reports/timeAndActivity/TimeAndActivityReportsFilter';
import CustomDateRangePicker from 'components/shared/forms/CustomDateRangePicker';
import EmptyStatePlaceholder from 'components/shared/EmptyStatePlaceholder';
import { IDateRangeData } from 'components/shared/forms/CustomDateRangePicker/CustomDateRangePicker';
import ReportFieldsFilter from 'components/reports/timeAndActivity/ReportFieldsFilter';
import SummaryBanner from 'components/reports/SummaryBanner';
import ReportsTable from 'components/reports/timeAndActivity/ReportsTable';
import { IPageTab } from 'components/shared/PageTabs/PageTabs';
import MenuDrawer from 'components/shared/MenuDrawer';
import PageTitle from 'components/shared/PageTitle';
import Preloader from 'components/shared/Preloader';
import PageTabs from 'components/shared/PageTabs';
import Button from 'components/shared/Button';
import {
  IGetTimeAndActivityReportsParams,
  TimeAndActivityReportsParamsForDownloading,
} from 'features/timeAndActivityReports/timeAndActivityReportsTypes';
import {
  exportTimeAndActivityReports,
  getTimeAndActivityReports,
} from 'features/timeAndActivityReports/timeAndActivityReportsActions';
import { organizationInfoSelector } from 'features/organization/organizationSlice';
import { permissionsUserSelector } from 'features/user/userSlice';
import { getProjectsFilterList } from 'features/projectsFilterList/projectsFilterListActions';
import { getMembersFilterList } from 'features/membersFilterList/membersFilterListActions';
import { getClientsFilterList } from 'features/clientsFilterList/clientsFilterListActions';
import {
  groupsTableHeadersTimeAndActivitySelector,
  isLoadingTimeAndActivitySelector,
  isReportsDownloadingTimeAndActivitySelector,
  reportsGroupsListTimeAndActivitySelector,
  summaryTimeAndActivitySelector,
} from 'features/timeAndActivityReports/timeAndActivityReportsSlice';
import { dateToISODate } from 'helpers/dateToISODate';
import { noSpaces } from 'helpers/regularExpressions';
import styles from '../Reports.module.scss';

const TimeAndActivity: FC = () => {
  const dispatch = useAppDispatch();
  const reportsGroups = useSelector(reportsGroupsListTimeAndActivitySelector);
  const tableHeaders = useSelector(groupsTableHeadersTimeAndActivitySelector);
  const isLoading = useSelector(isLoadingTimeAndActivitySelector);
  const isReportsDownloading = useSelector(
    isReportsDownloadingTimeAndActivitySelector
  );
  const summary = useSelector(summaryTimeAndActivitySelector);
  const permissions = useSelector(permissionsUserSelector);
  const { name: organizationName, timeZone } = useSelector(
    organizationInfoSelector
  );
  const summaryHours = summary.find((el) => el.label === 'Hours');
  const noData = summaryHours?.value === '0:00:00' || summary.length === 0;
  const { pathname } = useLocation();
  const myReportsPage = pathname.endsWith('/my');
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const tabsData = [
    {
      path: `/reports/time-and-activity/my${location.search}`,
      name: 'Me',
    },
    {
      path: `/reports/time-and-activity${location.search}`,
      name: 'All',
    },
  ];

  let tabsWithPermissions: IPageTab[] = tabsData;

  const isMyReportAvailable = permissions?.some(
    (el) => el.name === 'View My Time and activity'
  );
  const isAllReportsAvailable = permissions?.some(
    (el) => el.name === 'View Time and activity'
  );

  if (!isMyReportAvailable) {
    tabsWithPermissions = tabsData.filter((el) => el.name !== 'My');
  }
  if (!isAllReportsAvailable) {
    tabsWithPermissions = tabsData.filter((el) => el.name !== 'All');
  }

  //date range filter
  const [filtersOpen, setFiltersOpen] = useState(false);
  const startParam = searchParams.get('startDate');
  const endParam = searchParams.get('endDate');
  const defaultStart = startParam
    ? new Date(startParam)
    : addDays(new Date(), -7);
  const defaultEnd = endParam ? new Date(endParam) : new Date();
  const [dateRange, setDateRange] = useState<IDateRangeData>({
    start: defaultStart,
    end: defaultEnd,
  });

  const onDateRangeChange = (dates: [Date, Date]) => {
    const [start, end] = dates;
    setDateRange({ start, end });
  };
  const handleDateRangeFilterApply = () => {
    const params = Object.fromEntries([...Array.from(searchParams)]);
    const URLSearchParams = {
      ...params,
      startDate: dateToISODate(dateRange.start),
      endDate: dateToISODate(dateRange.end),
      columns: searchParams.getAll('columns'),
      clientsIds: searchParams.getAll('clientsIds'),
      projectsIds: searchParams.getAll('projectsIds'),
      membersIds: searchParams.getAll('membersIds'),
    };

    navigate({
      pathname: pathname,
      search: createSearchParams(URLSearchParams).toString(),
    });
  };

  const handleExportReport = () => {
    const requestParams: TimeAndActivityReportsParamsForDownloading = {
      isMyReports: myReportsPage,
      startDate: '',
      endDate: '',
      organizationName,
      reportType: 'timeAndActivity',
    };

    const startDateQuery = searchParams.get('startDate');
    const endDateQuery = searchParams.get('endDate');
    const columnsQuery = searchParams
      .getAll('columns')
      .map(
        (column) =>
          column.charAt(0).toLowerCase() + column.slice(1).replace(noSpaces, '')
      );
    const sumDateRangesQuery = searchParams.get('sumDateRanges');
    const clientsQuery = searchParams.getAll('clientsIds');
    const projectsQuery = searchParams.getAll('projectsIds');
    const membersQuery = searchParams.getAll('membersIds');

    if (startDateQuery) requestParams.startDate = startDateQuery;
    if (endDateQuery) requestParams.endDate = endDateQuery;
    if (columnsQuery.length > 0) requestParams.columns = columnsQuery;
    if (sumDateRangesQuery) requestParams.sumDateRanges = sumDateRangesQuery;
    if (clientsQuery.length > 0) requestParams.clientsIds = clientsQuery;
    if (projectsQuery.length > 0) requestParams.projectsIds = projectsQuery;
    if (membersQuery.length > 0) requestParams.membersIds = membersQuery;

    dispatch(exportTimeAndActivityReports(requestParams));
  };

  useEffect(() => {
    dispatch(getProjectsFilterList());
    dispatch(getClientsFilterList());
    dispatch(getMembersFilterList());
  }, []);
  useEffect(() => {
    const params = Object.fromEntries([...Array.from(searchParams)]);
    if (!isEmpty(params)) {
      const requestParams = {} as IGetTimeAndActivityReportsParams;

      requestParams.isMyReports = myReportsPage;
      const startDateQuery = searchParams.get('startDate');
      const endDateQuery = searchParams.get('endDate');
      const columnsQuery = searchParams
        .getAll('columns')
        .map(
          (column) =>
            column.charAt(0).toLowerCase() +
            column.slice(1).replace(noSpaces, '')
        );
      const sumDateRangesQuery = searchParams.get('sumDateRanges');
      const clientsQuery = searchParams.getAll('clientsIds');
      const projectsQuery = searchParams.getAll('projectsIds');
      const membersQuery = searchParams.getAll('membersIds');

      if (startDateQuery) requestParams.startDate = startDateQuery;
      if (endDateQuery) requestParams.endDate = endDateQuery;
      if (columnsQuery.length > 0) requestParams.columns = columnsQuery;
      if (sumDateRangesQuery) requestParams.sumDateRanges = sumDateRangesQuery;
      if (clientsQuery.length > 0) requestParams.clientsIds = clientsQuery;
      if (projectsQuery.length > 0) requestParams.projectsIds = projectsQuery;
      if (membersQuery.length > 0) requestParams.membersIds = membersQuery;

      dispatch(getTimeAndActivityReports(requestParams));
    }
  }, [searchParams, pathname]);

  useEffect(() => {
    const params = Object.fromEntries([...Array.from(searchParams)]);

    if (isEmpty(params)) {
      const URLSearchParams = {
        startDate: dateToISODate(dateRange.start),
        endDate: dateToISODate(dateRange.end),
        columns: ['Project', 'Member', 'Time'],
      };

      navigate({
        pathname: pathname,
        search: createSearchParams(URLSearchParams).toString(),
      });
    }
  }, [pathname]);

  return (
    <>
      <div className={styles.controls}>
        <PageTabs tabsData={tabsWithPermissions} />

        <div className={styles.datesRangeContainer}>
          <div className={styles.datesRangeWrapper}>
            <CustomDateRangePicker
              startDate={dateRange.start}
              endDate={dateRange.end}
              handleOnChange={onDateRangeChange}
            />
          </div>
          <div>
            <Button
              onClick={handleDateRangeFilterApply}
              disabled={!dateRange.start || !dateRange.end}
            >
              Apply
            </Button>
          </div>
        </div>

        <div>
          <Button variant="primary" onClick={() => setFiltersOpen(true)}>
            Filters
          </Button>
        </div>
      </div>

      <MenuDrawer open={filtersOpen} onClose={() => setFiltersOpen(false)}>
        <TimeAndActivityReportsFilter
          closeFilters={() => setFiltersOpen(false)}
        />
      </MenuDrawer>

      {isLoading ? (
        <Preloader />
      ) : (
        <>
          {noData ? (
            <EmptyStatePlaceholder>
              No reports matching your filter parameters.
            </EmptyStatePlaceholder>
          ) : (
            <>
              <div className={styles.summaryWrapper}>
                <SummaryBanner summary={summary} />
              </div>
              <div className={styles.tableTitle}>
                <PageTitle title={organizationName} />
                <div className={styles.orgTimeZone}>{timeZone.name}</div>
                <button
                  aria-label="Export report"
                  onClick={handleExportReport}
                  className={styles.export}
                  disabled={isReportsDownloading}
                >
                  <IoCloudDownloadOutline />
                  <span>Export</span>
                </button>
                {isReportsDownloading && <Preloader />}
              </div>
              <div className={styles.tableFilterWrapper}>
                <ReportFieldsFilter />
              </div>
              <ReportsTable data={reportsGroups} tableHeaders={tableHeaders} />
            </>
          )}
        </>
      )}
    </>
  );
};

export default TimeAndActivity;
