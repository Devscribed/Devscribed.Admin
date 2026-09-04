'use client';

import { useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useMemo, useState } from 'react';
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
import { HOLIDAY_MESSAGES, can, type Role } from '@devscribed/validation';
import { HolidayModal, type HolidayModalMode } from './HolidayModal';
import { ALL_COUNTRIES, HOLIDAY_COUNTRY_OPTIONS, holidayCountryLabel } from './country-options';
import type { HolidayRow, HolidaysResponse } from './types';

/** The year tabs: last year, this year, next year — enough to plan and to correct. */
function yearTabs(current: number): number[] {
  return [current - 1, current, current + 1];
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

  const [modalMode, setModalMode] = useState<HolidayModalMode | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HolidayRow | null>(null);
  const [deleting, setDeleting] = useState(false);

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
    // Abort the in-flight read on every year/country change so a slow earlier reply
    // cannot clobber the newer one.
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [authorized, load]);

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

  const isEmpty = !loading && !error && holidays !== null && holidays.length === 0;
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

      <div
        style={{
          display: 'flex',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-6)',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: 220 }}>
          <Select
            value={optionFor(HOLIDAY_COUNTRY_OPTIONS, country)}
            options={HOLIDAY_COUNTRY_OPTIONS}
            onChange={(option) => setCountry(valueOf(option))}
            data-testid="holidays-country-filter"
          />
        </div>
      </div>

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

