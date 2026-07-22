import React, { FC, useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  createSearchParams,
  URLSearchParamsInit,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import CustomCheckbox from 'components/shared/forms/CustomCheckbox';
import Button from 'components/shared/Button';
import { USER_ROLE } from 'features/user/userTypes';
import {
  permissionsUserSelector,
  selectInfoUserSelector,
} from 'features/user/userSlice';
import { ITimeAndActivityReportsURLSearchParams } from 'features/timeAndActivityReports/timeAndActivityReportsTypes';
import ClientsFilter from './ClientsFilter';
import ProjectsFilter from './ProjectsFilter';
import MembersFilter from './MembersFilter';
import styles from './TimeAndActivityReportsFilter.module.scss';

export interface ReportsFilterProps {
  closeFilters: () => void;
}

const TimeAndActivityReportsFilter: FC<ReportsFilterProps> = ({
  closeFilters,
}) => {
  const [searchParams] = useSearchParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isMountedRef = useRef(false);
  const userInfo = useSelector(selectInfoUserSelector);
  const permissions = useSelector(permissionsUserSelector);
  const isMyReportsTab = pathname.endsWith('/my');

  const isMembersFilterAvailable = userInfo?.role !== USER_ROLE.User;
  const isClientsFilterAvailable = permissions?.some(
    (el) => el.name === 'View Clients for Reports'
  );

  const sumDateRangesQuery = searchParams.get('sumDateRanges');
  const defaultSumDateRanges = !!(
    sumDateRangesQuery && sumDateRangesQuery === 'true'
  );

  const [sumDateRanges, setSumDateRanges] = useState(defaultSumDateRanges);
  const handleSumDateRangesChange = () => setSumDateRanges(!sumDateRanges);

  const clearFilters = () => {
    const params = Object.fromEntries([...Array.from(searchParams)]);
    const URLSearchParams: ITimeAndActivityReportsURLSearchParams = {
      ...params,
      columns: searchParams.getAll('columns'),
    };

    delete URLSearchParams.sumDateRanges;
    delete URLSearchParams.clientsIds;
    delete URLSearchParams.projectsIds;
    delete URLSearchParams.membersIds;

    navigate({
      pathname: pathname,
      search: createSearchParams(
        URLSearchParams as URLSearchParamsInit
      ).toString(),
    });
    closeFilters();
  };

  useEffect(() => {
    if (isMountedRef.current) {
      const params = Object.fromEntries([...Array.from(searchParams)]);
      const URLSearchParams: ITimeAndActivityReportsURLSearchParams = {
        ...params,
        columns: searchParams.getAll('columns'),
        clientsIds: searchParams.getAll('clientsIds'),
        projectsIds: searchParams.getAll('projectsIds'),
        membersIds: searchParams.getAll('membersIds'),
      };

      if (sumDateRanges) {
        URLSearchParams.sumDateRanges = String(sumDateRanges);
      } else {
        delete URLSearchParams.sumDateRanges;
      }

      navigate({
        pathname: pathname,
        search: createSearchParams(
          URLSearchParams as URLSearchParamsInit
        ).toString(),
      });
    }
    isMountedRef.current = true;
  }, [sumDateRanges]);

  return (
    <>
      <div className={styles.wrapper}>
        {isClientsFilterAvailable && <ClientsFilter />}
        <ProjectsFilter />
        {isMembersFilterAvailable && !isMyReportsTab && <MembersFilter />}

        <CustomCheckbox
          label="Sum date ranges"
          isChecked={sumDateRanges}
          handleChange={handleSumDateRangesChange}
        />

        <Button onClick={clearFilters}>Clear filters</Button>
      </div>
    </>
  );
};

export default TimeAndActivityReportsFilter;
