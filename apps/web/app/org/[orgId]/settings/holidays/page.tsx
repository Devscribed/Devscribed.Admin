'use client';

import { useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useMemo, useState } from 'react';
import { Button, IconButton, InfoBanner, Select, Tabs } from '@/ds';
import { CalendarIcon, PencilIcon } from '@/layout/icons';
import { useSession } from '@/layout/session-context';
import { useToast } from '@/toast';
import { HOLIDAY_MESSAGES, can, type Role } from '@devscribed/validation';
import { DeleteHolidayDialog } from './DeleteHolidayDialog';
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
 * The list is grouped into sticky month bands, which the DS `Table` cannot express
 * (recorded as a DS gap); the bands are drawn here from tokens only.
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

  const isEmpty = !loading && !error && holidays !== null && holidays.length === 0;
  const isCountryFiltered = country !== ALL_COUNTRIES;

  // Nothing is drawn while the redirect swaps the URL — no flash of the shell.
  if (!authorized) return null;

  return (
    <div data-testid="holidays-page">
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 20,
          flexWrap: 'wrap',
          marginBottom: 22,
        }}
      >
        <div>
          <h1
            data-testid="holidays-page-title"
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: 'var(--fs-27)',
              letterSpacing: '-.6px',
              margin: '0 0 5px',
              color: 'var(--text)',
            }}
          >
            Holidays
          </h1>
          <div style={{ fontSize: 'var(--fs-14)', color: 'var(--text-sub)' }}>
            Paid public days for your organization.
          </div>
        </div>
        {canManage && (
          <Button
            variant="primary"
            onClick={() => setModalMode({ kind: 'create' })}
            data-testid="holidays-add-btn"
          >
            + Add holiday
          </Button>
        )}
      </div>

      <Tabs
        items={yearTabs(thisYear).map((y) => ({
          value: String(y),
          label: String(y),
          testId: `holidays-year-tab-${y}`,
        }))}
        value={String(year)}
        onChange={(value: string) => setYear(Number(value))}
        style={{ marginBottom: 'var(--sp-6)' }}
      />

      <div style={{ display: 'flex', gap: 'var(--sp-4)', marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 220 }}>
          <Select
            value={country}
            options={HOLIDAY_COUNTRY_OPTIONS}
            onChange={(value: string) => setCountry(value)}
            data-testid="holidays-country-filter"
          />
        </div>
      </div>

      {loading || holidays === null ? (
        <HolidaysSkeleton />
      ) : error ? (
        <div data-testid="holidays-error-banner">
          <InfoBanner tone="error" role="alert">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 'var(--sp-4)',
              }}
            >
              <span>{HOLIDAY_MESSAGES.errorLoad}</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void load()}
                data-testid="holidays-error-retry-btn"
              >
                Retry
              </Button>
            </div>
          </InfoBanner>
        </div>
      ) : isEmpty && isCountryFiltered ? (
        <InlineEmpty
          message={HOLIDAY_MESSAGES.emptyStateCountry(holidayCountryLabel(country), year)}
        />
      ) : isEmpty ? (
        <EmptyState
          year={year}
          canManage={canManage}
          onCreate={() => setModalMode({ kind: 'create' })}
        />
      ) : (
        <div
          data-testid="holidays-table"
          role="table"
          aria-label={`Holidays for ${year}`}
          style={{
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-2xl)',
            overflow: 'hidden',
          }}
        >
          {months.map((month) => (
            <div key={month.key} role="rowgroup">
              {/* Sticky month band. The DS `Table` has no grouping (see DS gaps), so
                  the band is drawn here from tokens. `rowheader` must sit inside a
                  `row` to be a valid ARIA table, hence the wrapper. */}
              <div role="row">
              <div
                role="rowheader"
                data-testid={`holidays-month-band-${month.key}`}
                style={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 1,
                  background: 'var(--bg-header)',
                  borderTop: '1px solid var(--divider)',
                  padding: 'var(--sp-3) 18px',
                  fontFamily: 'var(--font-display)',
                  fontSize: 'var(--fs-11)',
                  letterSpacing: 'var(--ls-wider)',
                  textTransform: 'uppercase',
                  color: 'var(--text-muted)',
                }}
              >
                {month.label}
              </div>
              </div>
              {month.rows.map((row) => (
                <div
                  key={row.id}
                  role="row"
                  data-testid={`holidays-row-${row.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--sp-6)',
                    padding: '0 18px',
                    minHeight: 62,
                    borderTop: '1px solid var(--divider)',
                  }}
                >
                  <div
                    role="cell"
                    style={{
                      flex: 1,
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--fs-14)',
                      color: 'var(--text-sub)',
                    }}
                  >
                    {formatDayLabel(row.date)}
                  </div>
                  <div
                    role="cell"
                    style={{
                      flex: 2.4,
                      fontFamily: 'var(--font-display)',
                      fontWeight: 500,
                      fontSize: 'var(--fs-15)',
                      color: 'var(--text)',
                    }}
                  >
                    {row.name}
                  </div>
                  <div
                    role="cell"
                    style={{
                      flex: 0.8,
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--fs-14)',
                      color: 'var(--text)',
                    }}
                  >
                    {row.paidHours}h
                  </div>
                  <div role="cell" style={{ flex: 1.2 }}>
                    {/* The chip reads as the code; the label carries the full name so a
                        screen reader never reads a bare two-letter code (§Accessibility). */}
                    <span
                      aria-label={holidayCountryLabel(row.countryCode)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 'var(--sp-2)',
                        padding: '2px var(--sp-3)',
                        borderRadius: 'var(--radius-pill)',
                        background: 'var(--bg-sunken)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 'var(--fs-12)',
                        color: 'var(--text-sub)',
                      }}
                    >
                      {row.countryCode ?? 'All'}
                    </span>
                    <span
                      style={{
                        marginLeft: 'var(--sp-3)',
                        fontSize: 'var(--fs-13)',
                        color: 'var(--text-muted)',
                      }}
                      aria-hidden
                    >
                      {holidayCountryLabel(row.countryCode)}
                    </span>
                  </div>
                  <div role="cell" style={{ flex: 0.5, display: 'flex', justifyContent: 'flex-end' }}>
                    {canManage && (
                      <IconButton
                        label={`Edit ${row.name}`}
                        onClick={() => setModalMode({ kind: 'edit', holiday: row })}
                        data-testid={`holidays-row-${row.id}-edit-btn`}
                      >
                        <PencilIcon />
                      </IconButton>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
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

      <DeleteHolidayDialog
        open={deleteTarget !== null}
        holiday={deleteTarget}
        saving={deleting}
        onClose={() => {
          if (!deleting) setDeleteTarget(null);
        }}
        onConfirm={() => void handleDeleteConfirm()}
      />
    </div>
  );
}

function EmptyState({
  year,
  canManage,
  onCreate,
}: {
  year: number;
  canManage: boolean;
  onCreate: () => void;
}) {
  return (
    <div
      data-testid="holidays-empty-state"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--sp-6)',
        padding: 'var(--sp-12) var(--sp-8)',
        textAlign: 'center',
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-2xl)',
      }}
    >
      {/* A line-drawn calendar, not the mock's emoji — the design system forbids
          emoji and the app ships none. */}
      <span style={{ color: 'var(--text-muted)' }}>
        <CalendarIcon size={36} />
      </span>
      {/* Title and subtitle are the two halves of the tabulated empty-state string
          (§Screens). Rendering the whole here as well as the title would print the
          first sentence twice — both come from HOLIDAY_MESSAGES, neither inline. */}
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: 'var(--fs-18)',
          color: 'var(--text)',
        }}
      >
        {HOLIDAY_MESSAGES.emptyStateTitle(year)}
      </div>
      <div style={{ fontSize: 'var(--fs-15)', color: 'var(--text-sub)', maxWidth: 460 }}>
        {HOLIDAY_MESSAGES.emptyStateBody}
      </div>
      {canManage && (
        <Button variant="primary" onClick={onCreate} data-testid="holidays-empty-primary-cta">
          + Add holiday
        </Button>
      )}
    </div>
  );
}

function InlineEmpty({ message }: { message: string }) {
  return (
    <div
      data-testid="holidays-empty-state"
      style={{
        padding: 'var(--sp-8)',
        color: 'var(--text-muted)',
        fontSize: 'var(--fs-14)',
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-2xl)',
        textAlign: 'center',
      }}
    >
      {message}
    </div>
  );
}

/** Token-only shimmering row skeleton — the app ships no skeleton primitive. */
function HolidaysSkeleton() {
  const block = (w: number | string, h: number, radius = 8): React.CSSProperties => ({
    width: w,
    height: h,
    borderRadius: radius,
    background: 'var(--bg-sunken)',
  });
  return (
    <div
      data-testid="holidays-loading-skeleton"
      style={{
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-2xl)',
        overflow: 'hidden',
      }}
    >
      <div style={{ height: 40, background: 'var(--bg-header)' }} />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--sp-6)',
            padding: '0 18px',
            minHeight: 62,
            borderTop: '1px solid var(--divider)',
          }}
        >
          <div style={{ ...block(90, 14), flex: 1 }} />
          <div style={{ ...block(200, 16), flex: 2.4 }} />
          <div style={{ ...block(34, 14), flex: 0.8 }} />
          <div style={{ ...block(90, 20, 20), flex: 1.2 }} />
          <div style={{ ...block(32, 32, 8), flex: 0.5 }} />
        </div>
      ))}
    </div>
  );
}
