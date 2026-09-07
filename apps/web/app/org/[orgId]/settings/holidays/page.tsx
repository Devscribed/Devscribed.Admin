'use client';

import { useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  IconButton,
  InfoBanner,
  PageTabs,
  Preloader,
  ReportGroupBody,
  ReportTableHead,
  Select,
  type ReportTableColumn,
} from '@devscribed/ds';
import { CalendarIcon, PencilIcon } from '@/layout/icons';
import { PageHeader } from '@/layout/PageHeader';
import { useSession } from '@/layout/session-context';
import { optionFor, valueOf } from '@/select';
import { useToast } from '@/toast';
import {
  HOLIDAY_MESSAGES,
  HOLIDAY_SOURCING_MESSAGES,
  TIME_OFF_CALENDAR_MESSAGES,
  can,
  type Role,
} from '@devscribed/validation';
import { STATED_COUNTRY_OPTIONS } from '@/stated-country-options';
import { HolidayModal, type HolidayModalMode } from './HolidayModal';
import { HolidaySourcingPanel } from './HolidaySourcingPanel';
import { HolidaySummary } from './HolidaySummary';
import { ALL_COUNTRIES, HOLIDAY_COUNTRY_OPTIONS, holidayCountryLabel } from './country-options';
import type {
  HolidayRow,
  HolidaysResponse,
  HolidaySourcingSettings,
  HolidaySummaryResponse,
  SourcingBlock,
  SourcingState,
  SyncResponse,
} from './types';

/**
 * The organization country picker's list: the option meaning *no country*, which submits
 * `null` (REQ-01-034), then the 249 assigned codes Validation Rule 9 accepts. The empty
 * value is the same one `ALL_COUNTRIES` carries, but it means something else here — not
 * "applies everywhere", which is the holiday form's reading, but "this organization states
 * none", so it is labelled from this spec's own export.
 */
/**
 * PATCH-009 — the width both country selects are drawn at, whatever is chosen in them. A
 * `minWidth` let each control grow to its own value, so picking `Algeria` and picking
 * `No country — global holidays only` gave two differently sized boxes and moved the Save
 * button beside them. Sized for the longest option either list carries. No design-system
 * token names a control width — `MultiFilter` carries its own literal for the same reason.
 */
const ORG_COUNTRY_WIDTH = 300;

const ORG_COUNTRY_OPTIONS = [
  { value: '', label: TIME_OFF_CALENDAR_MESSAGES.orgCountryNoneOption },
  ...STATED_COUNTRY_OPTIONS,
];

/** The year tabs: last year, this year, next year — enough to plan and to correct. */
function yearTabs(current: number): number[] {
  return [current - 1, current, current + 1];
}

/**
 * The chosen option's label, or `''` when the value matches nothing.
 *
 * PATCH-004 — a searchable `Select` hides its own value span while the input carries a
 * query (§21: the value area and the search text share one slot), so the label a sighted
 * reader saw a moment ago is gone from the DOM the instant they start typing again. The
 * wrapper that now carries `data-testid` still has to "contain" it regardless — a
 * screen-reader-only sibling, built the same way `holiday-modal-title` already is, is
 * what keeps it there without drawing it twice for a sighted reader.
 */
function selectedLabel(
  options: { value: string; label: string }[],
  value: string,
): string {
  return options.find((option) => option.value === value)?.label ?? '';
}

/** Visually hidden, but present in the DOM — the same clip technique `holiday-modal-title`
 *  uses, so a wrapper's `toContainText` keeps reading the chosen label mid-search. */
