'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  DateRangePicker,
  IconButton,
  InfoBanner,
  ReportControls,
  ToggleButton,
  Tooltip,
} from '@devscribed/ds';
import {
  HOLIDAY_MESSAGES,
  TIME_OFF_CALENDAR_MAX_RANGE_DAYS,
  TIME_OFF_CALENDAR_MESSAGES,
  TIME_OFF_CALENDAR_UNASSIGNED,
  stepTimeOffCalendarAnchor,
  stepTimeOffCalendarRange,
  timeOffBandAccessibleName,
  timeOffCalendarAnchorFromRange,
  timeOffCalendarLoad,
  timeOffCalendarRangeToday,
  timeOffCalendarToday,
  timeOffCalendarWindowRange,
  type TimeOffCalendarRange,
  type TimeOffCalendarScope,
  type TimeOffCalendarWeekStart,
  type TimeOffCalendarWindowChoice,
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

function parts(iso: string): { year: number; month: number; day: number; weekday: number } {
  const [year, month, day] = iso.split('-').map(Number);
  return { year, month, day, weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay() };
}

/**
 * `September 2026` under Month, `14 – 27 Sep 2026` under the two week presets — and under
 * the custom **Range** window the same two-date shape the week presets take, because a span
 * the reader chose by hand is named by its ends and by nothing else.
 */
function rangeLabel(
  window: TimeOffCalendarWindowChoice,
  startDate: string,
  endDate: string,
): string {
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

/* REQ-03-007 — four segments in ONE control: Range is a window, not a mode. */
const WINDOW_SEGMENTS = [
  { value: 'week', label: 'Week', testId: 'calendar-window-week' },
  { value: '2weeks', label: '2 weeks', testId: 'calendar-window-2weeks' },
  { value: 'month', label: 'Month', testId: 'calendar-window-month' },
  { value: 'range', label: 'Range', testId: 'calendar-window-range' },
];

/**
 * §UI Description, Loading — the header rows plus six member rows, drawn in the grid's own
 * geometry so the page does not jump when the answer arrives, and announced as a status so
 * a reader who cannot see it is told the grid is loading rather than empty. The filter bar
 * above stays interactive, which is why this replaces the grid and not the page.
 */
function GridSkeleton() {
  const days = Array.from({ length: 14 });
  // Its OWN template, not the data-derived one: this draws only while `loading && !data`,
  // when `days[]` is empty and that template declares a single day column — fourteen cells
  // would then create thirteen implicit auto tracks and a placeholder sized `width: 100%`
  // inside one resolves against no definite width.
  const columns = `var(--name-col) repeat(${days.length}, minmax(var(--day-col-min), 1fr))`;
  return (
    <div className="time-off-calendar-scroll" role="status" aria-label="Loading the calendar">
      <div className="time-off-calendar-grid time-off-calendar-skeleton" aria-hidden>
        <div className="time-off-calendar-row" style={{ gridTemplateColumns: columns }}>
          <div className="time-off-calendar-who time-off-calendar-corner" style={{ gridColumn: 1 }}>
            Member
          </div>
          {days.map((_, index) => (
            <div key={index} className="time-off-calendar-week" style={{ gridColumn: index + 2 }} />
          ))}
        </div>
        <div
          className="time-off-calendar-row time-off-calendar-head"
          style={{ gridTemplateColumns: columns }}
        >
          <div className="time-off-calendar-who time-off-calendar-corner" style={{ gridColumn: 1 }} />
          {days.map((_, index) => (
            <div key={index} className="time-off-calendar-day" style={{ gridColumn: index + 2 }}>
              <span className="time-off-calendar-shimmer" />
            </div>
          ))}
        </div>
        {Array.from({ length: 6 }).map((_, row) => (
          <div key={row} className="time-off-calendar-row" style={{ gridTemplateColumns: columns }}>
            <div className="time-off-calendar-who" style={{ gridColumn: 1 }}>
              <span className="time-off-calendar-shimmer" />
            </div>
            {days.map((_, index) => (
              <div key={index} className="time-off-calendar-cell" style={{ gridColumn: index + 2 }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Time off spec 01 — the wallchart. One row per member, one column per calendar day, a
 * band per absence, and nothing written: every control changes what is asked for and the
 * server answers the whole of it (`holidayIds`, `appliesToAllInView` and the band's edge
 * flags are all its answers, never recomputed here).
 *
 * The window is in-page state and is deliberately **not** in the URL — §Screens.
 *
 * Everything visual is in the `.time-off-calendar` block of `apps/web/app/globals.css`:
 * the three band colours, the pinned column's width, the reserved range-label width and the
 * day column's floor — none of which the design system carries yet (recorded as the DS gaps
 * of this screen's two specs) — plus what an inline style cannot express: the sticky first
 * column and the scroll container, which holds at every width (REQ-03-018) because a custom
 * range is wider than the page long before a narrow viewport is. What stays inline here is
 * only what is data: how many day columns there are, and which of them a cell or a band
 * sits on.
 */
export function CalendarScreen({ orgId }: { orgId: string }) {
  const session = useSession();
  const firstDayOfWeek: TimeOffCalendarWeekStart =
    session.account.firstDayOfWeek === 'Sunday' ? 'Sunday' : 'Monday';
  /**
   * REQ-01-018 / REQ-01-049 — today is the caller's, read in the zone their ACCOUNT states
   * and never from the browser's clock. The endpoint marks `range.today` from the same
   * field through the same helper; resolving it locally instead put the two a day apart for
   * anybody whose browser is not in their own zone, and the `Today` control then landed on
   * a window that does not hold their today with no marker anywhere to say so.
   */
  const today = (): string => timeOffCalendarToday(session.account.timezone);

  const [scope, setScope] = useState<TimeOffCalendarScope>('all');
  /* REQ-03-007 — four values, of which three are anchor-driven presets and the fourth is
     the reader's own span. The anchor and the custom range are held beside each other so
     that leaving one window for the other carries the position across (REQ-03-013,
     REQ-03-017) rather than resetting it. */
  const [windowChoice, setWindowChoice] = useState<TimeOffCalendarWindowChoice>('month');
  const [anchor, setAnchor] = useState<string>(today);
  const [customRange, setCustomRange] = useState<TimeOffCalendarRange>(() =>
    timeOffCalendarWindowRange('month', today(), firstDayOfWeek),
  );
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [memberIds, setMemberIds] = useState<string[]>([]);

  const [data, setData] = useState<TimeOffCalendarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  /* PATCH-025 — -1, 0 or 1: which side the window on screen was reached from. Only the
     animation reads it. */
  const [travel, setTravel] = useState<-1 | 0 | 1>(0);
  const [error, setError] = useState<string | null>(null);

  const [projects, setProjects] = useState<{ id: string; label: string }[]>([]);
  const [members, setMembers] = useState<{ id: string; label: string }[]>([]);

  const range = useMemo(
    () =>
      windowChoice === 'range'
        ? customRange
        : timeOffCalendarWindowRange(windowChoice, anchor, firstDayOfWeek),
    [windowChoice, customRange, anchor, firstDayOfWeek],
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
      // REQ-03-005 — an empty Teams or People selection spends the request like any other:
      // it is no narrowing at all, not a refusal, so there is nothing to short-circuit and
      // nothing to announce (REQ-03-016).
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
          // TWO branches and no third. A 422 carrying `fields` draws the first of them,
          // which is one of the seven messages this endpoint can answer with; EVERY other
          // outcome draws the generic one. The response's own `message` is never chained
          // between them: on a 404 or a 500 that is Nest's own words — "Not Found",
          // "Internal server error" — which no export of packages/validation holds and no
          // row of the Error Messages table carries.
          setError(fields ? Object.values(fields)[0] : HOLIDAY_MESSAGES.toastServerError);
        }
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        // A read that never happened is NOT a fact about the reader's data:
        // `emptyStateBody` is the answer to a SUCCESSFUL read of nothing, and drawing it
        // here would tell an admin whose organization is full of active members that none
        // of them matches their scope. The shipped generic failure message claims nothing
        // about the rows.
        setError(HOLIDAY_MESSAGES.toastServerError);
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
  // REQ-03-014 — every day column has a floor, so a 92-day window stays legible and the
  // grid scrolls (REQ-03-018) rather than dividing the page into unreadable slivers.
  const gridColumns =
    `var(--name-col) repeat(${Math.max(days.length, 1)}, minmax(var(--day-col-min), 1fr))`;
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

  /**
   * PATCH-022 — the window's load, for whoever the filter left on screen. Computed from the
   * answer already in hand: no second request, and it moves with every control on the page
   * because every control changes that answer. The rule itself is in `@devscribed/validation`
   * beside the calendar's others — a figure a manager plans against is not arithmetic a
   * screen should be the only holder of.
   */
  const windowLoad = useMemo(() => {
    if (!data) return null;
    return timeOffCalendarLoad(
      data.days,
      data.members.map((member) => ({
        holidayDates: member.holidayIds
          .map((id) => holidayById.get(id))
          .filter((holiday): holiday is NonNullable<typeof holiday> => !!holiday)
          .map((holiday) => holiday.date),
        absences: member.absences,
      })),
    );
  }, [data, holidayById]);

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

  /**
   * REQ-01-049 — `data` is written once, on the request that answered `200`, and a step of
   * the window re-runs `load` before that answer arrives. Comparing `data.range` against the
   * range the header is showing now is what tells a stale answer from a current one; without
   * it the grid drew whatever last succeeded, however many windows ago that was.
   */
  const isCurrentWindow =
    data !== null && data.range.startDate === range.startDate && data.range.endDate === range.endDate;

  /**
   * REQ-03-011 — `‹` and `›`. Under a preset they move the anchor by that preset's own
   * length; under **Range** they move both ends of the reader's span by the span's length,
   * which is the one arithmetic an anchor cannot express.
   */
  const step = (direction: -1 | 1): void => {
    // PATCH-025 — which way the new window arrives from. Held for the animation and for
    // nothing else, so it never decides what is fetched.
    setTravel(direction);
    if (windowChoice === 'range') setCustomRange(stepTimeOffCalendarRange(customRange, direction));
    else setAnchor(stepTimeOffCalendarAnchor(windowChoice, anchor, direction));
  };

  /** REQ-03-012 — **Today** keeps a custom range's length and starts it on the caller's today. */
  const goToToday = (): void => {
    // A jump, not a step: it fades in place rather than sliding from a side it did not
    // come from.
    setTravel(0);
    if (windowChoice === 'range') setCustomRange(timeOffCalendarRangeToday(customRange, today()));
    else setAnchor(today());
  };

  /**
   * REQ-03-013 / REQ-03-017 — the position crosses the window change in both directions:
   * a preset opens on the window containing the custom range's start, and Range opens on
   * the preset's own current start and end.
   */
  const chooseWindow = (next: TimeOffCalendarWindowChoice): void => {
    if (next === windowChoice) return;
    if (next === 'range') setCustomRange(range);
    else if (windowChoice === 'range') setAnchor(timeOffCalendarAnchorFromRange(customRange));
    setWindowChoice(next);
  };

  return (
    <div className="time-off-calendar" data-testid="time-off-calendar-page">
      <PageHeader
        title="Time off calendar"
        subtitle="Who is away, and when."
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
          selectedValue={windowChoice}
          onChange={(value) => chooseWindow(value as TimeOffCalendarWindowChoice)}
          style={{ marginBottom: 0 }}
        />
        {/* REQ-03-008 — the panel is drawn only while Range is the window, and its two ends
            become the request's `startDate` and `endDate` unchanged: no rounding to a week,
            no clamping to a month. REQ-03-009 — once a start is armed the panel offers no
            end more than 91 days after it, so the span the server refuses is unreachable
            from the control. */}
        {windowChoice === 'range' && (
          <DateRangePicker
            data-testid="calendar-range-picker"
            triggerTestId="calendar-range-picker-trigger"
            label="Range"
            start={customRange.startDate}
            end={customRange.endDate}
            maxSpanDays={TIME_OFF_CALENDAR_MAX_RANGE_DAYS}
            onChange={([from, to]) => setCustomRange({ startDate: from, endDate: to })}
          />
        )}

        <div className="time-off-calendar-nav-slot">
          {/* PATCH-025 — the window's controls sit in the filter row, at its end, because
            they are controls of the same kind: everything that decides what the grid shows is
            now on one line. They stood in the page header, a row above and a different size.

            PATCH-024 — the window's name sits BETWEEN the arrows that move it, and Today
            stands apart as the one control here that is not a step. It used to read
            `‹ Today › September 2026`, which puts the label the arrows change on the far
            side of them and the button that jumps somewhere else in the middle of the
            pair. The label keeps its reserved width, so stepping a month still moves
            nothing but the text. */}
        <div className="time-off-calendar-nav">
          <IconButton
            label="Previous window"
            onClick={() => step(-1)}
            data-testid="calendar-prev"
          >
            <ChevronLeftIcon />
          </IconButton>
          <span className="time-off-calendar-range" data-testid="calendar-range-label">
            {rangeLabel(windowChoice, range.startDate, range.endDate)}
          </span>
          <IconButton
            label="Next window"
            onClick={() => step(1)}
            data-testid="calendar-next"
          >
            <ChevronRightIcon />
          </IconButton>
          <Button
            className="time-off-calendar-today"
            onClick={goToToday}
            data-testid="calendar-today"
          >
            Today
          </Button>
        </div>
        </div>
      </ReportControls>

      {/* PATCH-022 — what the window costs, for the people the filter left on screen. The
          grid says who is away and when; these say how much of the window that is, which is
          the question a manager opens this screen with and had to count columns to answer.
          Every figure is counted from the days the window actually holds, so it moves with
          the scope, the teams, the people and the window and needs no request of its own. */}
      {windowLoad && (
        <div className="time-off-calendar-metrics" data-testid="calendar-metrics">
          <Metric
            testId="calendar-metric-people"
            label="People"
            value={String(windowLoad.people)}
          />
          <Metric
            testId="calendar-metric-working-days"
            label="Working days"
            value={String(windowLoad.workingDays)}
            note="weekends and public holidays already out"
          />
          <Metric
            testId="calendar-metric-time-off"
            label="Time off"
            value={`${windowLoad.approvedDays + windowLoad.pendingDays} d`}
            note={`${windowLoad.approvedDays} approved · ${windowLoad.pendingDays} pending`}
          />
          <Metric
            testId="calendar-metric-available"
            label="Available to work"
            value={`${windowLoad.availableHours} h`}
            note={`${windowLoad.availableDays} days · pending taken out`}
          />
        </div>
      )}

      {/* PATCH-028 — the key, between the figures and the grid.

          PATCH-024 put it under the grid, on the reasoning that a key is read after the
          picture rather than before it. On a full month that reasoning ran into the page:
          the grid is as tall as the window is long, so the key landed against the bottom of
          the viewport, one line high and pinned to the edge, which is where a browser's own
          furniture lives. It reads as something that fell off rather than as part of the
          screen.

          Between the two it is on the way to the grid without being in front of it, and it
          is a block of its own rather than a line of loose text — the same width as the grid
          below, so nothing about it sits outside the edges everything else keeps. */}
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

      {/* PATCH-025 — the window on screen stands until the next one has arrived. Stepping
          used to replace the grid with the skeleton the moment `isCurrentWindow` went false,
          so one press of an arrow drew three different layouts in a blink: the month, a
          fourteen-column placeholder of another width, then the next month. The skeleton
          belongs to the first load, when there is nothing to keep — the rule PATCH-015 put
          on the Holidays screen, arrived at here the hard way.

          While the answer is in flight the grid is dimmed and `aria-busy`, and when it lands
          it is keyed by its own range, so React replaces it and the animation runs: in from
          the side the reader travelled, or a fade in place for a jump. */}
      {data === null ? (
        <GridSkeleton />
      ) : !hasRows && isCurrentWindow ? (
        <div className="time-off-calendar-empty" data-testid="calendar-empty-state">
          <div className="time-off-calendar-empty-title">
            {TIME_OFF_CALENDAR_MESSAGES.emptyStateTitle}
          </div>
          <div>{TIME_OFF_CALENDAR_MESSAGES.emptyStateBody}</div>
        </div>
      ) : (
        <div
          className={`time-off-calendar-scroll${isCurrentWindow ? '' : ' is-busy'}`}
          aria-busy={!isCurrentWindow || undefined}
        >
          <div
            key={`${data.range.startDate}-${data.range.endDate}`}
            className={`time-off-calendar-grid time-off-calendar-enter-${travel > 0 ? 'next' : travel < 0 ? 'prev' : 'still'}`}
            data-testid="calendar-grid"
          >
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
                        nothing here (REQ-01-031); it marks its own members' cells.

                        PATCH-021 — the name is no longer *printed* in the header. A day
                        column is about 40px wide, so `October Revolution Day` set three
                        lines deep, and the header row grew by those lines whenever such a
                        holiday was in view and shrank again when it was not: the whole grid
                        moved between one month and the next. The name is now a marker under
                        the date, taken out of the flow so it adds no height at all, with the
                        name on hover and in the marker's own accessible text. */}
                    {whole && (
                      <Tooltip
                        content={whole.name}
                        /* Downwards. The scroller above clips both axes — `overflow-x: auto`
                           computes `overflow-y` to `auto` — and the header is its top edge,
                           so a bubble drawn upwards is cut in half by it. */
                        placement="bottom"
                        maxWidth={180}
                        style={{
                          position: 'absolute',
                          /* @literal 3px, below the scale: the marker sits against the
                             cell's own bottom padding rather than on the scale's 4px step,
                             which would touch the row rule below it. */
                          bottom: 3,
                          left: '50%',
                          transform: 'translateX(-50%)',
                        }}
                      >
                        {/* The function form, and the `aria-describedby` it offers is
                            deliberately not spread: the marker already carries the name as
                            its own text below, and a description repeating the name reads
                            it twice. */}
                        {() => (
                          <i
                            className="time-off-calendar-day-holiday"
                            data-testid={`calendar-day-holiday-${day.date}`}
                          >
                            <span className="time-off-calendar-day-holiday-name">
                              {whole.name}
                            </span>
                          </i>
                        )}
                      </Tooltip>
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
      )}

    </div>
  );
}

/**
 * PATCH-022 — one figure of the strip: a number, what it is, and where it came from.
 *
 * The note under each is not decoration. `Working days` that quietly dropped the weekends
 * and somebody's public holidays is a number a reader would otherwise have to reverse
 * engineer before trusting, and `Available` that has already taken out the requests nobody
 * has approved yet is a number they would otherwise argue with.
 */
function Metric({
  testId,
  label,
  value,
  note,
}: {
  testId: string;
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="time-off-calendar-metric" data-testid={testId}>
      <span className="time-off-calendar-metric-label">{label}</span>
      <b className="time-off-calendar-metric-value">{value}</b>
      {note && <span className="time-off-calendar-metric-note">{note}</span>}
    </div>
  );
}
