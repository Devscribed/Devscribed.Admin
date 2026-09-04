'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, IconButton, InfoBanner, Preloader, ReportControls, ToggleButton } from '@devscribed/ds';
import {
  TIME_OFF_CALENDAR_MESSAGES,
  TIME_OFF_CALENDAR_UNASSIGNED,
  stepTimeOffCalendarAnchor,
  timeOffBandAccessibleName,
  timeOffCalendarWindowRange,
  type TimeOffCalendarScope,
  type TimeOffCalendarWeekStart,
  type TimeOffCalendarWindow,
} from '@devscribed/validation';
import { ChevronLeftIcon, ChevronRightIcon } from '@/layout/icons';
import { PageHeader } from '@/layout/PageHeader';
import { useSession } from '@/layout/session-context';
import { MultiFilter } from '@/reports/ReportFilters';
import type { MemberListResponse } from '../../members/types';
import type { ProjectsResponse } from '../../projects/types';
import type { TimeOffCalendarResponse } from './types';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAY_ABBR = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/** Today in the viewer's own calendar, as `YYYY-MM-DD` — the anchor the screen opens on. */
function todayISO(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function parts(iso: string): { year: number; month: number; day: number; weekday: number } {
  const [year, month, day] = iso.split('-').map(Number);
  return { year, month, day, weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay() };
}

/** `September 2026` under Month, `14 – 27 Sep 2026` under the two week presets. */
function rangeLabel(window: TimeOffCalendarWindow, startDate: string, endDate: string): string {
  const from = parts(startDate);
  const to = parts(endDate);
  if (window === 'month') return `${MONTH_NAMES[from.month - 1]} ${from.year}`;
  if (from.month === to.month && from.year === to.year) {
    return `${from.day} – ${to.day} ${MONTH_ABBR[to.month - 1]} ${to.year}`;
  }
  return (
    `${from.day} ${MONTH_ABBR[from.month - 1]} ${from.year !== to.year ? `${from.year} ` : ''}` +
    `– ${to.day} ${MONTH_ABBR[to.month - 1]} ${to.year}`
  );
}

const SCOPE_SEGMENTS = [
  { value: 'all', label: 'All', testId: 'calendar-scope-all' },
  { value: 'teams', label: 'Teams', testId: 'calendar-scope-teams' },
  { value: 'people', label: 'People', testId: 'calendar-scope-people' },
];

const WINDOW_SEGMENTS = [
  { value: 'week', label: 'Week', testId: 'calendar-window-week' },
  { value: '2weeks', label: '2 weeks', testId: 'calendar-window-2weeks' },
  { value: 'month', label: 'Month', testId: 'calendar-window-month' },
];

/**
 * Time off spec 01 — the wallchart. One row per member, one column per calendar day, a
 * band per absence, and nothing written: every control changes what is asked for and the
 * server answers the whole of it (`holidayIds`, `appliesToAllInView` and the band's edge
 * flags are all its answers, never recomputed here).
 *
 * The window is in-page state and is deliberately **not** in the URL — §Screens.
 *
 * Everything visual is in the `.time-off-calendar` block of `apps/web/app/globals.css`:
 * the three band colours and the pinned column's width the design system does not carry
 * yet (recorded as this spec's DS gaps), plus what an inline style cannot express — the
 * sticky first column and the scroll container below the desktop breakpoint. What stays
 * inline here is only what is data: how many day columns there are, and which of them a
 * cell or a band sits on.
 */
export function CalendarScreen({ orgId }: { orgId: string }) {
  const session = useSession();
  const firstDayOfWeek: TimeOffCalendarWeekStart =
    session.account.firstDayOfWeek === 'Sunday' ? 'Sunday' : 'Monday';

  const [scope, setScope] = useState<TimeOffCalendarScope>('all');
  const [windowPreset, setWindowPreset] = useState<TimeOffCalendarWindow>('month');
  const [anchor, setAnchor] = useState<string>(() => todayISO());
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [memberIds, setMemberIds] = useState<string[]>([]);

  const [data, setData] = useState<TimeOffCalendarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [projects, setProjects] = useState<{ id: string; label: string }[]>([]);
  const [members, setMembers] = useState<{ id: string; label: string }[]>([]);

  const range = useMemo(
    () => timeOffCalendarWindowRange(windowPreset, anchor, firstDayOfWeek),
    [windowPreset, anchor, firstDayOfWeek],
  );

  /* The two pickers' catalogues, from the endpoints every other screen reads them from. */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const response = await fetch(`/api/organizations/${orgId}/projects?status=active`, {
        credentials: 'same-origin',
      });
      if (!response.ok || cancelled) return;
      const body = (await response.json()) as ProjectsResponse;
      if (cancelled) return;
      setProjects(body.projects.map((project) => ({ id: project.id, label: project.name })));
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const response = await fetch(`/api/organizations/${orgId}/members`, {
        credentials: 'same-origin',
      });
      if (!response.ok || cancelled) return;
      const body = (await response.json()) as MemberListResponse;
      if (cancelled) return;
      setMembers(
        body.members
          .filter((member) => member.status === 'active')
          .map((member) => ({ id: member.id, label: member.fullName })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const load = useCallback(
    async (signal: AbortSignal): Promise<void> => {
      // Validation Rules 6 and 7, client-side: a scope with nothing ticked is refused
      // with the message the server would send, without spending the request. The last
      // good grid stays on screen underneath, which is what the banner is drawn above.
      if (scope === 'teams' && projectIds.length === 0) {
        setLoading(false);
        setError(TIME_OFF_CALENDAR_MESSAGES.teamsRequired);
        return;
      }
      if (scope === 'people' && memberIds.length === 0) {
        setLoading(false);
        setError(TIME_OFF_CALENDAR_MESSAGES.peopleRequired);
        return;
      }

      setLoading(true);
      const query = new URLSearchParams({
        startDate: range.startDate,
        endDate: range.endDate,
        scope,
      });
      if (scope === 'teams') for (const id of projectIds) query.append('projectIds', id);
      if (scope === 'people') for (const id of memberIds) query.append('memberIds', id);

      try {
        const response = await fetch(
          `/api/organizations/${orgId}/time-off/calendar?${query.toString()}`,
          { credentials: 'same-origin', signal },
        );
        if (signal.aborted) return;
        if (response.ok) {
          const body = (await response.json()) as TimeOffCalendarResponse;
          if (signal.aborted) return;
          setData(body);
          setError(null);
        } else {
          const body = await response.json().catch(() => null);
          const fields = body?.fields as Record<string, string> | undefined;
          // The endpoint answers with the first failure and nothing else, so the banner
          // draws the one message that arrived.
          setError(fields ? Object.values(fields)[0] : (body?.message ?? null));
        }
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        setError(TIME_OFF_CALENDAR_MESSAGES.emptyStateBody);
      }
      if (signal.aborted) return;
      setLoading(false);
    },
    [orgId, range.startDate, range.endDate, scope, projectIds, memberIds],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const days = data?.days ?? [];
  const gridColumns = `var(--name-col) repeat(${Math.max(days.length, 1)}, minmax(0, 1fr))`;
  const columnOf = useCallback(
    (date: string): number => days.findIndex((day) => day.date === date) + 2,
    [days],
  );
  const holidayById = useMemo(
    () => new Map((data?.holidays ?? []).map((holiday) => [holiday.id, holiday])),
    [data],
  );
  const wholeColumnHolidayOn = useCallback(
    (date: string) =>
      (data?.holidays ?? []).find((holiday) => holiday.date === date && holiday.appliesToAllInView),
    [data],
  );

  /** The week bands above the day headers — one cell per ISO week in the window. */
  const weekBands = useMemo(() => {
    const bands: { isoWeek: number; start: number; span: number }[] = [];
    days.forEach((day, index) => {
      const last = bands[bands.length - 1];
      if (last && last.isoWeek === day.isoWeek) last.span += 1;
      else bands.push({ isoWeek: day.isoWeek, start: index + 2, span: 1 });
    });
    return bands;
  }, [days]);

  const hasRows = (data?.members.length ?? 0) > 0;

  return (
    <div className="time-off-calendar" data-testid="time-off-calendar-page">
      <PageHeader
        title="Time off calendar"
        subtitle="Who is away, and when."
        action={
          <div className="time-off-calendar-nav">
            <IconButton
              label="Previous window"
              onClick={() => setAnchor(stepTimeOffCalendarAnchor(windowPreset, anchor, -1))}
              data-testid="calendar-prev"
            >
              <ChevronLeftIcon />
            </IconButton>
            <Button onClick={() => setAnchor(todayISO())} data-testid="calendar-today">
              Today
            </Button>
            <IconButton
              label="Next window"
              onClick={() => setAnchor(stepTimeOffCalendarAnchor(windowPreset, anchor, 1))}
              data-testid="calendar-next"
            >
              <ChevronRightIcon />
            </IconButton>
            <span className="time-off-calendar-range" data-testid="calendar-range-label">
              {rangeLabel(windowPreset, range.startDate, range.endDate)}
            </span>
          </div>
        }
      />

      <ReportControls
        legend="Calendar filters"
        scope={
          <ToggleButton
            label="Scope"
            options={SCOPE_SEGMENTS}
            selectedValue={scope}
            onChange={(value) => setScope(value as TimeOffCalendarScope)}
            style={{ marginBottom: 0 }}
          />
        }
      >
        {scope === 'teams' && (
          <MultiFilter
            label="Teams"
            testId="calendar-teams-picker"
            /* REQ-01-007 — "Unassigned" ticks like a project and may be the only tick. */
            options={[
              { id: TIME_OFF_CALENDAR_UNASSIGNED, label: 'Unassigned' },
              ...projects.map((project) => ({ id: project.id, label: project.label })),
            ]}
            selected={projectIds}
            onChange={setProjectIds}
          />
        )}
        {scope === 'people' && (
          <MultiFilter
            label="People"
            testId="calendar-people-picker"
            options={members.map((member) => ({ id: member.id, label: member.label }))}
            selected={memberIds}
            onChange={setMemberIds}
          />
        )}
        <ToggleButton
          label="Window"
          options={WINDOW_SEGMENTS}
          selectedValue={windowPreset}
          onChange={(value) => setWindowPreset(value as TimeOffCalendarWindow)}
          style={{ marginBottom: 0 }}
        />
      </ReportControls>

      <div className="time-off-calendar-legend" data-testid="calendar-legend">
        <span>
          <i className="time-off-calendar-swatch time-off-calendar-swatch-approved" />
          Vacation · approved
        </span>
        <span>
          <i className="time-off-calendar-swatch time-off-calendar-swatch-pending" />
          Vacation · pending
        </span>
        <span>
          <i className="time-off-calendar-swatch time-off-calendar-swatch-holiday" />
          Public holiday
        </span>
        <span>
          <i className="time-off-calendar-swatch time-off-calendar-swatch-weekend" />
          Weekend
        </span>
      </div>

      {error && (
        <div className="time-off-calendar-banner" data-testid="calendar-error-banner">
          <InfoBanner variant="error" role="alert">
            {error}
          </InfoBanner>
        </div>
      )}

      {loading && !data ? (
        <Preloader />
      ) : data && !hasRows ? (
        <div className="time-off-calendar-empty" data-testid="calendar-empty-state">
          <div className="time-off-calendar-empty-title">
            {TIME_OFF_CALENDAR_MESSAGES.emptyStateTitle}
          </div>
          <div>{TIME_OFF_CALENDAR_MESSAGES.emptyStateBody}</div>
        </div>
      ) : data ? (
        <div className="time-off-calendar-scroll">
          <div className="time-off-calendar-grid" data-testid="calendar-grid">
            <div className="time-off-calendar-row" style={{ gridTemplateColumns: gridColumns }}>
              <div className="time-off-calendar-who time-off-calendar-corner" style={{ gridColumn: 1 }}>
                Member
              </div>
              {weekBands.map((band) => (
                <div
                  key={`${band.isoWeek}-${band.start}`}
                  className="time-off-calendar-week"
                  style={{ gridColumn: `${band.start} / span ${band.span}` }}
                >
                  W{band.isoWeek}
                </div>
              ))}
            </div>

            <div
              className="time-off-calendar-row time-off-calendar-head"
              style={{ gridTemplateColumns: gridColumns }}
            >
              <div className="time-off-calendar-who time-off-calendar-corner" style={{ gridColumn: 1 }} />
              {days.map((day, index) => {
                const whole = wholeColumnHolidayOn(day.date);
                const { day: dayOfMonth, weekday } = parts(day.date);
                return (
                  <div
                    key={day.date}
                    className={[
                      'time-off-calendar-day',
                      day.isWeekend ? 'is-weekend' : '',
                      whole ? 'is-holiday' : '',
                      day.date === data.range.today ? 'is-today' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={{ gridColumn: index + 2 }}
                    data-testid={`calendar-day-header-${day.date}`}
                  >
                    <em>{WEEKDAY_ABBR[weekday]}</em>
                    <b>{dayOfMonth}</b>
                    {/* REQ-01-030 — a holiday that reaches every row in view shades the
                        whole column AND names itself in the header. A partial one names
                        nothing here (REQ-01-031); it marks its own members' cells. */}
                    {whole && (
                      <i
                        className="time-off-calendar-day-holiday"
                        data-testid={`calendar-day-holiday-${day.date}`}
                      >
                        {whole.name}
                      </i>
                    )}
                  </div>
                );
              })}
            </div>

            {data.members.map((member) => (
              <div
                key={member.membershipId}
                className="time-off-calendar-row"
                style={{ gridTemplateColumns: gridColumns }}
                data-testid={`calendar-member-row-${member.membershipId}`}
              >
                <div className="time-off-calendar-who" style={{ gridColumn: 1 }}>
                  <span className="time-off-calendar-who-text">
                    <b>{member.displayName}</b>
                    <i>{member.jobTitle ?? ''}</i>
                  </span>
                </div>

                {days.map((day, index) => {
                  // The holiday markers this member's own row carries. Drawn for every
                  // holiday that reached them, whole-column or not: the column shading is
                  // what a whole-column holiday adds, not what it replaces.
                  const holiday = member.holidayIds
                    .map((id) => holidayById.get(id))
                    .find((row) => row?.date === day.date);
                  return (
                    <div
                      key={day.date}
                      className={[
                        'time-off-calendar-cell',
                        day.isWeekend ? 'is-weekend' : '',
                        holiday ? 'is-holiday' : '',
                        day.date === data.range.today ? 'is-today' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      style={{ gridColumn: index + 2 }}
                      {...(holiday
                        ? {
                            'data-testid': `calendar-cell-holiday-${member.membershipId}-${day.date}`,
                            title: holiday.name,
                          }
                        : {})}
                    />
                  );
                })}

                {member.absences.map((absence) => {
                  // REQ-01-023 — ONE element from the band's first visible day to its
                  // last, weekends and holidays inside it included. The clipping is the
                  // window's, and the accessible name carries the request's true dates.
                  const from = absence.startsBeforeWindow ? 2 : columnOf(absence.startDate);
                  const to = absence.endsAfterWindow ? days.length + 1 : columnOf(absence.endDate);
                  if (from < 2 || to < from) return null;
                  return (
                    <button
                      key={absence.id}
                      type="button"
                      className={`time-off-calendar-band is-${absence.status}`}
                      style={{ gridColumn: `${from} / span ${to - from + 1}` }}
                      aria-label={timeOffBandAccessibleName(absence)}
                      title={timeOffBandAccessibleName(absence)}
                      data-testid={`calendar-absence-${absence.id}`}
                    >
                      <span>{absence.workingDays} d</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