function HiddenSelectedLabel({ label }: { label: string }) {
  return (
    <span
      aria-hidden
      style={{
        position: 'absolute',
        width: 1,
        height: 1,
        overflow: 'hidden',
        clip: 'rect(0 0 0 0)',
      }}
    >
      {label}
    </span>
  );
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** `2026-05-01` → `Fri 1 May` — read as UTC so no zone can shift the day. */
function formatDayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${WEEKDAY_NAMES[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()].slice(0, 3)}`;
}

/**
 * Settings › Holidays (spec organization/03 §Screens). Gated on `view-holidays`:
 * a `user`/`viewer` who types the URL is redirected to Members, the pattern the
 * Clients page uses for the same situation — the API answers them 404 anyway.
 *
 * The list is grouped into month bands. That was a hand-built stack of `role="table"` divs
 * and a recorded DS gap — the system's `Table` still cannot group — but `ReportGroupBody`
 * ([§83]) can, and its own docstring names *a month* as one of the things a band names. So
 * the gap closes by reuse rather than by a new component: one real `<table>`, one set of
 * column widths, a `role="rowheader"` band per month, and tabular figures in every cell,
 * which is also what settles this screen's `--font-mono` columns ([§77]).
 *
 * The band is no longer sticky. `ReportGroupBody`'s model puts stickiness on the head rather
 * than on each band, and where the system has an answer the system wins — D1, layout included.
 */
export default function HolidaysPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  const router = useRouter();
  const session = useSession();
  const { showToast } = useToast();

  const role = session.role as Role;
  const authorized = can(role, 'view-holidays');
  const canManage = can(role, 'manage-holidays');
  const canDelete = can(role, 'delete-holidays');

  useEffect(() => {
    if (!authorized) router.replace(`/org/${orgId}/members`);
  }, [authorized, router, orgId]);

  const thisYear = useMemo(() => new Date().getFullYear(), []);
  const [year, setYear] = useState<number>(thisYear);
  const [country, setCountry] = useState<string>(ALL_COUNTRIES);
  const [holidays, setHolidays] = useState<HolidayRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Time off spec 01 REQ-01-046 — the organization's holiday country, the second link of
  // the chain. Read beside the holiday list the page already fetches, so the picker paints
  // with a value rather than with an invented one.
  const [orgCountry, setOrgCountry] = useState<string>(ALL_COUNTRIES);
  const [savingCountry, setSavingCountry] = useState(false);

  const [modalMode, setModalMode] = useState<HolidayModalMode | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HolidayRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* Time off spec 02 — what the list read says about the year's countries, the summary
     beside it, the sync in flight, and the stored include-organization-country setting. */
  const [sourcing, setSourcing] = useState<SourcingBlock | null>(null);
  const [summary, setSummary] = useState<HolidaySummaryResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryFailed, setSummaryFailed] = useState(false);
  const [syncing, setSyncing] = useState(false);
  /* The year whose sync came back with a country still unsourced (REQ-02-009). Held as a
     year rather than a flag so a sentence about 2026 cannot be read under the 2027 tab. */
  const [syncLeftUnsourced, setSyncLeftUnsourced] = useState<number | null>(null);
  const [includeOrgCountry, setIncludeOrgCountry] = useState(true);
  const [savingSetting, setSavingSetting] = useState(false);
  /* REQ-02-012 issues ONE sync per year. A country the provider will never cover reads
     `unsourced` after the sync too, and without this the re-read would issue another. */
  const autoSynced = useRef<Set<number>>(new Set());
  /* Which sync owns the status line. An abandoned run must not clear a line the run that
     replaced it put up, and a run that was abandoned must not leave one up forever. */
  const syncRun = useRef(0);

  const load = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      setLoading(true);
      setError(false);
      const query = new URLSearchParams({ year: String(year) });
      if (country !== ALL_COUNTRIES) query.set('country', country);
      try {
        const response = await fetch(
          `/api/organizations/${orgId}/holidays?${query.toString()}`,
          { credentials: 'same-origin', signal },
        );
        if (signal?.aborted) return;
        if (response.status === 404) {
          // The capability was lost mid-session; the destination matches the guard above.
          router.replace(`/org/${orgId}/members`);
          return;
        }
        if (response.ok) {
          const data = (await response.json()) as HolidaysResponse;
          if (signal?.aborted) return;
          setHolidays(data.holidays);
          // Present for every caller that reaches this screen (REQ-02-025); `undefined`
          // only if the capability was lost mid-session, which the 404 above handles.
          setSourcing(data.sourcing ?? null);
        } else {
          setHolidays([]);
          setError(true);
        }
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        setHolidays([]);
        setError(true);
      }
      if (signal?.aborted) return;
      setLoading(false);
    },
    [orgId, year, country, router],
  );

  useEffect(() => {
    if (!authorized) return undefined;
    let cancelled = false;
    void (async () => {
      const response = await fetch(`/api/organizations/${orgId}/settings/country`, {
        credentials: 'same-origin',
      });
      if (!response.ok || cancelled) return;
      const body = (await response.json()) as { countryCode: string | null };
      if (cancelled) return;
      setOrgCountry(body.countryCode ?? ALL_COUNTRIES);
    })();
    return () => {
      cancelled = true;
    };
  }, [authorized, orgId]);

  async function handleSaveCountry(): Promise<void> {
    if (savingCountry) return;
    setSavingCountry(true);
    try {
      const response = await fetch(`/api/organizations/${orgId}/settings/country`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ countryCode: orgCountry.length > 0 ? orgCountry : null }),
      });
      if (response.ok) {
        // The picker repaints from what is now STORED, which is the confirmation: no
        // toast, because this spec names neither an id for one nor a line for it to
        // carry, and a message invented here is a message nothing governs.
        const body = (await response.json()) as { countryCode: string | null };
        setOrgCountry(body.countryCode ?? ALL_COUNTRIES);
      } else {
        // The same closed set the calendar's banner draws from: the 422's own field
        // message when it carries one, else the generic. Never `body.message`, which on a
        // 404 or a 500 is Nest's own words and is in no table of this spec.
        const body = await response.json().catch(() => null);
        const fields = body?.fields as Record<string, string> | undefined;
        showToast(
          'toast-server-error',
          fields?.countryCode ?? HOLIDAY_MESSAGES.toastServerError,
          'error',
        );
      }
    } catch {
      showToast('toast-server-error', HOLIDAY_MESSAGES.toastServerError, 'error');
    }
    setSavingCountry(false);
  }

  /**
   * Time off spec 02 REQ-02-013/14/15 — the summary. Its own read and its own wait, so a
   * slow summary never holds the list back and a failed one never blanks it.
   */
  const loadSummary = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      setSummaryLoading(true);
      setSummaryFailed(false);
      try {
        const response = await fetch(
          `/api/organizations/${orgId}/holidays/summary?year=${year}`,
          { credentials: 'same-origin', signal },
        );
        if (signal?.aborted) return;
        if (response.ok) {
          const body = (await response.json()) as HolidaySummaryResponse;
          if (signal?.aborted) return;
          setSummary(body);
        } else {
          setSummary(null);
          setSummaryFailed(true);
        }
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        setSummary(null);
        setSummaryFailed(true);
      }
      if (signal?.aborted) return;
      setSummaryLoading(false);
    },
    [orgId, year],
  );

  useEffect(() => {
    if (!authorized) return undefined;
    // Abort the in-flight read on every year/country change so a slow earlier reply
    // cannot clobber the newer one.
    const controller = new AbortController();
    void load(controller.signal);
    void loadSummary(controller.signal);
    return () => controller.abort();
  }, [authorized, load, loadSummary]);

  /** REQ-02-002 — the stored checkbox, read once beside the list. */
  useEffect(() => {
    if (!authorized) return undefined;
    let cancelled = false;
    void (async () => {
      const response = await fetch(`/api/organizations/${orgId}/settings/holiday-sourcing`, {
        credentials: 'same-origin',
      });
      if (!response.ok || cancelled) return;
      const body = (await response.json()) as HolidaySourcingSettings;
      if (cancelled) return;
      setIncludeOrgCountry(body.includeOrgCountry);
    })();
    return () => {
      cancelled = true;
    };
  }, [authorized, orgId]);

  /**
   * The sync itself. The status line stays up for the request AND the re-reads that
   * follow it, which is what makes the screen settle in one step rather than flickering
   * through a half-filled year.
   */
  const runSync = useCallback(
    async (options: { refresh: boolean; signal?: AbortSignal }): Promise<void> => {
      const run = (syncRun.current += 1);
      setSyncing(true);
      try {
        const response = await fetch(`/api/organizations/${orgId}/holidays/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ year, refresh: options.refresh }),
          signal: options.signal,
        });
        if (options.signal?.aborted) return;
        if (!response.ok) {
          // A provider failure is never a status (REQ-02-009), so anything but a 200 is
          // this application failing, and it takes the generic toast.
          autoSynced.current.delete(year);
          showToast('toast-server-error', HOLIDAY_MESSAGES.toastServerError, 'error');
          return;
        }
        const result = (await response.json()) as SyncResponse;
        if (options.signal?.aborted) return;
        // A country the provider could not answer for comes back `unsourced` on a 200.
        setSyncLeftUnsourced(
          result.countries.some((entry) => entry.state === 'unsourced') ? result.year : null,
        );
        await Promise.all([load(options.signal), loadSummary(options.signal)]);
      } catch (err) {
        // A sync that was abandoned — the year tab moved (Edge case 18) — or that never
        // reached the API leaves the year unsourced, so the year must not stay marked as
        // one this page has already synced: coming back to it has to try again.
        autoSynced.current.delete(year);
        if ((err as Error)?.name === 'AbortError') return;
        showToast('toast-server-error', HOLIDAY_MESSAGES.toastServerError, 'error');
      } finally {
        // Only the newest run clears the line; an older one that was abandoned mid-flight
        // says nothing about the sync that took its place.
        if (syncRun.current === run) setSyncing(false);
      }
    },
    [orgId, year, load, loadSummary, showToast],
  );

  /**
   * REQ-02-012 — the screen syncs without being asked. Nobody clicks anything: a year
   * whose list read reports an unsourced country issues one sync and repaints on its
   * answer. Switching the year tab abandons it (Edge case 18), so a slow answer never
   * repaints a year nobody is looking at.
   */
  /* The one fact the effect below turns on. A boolean rather than the block itself: every
     re-read produces a new `sourcing` object, and an effect that woke on each of them
     would abandon the very request it had just issued. */
  const needsSync =
    sourcing !== null &&
    sourcing.year === year &&
    sourcing.countries.some((entry) => entry.state === 'unsourced');

  /* `runSync` closes over the year and both reads, so its identity changes with them.
     Held in a ref so the effect turns on the fact above and on nothing else. */
  const runSyncRef = useRef(runSync);
  useEffect(() => {
    runSyncRef.current = runSync;
  }, [runSync]);

  useEffect(() => {
    if (!authorized || !canManage || !needsSync) return undefined;
    if (autoSynced.current.has(year)) return undefined;
    autoSynced.current.add(year);
    const controller = new AbortController();
    void runSyncRef.current({ refresh: false, signal: controller.signal });
    return () => controller.abort();
  }, [authorized, canManage, needsSync, year]);

  /** REQ-02-002 — the checkbox is stored, so the set it changes survives a reload. */
  async function handleToggleIncludeOrgCountry(next: boolean): Promise<void> {
    if (savingSetting) return;
    const previous = includeOrgCountry;
    // The box moves when it is clicked and the write reconciles it: a control that waits
    // for a round trip before it moves reads as a control that did not take the click.
    // A refusal puts it back, which is why the previous value is held rather than
    // recomputed from the response.
    setIncludeOrgCountry(next);
    setSavingSetting(true);
    try {
      const response = await fetch(`/api/organizations/${orgId}/settings/holiday-sourcing`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ includeOrgCountry: next }),
      });
      if (response.ok) {
        const body = (await response.json()) as HolidaySourcingSettings;
        setIncludeOrgCountry(body.includeOrgCountry);
        // The set changed, so both the sourcing block and the summary did.
        await Promise.all([load(), loadSummary()]);
      } else {
        setIncludeOrgCountry(previous);
        const body = await response.json().catch(() => null);
        const fields = body?.fields as Record<string, string> | undefined;
        showToast(
          'toast-server-error',
          fields?.includeOrgCountry ?? HOLIDAY_MESSAGES.toastServerError,
          'error',
        );
      }
    } catch {
      setIncludeOrgCountry(previous);
      showToast('toast-server-error', HOLIDAY_MESSAGES.toastServerError, 'error');
    }
    setSavingSetting(false);
  }

  async function handleDeleteConfirm(): Promise<void> {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/holidays/${deleteTarget.id}`,
        { method: 'DELETE', credentials: 'same-origin' },
      );
      if (response.ok) {
        setDeleteTarget(null);
        setModalMode(null);
        showToast('toast-holiday-deleted', HOLIDAY_MESSAGES.toastDeleted);
        await load();
      } else {
        // A 403 carries the tabulated wording in `message`; anything else is generic.
        const body = await response.json().catch(() => null);
        showToast(
          'toast-server-error',
          body?.message ?? HOLIDAY_MESSAGES.toastServerError,
          'error',
        );
      }
    } catch {
      showToast('toast-server-error', HOLIDAY_MESSAGES.toastServerError, 'error');
    }
    setDeleting(false);
  }

  /** Rows grouped into ordered month bands — the API already sorts by date. */
  const months = useMemo(() => {
    const groups: { key: string; label: string; rows: HolidayRow[] }[] = [];
    for (const row of holidays ?? []) {
      const key = row.date.slice(0, 7); // YYYY-MM
      const monthIndex = Number(key.slice(5, 7)) - 1;
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.rows.push(row);
      else
        groups.push({
          key,
          label: `${MONTH_NAMES[monthIndex] ?? key} ${key.slice(0, 4)}`,
          rows: [row],
        });
    }
    return groups;
  }, [holidays]);

  /**
   * The table's columns. Widths live here rather than on each cell because the head is what
   * decides them for every band below it (§83) — one `<table>`, one set of widths, so a name
   * in December lands under the name in January.
   */
  const columns = useMemo<ReportTableColumn<HolidayRow>[]>(
    () => [
      { key: 'date', label: 'Date', width: 160, render: (row) => formatDayLabel(row.date) },
      { key: 'name', label: 'Holiday', render: (row) => row.name },
      { key: 'paidHours', label: 'Paid hours', align: 'end', width: 120, render: (row) => `${row.paidHours}h` },
      {
        key: 'countryCode',
        label: 'Country',
        width: 200,
        render: (row) => (
          <>
            {/* The chip reads as the code; the label carries the full name so a screen
                reader never reads a bare two-letter code (§Accessibility). A country code is
                literal text a reader matches glyph by glyph, which is the half of §77 that
                wants a real monospace face — the figures beside it take tabular digits from
                the cell instead. */}
            <span
              aria-label={holidayCountryLabel(row.countryCode)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '2px var(--space-2)',
                borderRadius: 'var(--radius-pill)',
                background: 'var(--surface-sunken)',
                fontFamily: 'var(--font-family-mono)',
                fontSize: 'var(--font-size-xs)',
                color: 'var(--text-tertiary)',
              }}
            >
              {row.countryCode ?? 'All'}
            </span>
            <span
              style={{ marginLeft: 'var(--space-2)', color: 'var(--text-secondary)' }}
              aria-hidden
            >
              {holidayCountryLabel(row.countryCode)}
            </span>
          </>
        ),
      },
      {
        /* Time off spec 02 — where the row came from. `manual` or `imported`, the one
           field the list route gained. */
        key: 'source',
        label: 'Source',
        width: 120,
        render: (row) => (
          <span
            data-testid={`holidays-row-${row.id}-source`}
            style={{ color: 'var(--text-secondary)' }}
          >
            {row.source}
          </span>
        ),
      },
      {
        key: 'actions',
        label: '',
        align: 'end',
        width: 80,
        render: (row) =>
          canManage ? (
            <IconButton
              label={`Edit ${row.name}`}
              onClick={() => setModalMode({ kind: 'edit', holiday: row })}
              data-testid={`holidays-row-${row.id}-edit-btn`}
            >
              <PencilIcon />
            </IconButton>
          ) : null,
      },
    ],
    [canManage],
  );

  /* A country the provider could not source, or covers with nothing: the screen names it
     rather than claiming the year has no holidays. */
  const uncovered = (sourcing?.countries ?? []).filter((entry) => entry.state !== 'sourced');
  const hasUnsourced = (sourcing?.countries ?? []).some((entry) => entry.state === 'unsourced');
  const noHolidays = !loading && !error && holidays !== null && holidays.length === 0;
  /* REQ-02-012 / §UI Description — the empty state is a claim the product can only make
     once every country in the set is settled. An unsourced one shows the warning instead. */
  const isEmpty = noHolidays && !hasUnsourced;
  const isCountryFiltered = country !== ALL_COUNTRIES;

  // Nothing is drawn while the redirect swaps the URL — no flash of the shell.
  if (!authorized) return null;

  return (
    <div data-testid="holidays-page">
      <PageHeader
        title={<span data-testid="holidays-page-title">Holidays</span>}
        subtitle="Paid public days for your organization."
        action={
          canManage && (
            <Button
              variant="primary"
              onClick={() => setModalMode({ kind: 'create' })}
              data-testid="holidays-add-btn"
            >
              + Add holiday
            </Button>
          )
        }
      />

      {/* §45 — a tab chooses what is shown, so these are `role="tab"` buttons in a named
          `tablist` rather than the anchors the previous strip drew. */}
      <PageTabs
        tabs={yearTabs(thisYear).map((y) => ({
          value: String(y),
          label: String(y),
          testId: `holidays-year-tab-${y}`,
        }))}
        active={String(year)}
        onChange={(value) => setYear(Number(value))}
        label="Holiday year"
        style={{ marginBottom: 'var(--space-5)' }}
      />

      {/* Time off spec 01 §Screens — the organization country, ABOVE the list's own country
          filter and clearly not it: this one is what every member without a country of
          their own is paid holidays for. Admin and manager both set it; a user and a
          viewer never reach this page at all, so there is no read-only rendering to draw. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 'var(--space-3)',
          /* BUG-011 — the `dropdown` Select's hint hangs 20px below the control's own box and
             adds no height for it (Select.tsx:480). `--space-6` (16px) let the filter row below
             paint over the hint's descenders; `--space-8` (24px) clears the hint's 20px plus a
             4px gap. */
          marginBottom: 'var(--space-8)',
          flexWrap: 'wrap',
        }}
      >
        {/* The same width the country filter directly below it carries: two selects in one
            column that measured differently would read as two unrelated controls. */}
        <div style={{ width: ORG_COUNTRY_WIDTH }} data-testid="org-country-select">
          {/* The list the WRITE accepts, and not the holiday form's: that one is built from
              the phone list and offers AC, TA and XK, which rule 9 refuses. Above it, the
              option that submits `null` — what REQ-01-034 clears through, and without it
              the rule has no control behind it: a single Select is cleared only by picking
              another option, and an organization that stated a country could never unstate
              one. It is also what a stored `null` renders as.

              PATCH-004 — searchable, so `org-country-select` moves onto this wrapper (§21
              puts the control's own attributes, `data-testid` included, on the inner
              `<input>` once a `Select` is searchable, and the chosen value then sits in a
              sibling span the wrapper still contains). The input takes its own id. */}
          <Select
            label="Organization country"
            hint={TIME_OFF_CALENDAR_MESSAGES.orgCountryHint}
            value={optionFor(ORG_COUNTRY_OPTIONS, orgCountry)}
            options={ORG_COUNTRY_OPTIONS}
            onChange={(option) => setOrgCountry(valueOf(option))}
            isSearchable
            data-testid="org-country-select-input"
          />
          <HiddenSelectedLabel label={selectedLabel(ORG_COUNTRY_OPTIONS, orgCountry)} />
        </div>
        <Button
          onClick={() => void handleSaveCountry()}
          preloader={savingCountry}
          disabled={savingCountry}
          data-testid="org-country-save"
        >
          Save country
        </Button>

        {/* Time off spec 02 §Screens — sourcing sits beside the country it may add, because
            the two answer one question: which countries' holidays this organization pays. */}
        <div style={{ marginLeft: 'auto' }}>
          <HolidaySourcingPanel
            year={year}
            includeOrgCountry={includeOrgCountry}
            savingSetting={savingSetting}
            syncing={syncing}
            failedSome={!syncing && syncLeftUnsourced === year}
            onToggleIncludeOrgCountry={(next) => void handleToggleIncludeOrgCountry(next)}
            onRefresh={() => void runSync({ refresh: true })}
          />
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-6)',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ width: ORG_COUNTRY_WIDTH }} data-testid="holidays-country-filter">
          {/* PATCH-004 — searchable; `holidays-country-filter` moves onto this wrapper for
              the same reason as the organization picker above. */}
          <Select
            value={optionFor(HOLIDAY_COUNTRY_OPTIONS, country)}
            options={HOLIDAY_COUNTRY_OPTIONS}
            onChange={(option) => setCountry(valueOf(option))}
            isSearchable
            data-testid="holidays-country-filter-input"
          />
          <HiddenSelectedLabel label={selectedLabel(HOLIDAY_COUNTRY_OPTIONS, country)} />
        </div>
      </div>

      {/* REQ-02-009 / §UI Description — an InfoBanner, not the error banner: the screen is
          working and the data is partial. `holidays-error-banner` stays absent. */}
      {uncovered.length > 0 && (
        <div data-testid="holiday-sourcing-uncovered" style={{ marginBottom: 'var(--space-5)' }}>
          <InfoBanner variant="warning">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {uncovered.map((entry) => (
                <span
                  key={entry.countryCode}
                  data-testid={`holiday-sourcing-uncovered-${entry.countryCode}`}
                >
                  {`${holidayCountryLabel(entry.countryCode)}: ${uncoveredMessage(entry.state)}`}
                </span>
              ))}
            </div>
          </InfoBanner>
        </div>
      )}

      {/* The summary sits ABOVE the list: it is the answer to the question the year tab
          asked, and the list is the evidence for it. */}
      <HolidaySummary
        year={year}
        summary={summary}
        loading={summaryLoading}
        failed={summaryFailed}
      />

      {loading || holidays === null ? (
        <HolidaysLoading />
      ) : error ? (
        <div data-testid="holidays-error-banner">
          <InfoBanner variant="error" role="alert">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 'var(--space-3)',
              }}
            >
              <span>{HOLIDAY_MESSAGES.errorLoad}</span>
              <Button onClick={() => void load()} data-testid="holidays-error-retry-btn">
                Retry
              </Button>
            </div>
          </InfoBanner>
        </div>
      ) : isEmpty && isCountryFiltered ? (
        <EmptyState data-testid="holidays-empty-state">
          {HOLIDAY_MESSAGES.emptyStateCountry(holidayCountryLabel(country), year)}
        </EmptyState>
      ) : isEmpty ? (
        /* §65 — the way out of an empty state belongs *in* it, so the CTA is a child rather
           than a sibling. The mock's emoji is a line-drawn glyph: the design system forbids
           emoji and the app ships none. */
        <EmptyState data-testid="holidays-empty-state">
          <span style={{ color: 'var(--text-secondary)' }}>
            <CalendarIcon size={36} />
          </span>
          {/* Title and subtitle are the two halves of the tabulated empty-state string
              (§Screens). Rendering the whole here as well as the title would print the
              first sentence twice — both come from HOLIDAY_MESSAGES, neither inline. */}
          <div
            style={{
              marginTop: 'var(--space-5)',
              fontWeight: 'var(--headline-6-weight)',
              fontSize: 'var(--headline-6-size)',
              color: 'var(--text-primary)',
            }}
          >
            {HOLIDAY_MESSAGES.emptyStateTitle(year)}
          </div>
          <div
            style={{
              marginTop: 'var(--space-3)',
              fontSize: 'var(--font-size-base)',
              color: 'var(--text-tertiary)',
              maxWidth: 460,
            }}
          >
            {HOLIDAY_MESSAGES.emptyStateBody}
          </div>
          {canManage && (
            <div style={{ marginTop: 'var(--space-6)' }}>
              <Button
                variant="primary"
                onClick={() => setModalMode({ kind: 'create' })}
                data-testid="holidays-empty-primary-cta"
              >
                + Add holiday
              </Button>
            </div>
          )}
        </EmptyState>
      ) : noHolidays ? (
        /* No holiday, and a country still unsourced: neither the empty state nor a table
           of nothing. The warning above already says why, and the sync is on its way. */
        null
      ) : (
        <Card padded={false}>
          <div style={{ overflowX: 'auto' }}>
            <table
              data-testid="holidays-table"
              aria-label={`Holidays for ${year}`}
              style={{ width: '100%', borderCollapse: 'collapse' }}
            >
              <ReportTableHead columns={columns} />
              {months.map((month) => (
                <ReportGroupBody<HolidayRow>
                  key={month.key}
                  title={month.label}
                  bandTestId={`holidays-month-band-${month.key}`}
                  columns={columns}
                  rows={month.rows}
                  rowTestId={(row) => `holidays-row-${row.id}`}
                />
              ))}
            </table>
          </div>
        </Card>
      )}

      {/* Mounted only while open, and keyed by its target. The form seeds from `mode`
          at mount, so React's own mount/unmount is what resets it between an Add and an
          Edit — no effect has to detect the change, and nothing can clobber typing. */}
      {modalMode && (
        <HolidayModal
          key={modalMode.kind === 'edit' ? `edit-${modalMode.holiday.id}` : 'create'}
          open
          mode={modalMode}
          orgId={orgId}
          canDelete={canDelete}
          onClose={() => setModalMode(null)}
          onSaved={() => void load()}
          onRequestDelete={(holiday) => setDeleteTarget(holiday)}
        />
      )}

      {/* `DeleteHolidayDialog` was a hand-built `Modal` and is gone (D4). This is the
          confirmation §40/§41 were written for: it awaits a result the admin has to see, so
          `busy` spins the accept button and blocks both controls and `closeOnAccept={false}`
          leaves the dialog standing until `handleDeleteConfirm` closes it on the reply.
          The accept button is primary rather than red — §40's deliberate call: a red button
          in a red-titled dialog makes the answer look like the warning.
          The wording depends on whether the date has already passed; comparison is
          string-wise on ISO dates against today in the viewer's own zone, so "past" stays a
          calendar-day fact that no `Date` arithmetic can shift. */}
      <ConfirmDialog
        open={deleteTarget !== null}
        data-testid="holiday-delete-confirm"
        title="Delete holiday?"
        description={deleteConfirmMessage(deleteTarget)}
        declineBtnText={HOLIDAY_MESSAGES.deleteConfirmCancel}
        acceptBtnText={deleting ? 'Deleting' : HOLIDAY_MESSAGES.deleteConfirmConfirm}
        declineTestId="holiday-delete-cancel-btn"
        acceptTestId="holiday-delete-confirm-btn"
        busy={deleting}
        closeOnAccept={false}
        onClose={() => {
          if (!deleting) setDeleteTarget(null);
        }}
        onAccept={() => void handleDeleteConfirm()}
      />
    </div>
  );
}

/**
 * The `GET .../holidays` wait.
 *
 * It was six grey row outlines on the "no `Skeleton` primitive" gap. The table they stood in
 * for is no longer this screen's to draw — it is the system's grouped table now — and an
 * outline of somebody else's geometry is the thing most likely to stop matching it. The
 * system's answer for waiting is `Preloader` (§23, §69); the state keeps the test id the
 * spec's roster named for it.
 */
function HolidaysLoading() {
  return (
    <Card>
      <div
        role="status"
        data-testid="holidays-loading-skeleton"
        aria-label="Loading holidays"
        style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-9) 0' }}
      >
        <Preloader />
      </div>
    </Card>
  );
}

/**
 * §UI Description — each line of the warning carries the message **its own state** names.
 *
 * `unsourced` is a country the provider could not answer for; `empty` is one it answered
 * for and had nothing to list (REQ-02-023's covered-but-empty). Wording the second as the
 * first tells an admin the service does not cover a country it does cover, and sends them
 * looking for a provider that already replied.
 */
function uncoveredMessage(state: SourcingState): string {
  return state === 'empty'
    ? HOLIDAY_SOURCING_MESSAGES.countryNoHolidays
    : HOLIDAY_SOURCING_MESSAGES.countryNotCovered;
}

/** Today as `YYYY-MM-DD` in the viewer's own zone. */
function localTodayYmd(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
}

/** A past holiday warns that future Amounts Owed runs will drop it; a future one asks the
 *  short question. */
function deleteConfirmMessage(holiday: HolidayRow | null): string {
  const name = holiday?.name ?? '';
  const date = holiday?.date ?? '';
  return date !== '' && date < localTodayYmd()
    ? HOLIDAY_MESSAGES.deleteConfirmPast(name, date)
    : HOLIDAY_MESSAGES.deleteConfirmFuture(name, date);
}

