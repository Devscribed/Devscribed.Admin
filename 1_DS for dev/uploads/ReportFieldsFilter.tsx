import React, { FC, useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { IoIosSettings } from 'react-icons/io';
import { AiOutlineCheck } from 'react-icons/ai';
import {
  createSearchParams,
  URLSearchParamsInit,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import { permissionsUserSelector } from 'features/user/userSlice';
import {
  GroupColumnsType,
  ITimeAndActivityReportsURLSearchParams,
  ITimeAndActivityTableFilterItem,
} from 'features/timeAndActivityReports/timeAndActivityReportsTypes';
import { useClickOutside } from 'hooks/useClickOutside';
import styles from './ReportFieldsFilter.module.scss';

const ReportFieldsFilter: FC = () => {
  const [searchParams] = useSearchParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const permissions = useSelector(permissionsUserSelector);

  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  useClickOutside(popoverRef, () => setOpen(false));
  const columnsFromQuery = searchParams.getAll('columns');

  const isProjectColumnAvailable = !!permissions?.some(
    (el) => el.name === 'ViewTimeAndActivityProjectColumn'
  );
  const isClientColumnAvailable = !!permissions?.some(
    (el) => el.name === 'ViewTimeAndActivityClientColumn'
  );
  const isMemberColumnAvailable = !!permissions?.some(
    (el) => el.name === 'ViewTimeAndActivityMemberColumn'
  );
  const isTimeColumnAvailable = !!permissions?.some(
    (el) => el.name === 'ViewTimeAndActivityTimeColumn'
  );
  const isBillableTimeColumnAvailable = !!permissions?.some(
    (el) => el.name === 'ViewTimeAndActivityBillableTimeColumn'
  );
  const isNonBillableTimeColumnAvailable = !!permissions?.some(
    (el) => el.name === 'ViewTimeAndActivityNonBillableTimeColumn'
  );
  const isBilledAmountColumnAvailable = !!permissions?.some(
    (el) => el.name === 'ViewTimeAndActivityBilledAmountColumn'
  );
  const isNotesColumnAvailable = !!permissions?.some(
    (el) => el.name === 'ViewTimeAndActivityNotesColumn'
  );

  const defaultState: ITimeAndActivityTableFilterItem[] = [
    {
      title: 'Project',
      selected: true,
      required: true,
      isAvailable: isProjectColumnAvailable,
    },
    {
      title: 'Client',
      selected: false,
      required: false,
      isAvailable: isClientColumnAvailable,
    },
    {
      title: 'Member',
      selected: true,
      required: true,
      isAvailable: isMemberColumnAvailable,
    },
    {
      title: 'Time',
      selected: true,
      required: true,
      isAvailable: isTimeColumnAvailable,
    },
    {
      title: 'Billable Time',
      selected: false,
      required: false,
      isAvailable: isBillableTimeColumnAvailable,
    },
    {
      title: 'Non Billable Time',
      selected: false,
      required: false,
      isAvailable: isNonBillableTimeColumnAvailable,
    },
    {
      title: 'Billed Amount',
      selected: false,
      required: false,
      isAvailable: isBilledAmountColumnAvailable,
    },
    {
      title: 'Notes',
      selected: false,
      required: false,
      isAvailable: isNotesColumnAvailable,
    },
  ];
  const requiredFields: Partial<GroupColumnsType>[] = defaultState
    .filter((i) => i.required)
    .map((i) => i.title);

  const defaultFilterState =
    searchParams.getAll('columns').length > 0
      ? defaultState.map((field) => ({
          ...field,
          selected: columnsFromQuery.includes(field.title),
          required: requiredFields.includes(field.title),
        }))
      : defaultState;

  const [filter, setFilter] =
    useState<ITimeAndActivityTableFilterItem[]>(defaultFilterState);

  const toggleColumn = (value: GroupColumnsType) => {
    const newFilter = [...filter];
    const idx = newFilter.findIndex((col) => col.title === value);
    newFilter[idx].selected = !newFilter[idx].selected;
    setFilter(newFilter);
  };

  useEffect(() => {
    const params = Object.fromEntries([...Array.from(searchParams)]);
    const URLSearchParams: ITimeAndActivityReportsURLSearchParams = {
      ...params,
      columns: filter.filter((col) => col.selected).map((col) => col.title),
      clientsIds: searchParams.getAll('clientsIds'),
      projectsIds: searchParams.getAll('projectsIds'),
      membersIds: searchParams.getAll('membersIds'),
    };

    navigate({
      pathname: pathname,
      search: createSearchParams(
        URLSearchParams as URLSearchParamsInit
      ).toString(),
    });
  }, [filter]);

  useEffect(() => {
    setFilter(defaultFilterState);
  }, [permissions]);

  return (
    <div ref={popoverRef} className={styles.wrapper}>
      <button
        onClick={() => setOpen(!open)}
        className={`${styles.btn} ${open ? styles.activeBtn : ''}`}
      >
        <IoIosSettings />
      </button>
      {open && (
        <div className={styles.popover}>
          <ul>
            {filter.map(
              (col) =>
                col.isAvailable && (
                  <li
                    key={col.title}
                    className={`${col.required ? styles.default : ''}`}
                    onClick={() => {
                      if (!col.required) {
                        toggleColumn(col.title);
                      }
                    }}
                  >
                    {col.selected && <AiOutlineCheck />}
                    {col.title}
                  </li>
                )
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

export default ReportFieldsFilter;
