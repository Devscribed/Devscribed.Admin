'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, InfoBanner } from '@/ds';
import { useSession } from '@/layout/session-context';
import { useToast } from '@/toast';
import {
  REPORTS_MESSAGES,
  can,
  hasCapability,
  type Role,
} from '@devscribed/validation';
import { DateRangeInput } from '@/reports/DateRangeInput';
import { MultiSelectFilter } from '@/reports/MultiSelectFilter';
import { ReportShellHeader } from '@/reports/ReportShell';
import { SegmentedControl } from '@/reports/SegmentedControl';
import { daysAgoInTz, formatRangeLabel, todayInTz } from '@/reports/date-utils';
import type {
  FilterOption,
  OwnerScope,
  TimeOffGroup,
  TimeOffResponse,
  TimeOffRow,
  TimeOffStatusFilter,
  TimeOffTypeFilter,
} from '@/reports/types';

const DEFAULT_RANGE_DAYS = 30;

/**
 * Fixed Time Off column set (spec §API Contracts · Time Off). The report's
 * shape does not depend on capability-driven column projection like Time &
 * Activity does, so the client renders exactly these five columns in this
 * order and does not consult `response.headers`.
 */
const TIME_OFF_COLUMNS: { title: string; value: keyof TimeOffRow }[] = [
  { title: 'Type', value: 'type' },
  { title: 'Period', value: 'period' },
  { title: 'Days', value: 'days' },
  { title: 'Working days', value: 'workingDays' },
  { title: 'Deduction', value: 'deduction' },
];

const NUMERIC_COLUMN_KEYS = new Set(['days', 'workingDays', 'deduction']);

const TYPE_LABEL: Record<TimeOffTypeFilter, string> = {
  all: 'All',
  vacation: 'Vacation',
  holiday: 'Holiday',
};

const STATUS_LABEL: Record<TimeOffStatusFilter, string> = {
  all: 'All',
  approved: 'Approved',
  pending: 'Pending',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Time Off report screen (spec reports/01 §Screens · Report shell + §API
 * Contracts · Time Off). Structural clone of the Amounts Owed page — same
 * URL-persisted filter state, same owner-scope logic, same PDF export flow —
 * with three differences specific to Time Off: no Projects/Clients/Columns
 * pickers, no Sum/Detailed chips (the report groups by member, not by
 * date-range collapse), and two dropdowns for `type` and `status`. Capability
 * decisions here are UI convenience only: the server re-enforces every gate.
 */
export default function TimeOffPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const session = useSession();
  const { showToast } = useToast();

  const role = session.role as Role;
  const canViewAll = hasCapability(role, 'ViewTimeOff');
  const canViewMy = hasCapability(role, 'ViewMyTimeOff');
  const canExport = can(role, 'export-reports');
  const authorized = canViewAll || canViewMy;

  useEffect(() => {
    if (!authorized) router.replace(`/org/${orgId}/reports`);
  }, [authorized, router, orgId]);

  const tz = session.account.timezone && session.account.timezone.trim().length > 0
    ? session.account.timezone
    : 'UTC';

  // ── URL-persisted filter state (spec §UI · Routes) ─────────────────────────
  const initialOwner: OwnerScope =
    searchParams.get('owner') === 'my' || !canViewAll ? 'my' : 'all';
  const initialStart = searchParams.get('startDate') ?? daysAgoInTz(DEFAULT_RANGE_DAYS - 1, tz);
  const initialEnd = searchParams.get('endDate') ?? todayInTz(tz);
  const initialMemberIds = searchParams.getAll('memberIds');
  const initialType = ((): TimeOffTypeFilter => {
    const raw = searchParams.get('type');
    return raw === 'vacation' || raw === 'holiday' ? raw : 'all';
  })();
  const initialStatus = ((): TimeOffStatusFilter => {
    const raw = searchParams.get('status');
    return raw === 'approved' ||
      raw === 'pending' ||
      raw === 'rejected' ||
      raw === 'cancelled'
      ? raw
      : 'all';
  })();

  const [owner, setOwner] = useState<OwnerScope>(initialOwner);
  const [startDate, setStartDate] = useState<string>(initialStart);
  const [endDate, setEndDate] = useState<string>(initialEnd);
  const [memberIds, setMemberIds] = useState<string[]>(initialMemberIds);
  const [type, setType] = useState<TimeOffTypeFilter>(initialType);
  const [status, setStatus] = useState<TimeOffStatusFilter>(initialStatus);

  // Force `owner=my` if the caller cannot see All (server would 404 anyway).
  useEffect(() => {
    if (!canViewAll && owner === 'all') setOwner('my');
  }, [canViewAll, owner]);

  // Mirror state to the URL — a reload re-hydrates the same report. Serial
  // params for the id lists (repeated keys) match the API query envelope.
  useEffect(() => {
    if (!authorized) return;
    const next = new URLSearchParams();
    next.set('startDate', startDate);
    next.set('endDate', endDate);
    if (owner === 'my') next.set('owner', 'my');
    for (const id of memberIds) next.append('memberIds', id);
    // `type=all` and `status=all` are the server defaults; omit them so a
    // shareable URL doesn't carry noise.
    if (type !== 'all') next.set('type', type);
    if (status !== 'all') next.set('status', status);
    router.replace(`?${next.toString()}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    authorized,
    owner,
    startDate,
    endDate,
    memberIds,
    type,
    status,
  ]);

  // ── Filter option catalogues ──────────────────────────────────────────────
  const [memberOptions, setMemberOptions] = useState<FilterOption[]>([]);

  useEffect(() => {
    if (!authorized) return;
    let cancelled = false;

    async function loadMembers(): Promise<void> {
      try {
        const res = await fetch(`/api/organizations/${orgId}/members`, {
          credentials: 'same-origin',
        });
        if (cancelled || !res.ok) return;
        const data = (await res.json()) as { members?: { id: string; fullName: string }[] };
        setMemberOptions(
          (data.members ?? []).map((m) => ({ id: m.id, label: m.fullName })),
        );
      } catch {
        /* Filter options are a convenience — silence is fine here. */
      }
    }

    void loadMembers();
    return () => {
      cancelled = true;
    };
  }, [orgId, authorized]);

  // ── Report data ────────────────────────────────────────────────────────────
  const [data, setData] = useState<TimeOffResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [serverError, setServerError] = useState<boolean>(false);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [genericFilterError, setGenericFilterError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<boolean>(false);
  const lastRequestRef = useRef<number>(0);

  const buildQuery = useCallback((): URLSearchParams => {
    const q = new URLSearchParams();
    q.set('startDate', startDate);
    q.set('endDate', endDate);
    if (owner === 'all') {
      for (const id of memberIds) q.append('memberIds', id);
    }
    if (type !== 'all') q.set('type', type);
    if (status !== 'all') q.set('status', status);
    return q;
  }, [startDate, endDate, owner, memberIds, type, status]);

  const load = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      setLoading(true);
      setServerError(false);
      setRangeError(null);
      setGenericFilterError(null);
      const requestId = ++lastRequestRef.current;
      const path = owner === 'my' ? 'time-off/my' : 'time-off';
      const url = `/api/organizations/${orgId}/reports/${path}?${buildQuery().toString()}`;
      try {
        const res = await fetch(url, { credentials: 'same-origin', signal });
        if (signal?.aborted || requestId !== lastRequestRef.current) return;
        if (res.status === 404) {
          // Owner-scope refused (spec §States — 404 → redirect + toast).
          showToast('toast-report-forbidden', REPORTS_MESSAGES.toastForbidden, 'error');
          router.replace(`/org/${orgId}/reports`);
          return;
        }
        if (res.status === 422) {
          const body = (await res.json().catch(() => null)) as
            | { message?: string; error?: string; fields?: Record<string, string> }
            | null;
          const code = body?.error ?? '';
          const message = body?.message ?? '';
          if (code === 'range_too_wide') {
            setRangeError(message || REPORTS_MESSAGES.rangeTooWide);
          } else if (code === 'end_before_start') {
            setRangeError(message || REPORTS_MESSAGES.endBeforeStart);
          } else {
            const firstField = body?.fields && Object.values(body.fields)[0];
            setGenericFilterError(message || firstField || REPORTS_MESSAGES.toastServerError);
          }
          setLoading(false);
          return;
        }
        if (!res.ok) {
          setServerError(true);
          showToast('toast-report-error', REPORTS_MESSAGES.toastServerError, 'error');
          setLoading(false);
          return;
        }
        const body = (await res.json()) as TimeOffResponse;
        if (signal?.aborted || requestId !== lastRequestRef.current) return;
        setData(body);
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        setServerError(true);
        showToast('toast-report-error', REPORTS_MESSAGES.toastServerError, 'error');
      }
      if (signal?.aborted || requestId !== lastRequestRef.current) return;
      setLoading(false);
    },
    [orgId, owner, buildQuery, router, showToast],
  );

  useEffect(() => {
    if (!authorized) return undefined;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [authorized, load]);

  // ── PDF export (spec §Alt Flow A / E) ─────────────────────────────────────
  async function handleExport(): Promise<void> {
    if (!canExport || exporting) return;
    setExporting(true);
    const path = owner === 'my' ? 'time-off/pdf/my' : 'time-off/pdf';
    const url = `/api/organizations/${orgId}/reports/${path}?${buildQuery().toString()}`;
    try {
      const res = await fetch(url, { credentials: 'same-origin' });
      if (res.status === 403) {
        showToast('toast-report-forbidden', REPORTS_MESSAGES.toastForbidden, 'error');
        return;
      }
      if (res.status === 422) {
        showToast('toast-report-pdf-too-large', REPORTS_MESSAGES.pdfTooLarge, 'error');
        return;
      }
      if (!res.ok) {
        showToast('toast-report-error', REPORTS_MESSAGES.toastServerError, 'error');
        return;
      }
      const blob = await res.blob();
      const disp = res.headers.get('Content-Disposition') ?? '';
      const match = /filename="?([^";]+)"?/i.exec(disp);
      const filename = match?.[1] ?? `TimeOff_${startDate}_to_${endDate}.pdf`;
      const pdfBlob = blob.type === 'application/pdf'
        ? blob
        : new Blob([blob], { type: 'application/pdf' });
      const objectUrl = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      a.rel = 'noopener';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      // Defer cleanup — revoking the blob URL too early cancels the download
      // in some Chromium versions, leaving the user with a toast but no file.
      setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(objectUrl);
      }, 4000);
      showToast('toast-report-pdf-ready', REPORTS_MESSAGES.toastPdfReady);
    } catch {
      showToast('toast-report-error', REPORTS_MESSAGES.toastServerError, 'error');
    } finally {
      setExporting(false);
    }
  }

  if (!authorized) return null;

  const showToggle = canViewAll && canViewMy;
  const title = owner === 'my' ? 'My Time Off' : 'Time Off';
  const rangeLabel = formatRangeLabel(startDate, endDate);
  const currency = data?.meta.currencyCode ?? 'USD';

  return (
    <div>
      <ReportShellHeader
        title={title}
        subtitle={`${rangeLabel} · ${currency}`}
        actions={
          <>
            {showToggle && (
              <SegmentedControl<OwnerScope>
                testId="reports-owner-toggle"
                ariaLabel="Report scope"
                items={[
                  { value: 'all', label: 'All members', testId: 'reports-owner-toggle-all' },
                  { value: 'my', label: 'My', testId: 'reports-owner-toggle-my' },
                ]}
                value={owner}
                onChange={setOwner}
              />
            )}
            {canExport && (
              <Button
                variant="primary"
                onClick={() => void handleExport()}
                disabled={exporting}
                data-testid="reports-export-pdf-btn"
              >
                {exporting ? 'Rendering PDF…' : 'Export PDF'}
              </Button>
            )}
          </>
        }
      />

      <FilterBar
        startDate={startDate}
        endDate={endDate}
        onRangeChange={(next) => {
          setStartDate(next.startDate);
          setEndDate(next.endDate);
        }}
        showMembers={owner === 'all'}
        memberOptions={memberOptions}
        memberIds={memberIds}
        onMemberIdsChange={setMemberIds}
        type={type}
        onTypeChange={setType}
        status={status}
        onStatusChange={setStatus}
        rangeError={rangeError}
        genericError={genericFilterError}
      />

      {loading ? (
        <LoadingSkeleton />
      ) : serverError ? (
        <ErrorBanner onRetry={() => void load()} />
      ) : data && data.groups.length === 0 ? (
        <EmptyState />
      ) : data ? (
        <>
          <SummaryStrip items={data.summary} />
          <ReportTable groups={data.groups} currency={currency} />
        </>
      ) : null}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Filter bar
 * ────────────────────────────────────────────────────────────────────────── */

function FilterBar({
  startDate,
  endDate,
  onRangeChange,
  showMembers,
  memberOptions,
  memberIds,
  onMemberIdsChange,
  type,
  onTypeChange,
  status,
  onStatusChange,
  rangeError,
  genericError,
}: {
  startDate: string;
  endDate: string;
  onRangeChange: (next: { startDate: string; endDate: string }) => void;
  showMembers: boolean;
  memberOptions: FilterOption[];
  memberIds: string[];
  onMemberIdsChange: (next: string[]) => void;
  type: TimeOffTypeFilter;
  onTypeChange: (next: TimeOffTypeFilter) => void;
  status: TimeOffStatusFilter;
  onStatusChange: (next: TimeOffStatusFilter) => void;
  rangeError: string | null;
  genericError: string | null;
}) {
  // Spec §Filter bar — the Status filter only applies to vacation rows; when
  // the caller is filtering to `holiday`, holidays have no status and the
  // control would be a no-op.
  const showStatus = type !== 'holiday';

  return (
    <fieldset
      style={{
        border: 'none',
        margin: 0,
        padding: 0,
      }}
    >
      <legend
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          border: 0,
        }}
      >
        Filters
      </legend>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          padding: 14,
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-2xl)',
          marginBottom: 18,
          alignItems: 'center',
        }}
      >
        <DateRangeInput
          startDate={startDate}
          endDate={endDate}
          onChange={onRangeChange}
        />
        {showMembers && (
          <MultiSelectFilter
            label="Members"
            testId="reports-filter-members"
            options={memberOptions}
            selected={memberIds}
            onChange={onMemberIdsChange}
          />
        )}
        <SingleSelectDropdown<TimeOffTypeFilter>
          testId="reports-filter-type"
          label="Type"
          value={type}
          onChange={onTypeChange}
          options={Object.keys(TYPE_LABEL) as TimeOffTypeFilter[]}
          labelFor={(o) => TYPE_LABEL[o]}
        />
        {showStatus && (
          <SingleSelectDropdown<TimeOffStatusFilter>
            testId="reports-filter-status"
            label="Status"
            value={status}
            onChange={onStatusChange}
            options={Object.keys(STATUS_LABEL) as TimeOffStatusFilter[]}
            labelFor={(o) => STATUS_LABEL[o]}
          />
        )}
        <span style={{ flex: 1 }} />
      </div>
      {rangeError && (
        <div
          data-testid="reports-filter-range-error"
          role="alert"
          style={{
            marginTop: -10,
            marginBottom: 18,
            padding: 'var(--sp-3) var(--sp-4)',
            background: 'var(--status-inactive-bg)',
            color: 'var(--status-inactive-ink)',
            border: '1px solid var(--status-inactive-ink)',
            borderRadius: 'var(--radius-lg)',
            fontSize: 'var(--fs-13)',
          }}
        >
          {rangeError}
        </div>
      )}
      {genericError && (
        <div
          data-testid="reports-filter-generic-error"
          role="alert"
          style={{
            marginTop: -10,
            marginBottom: 18,
            padding: 'var(--sp-3) var(--sp-4)',
            background: 'var(--status-inactive-bg)',
            color: 'var(--status-inactive-ink)',
            border: '1px solid var(--status-inactive-ink)',
            borderRadius: 'var(--radius-lg)',
            fontSize: 'var(--fs-13)',
          }}
        >
          {genericError}
        </div>
      )}
    </fieldset>
  );
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Single-select dropdown (used for both Type and Status)
 * ────────────────────────────────────────────────────────────────────────── */

function SingleSelectDropdown<T extends string>({
  testId,
  label,
  value,
  onChange,
  options,
  labelFor,
}: {
  testId: string;
  label: string;
  value: T;
  onChange: (next: T) => void;
  options: T[];
  labelFor: (opt: T) => string;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const handleClick = (event: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  function pick(next: T) {
    onChange(next);
    setOpen(false);
  }

  return (
    <div
      ref={wrapperRef}
      data-testid={testId}
      style={{ position: 'relative', display: 'inline-block' }}
    >
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((p) => !p)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          height: 36,
          padding: '0 12px',
          border: '1.5px solid var(--border-strong)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-panel)',
          fontFamily: 'var(--font-display)',
          fontWeight: 500,
          fontSize: 'var(--fs-13)',
          color: 'var(--text)',
          cursor: 'pointer',
        }}
      >
        <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginRight: 4 }}>
          {label}:
        </span>
        {labelFor(value)}
        <Caret />
      </button>
      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: 42,
            left: 0,
            zIndex: 20,
            minWidth: 200,
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-modal)',
            padding: 6,
          }}
        >
          {options.map((opt) => {
            const active = opt === value;
            return (
              <button
                key={opt}
                type="button"
                role="option"
                aria-selected={active}
                data-testid={`${testId}-item-${opt}`}
                onClick={() => pick(opt)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 10px',
                  border: 'none',
                  background: active ? 'var(--accent-soft)' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--text)',
                  borderRadius: 'var(--radius-sm)',
                  fontFamily: 'var(--font-display)',
                  fontSize: 'var(--fs-13)',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.background = 'var(--hover-bg-tint)';
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.background = 'transparent';
                }}
              >
                {labelFor(opt)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Caret() {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: 0,
        height: 0,
        borderLeft: '4px solid transparent',
        borderRight: '4px solid transparent',
        borderTop: '5px solid var(--text-muted)',
        marginLeft: 4,
      }}
    />
  );
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Summary strip
 * ────────────────────────────────────────────────────────────────────────── */

function SummaryStrip({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div
      data-testid="reports-summary-strip"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 12,
        marginBottom: 18,
      }}
    >
      {items.map((item) => (
        <div
          key={item.label}
          role="status"
          data-testid={`reports-summary-tile-${slugify(item.label)}`}
          style={{
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-2xl)',
            padding: 16,
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: 'var(--fs-11)',
              letterSpacing: '.6px',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
            }}
          >
            {item.label}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: 'var(--fs-24)',
              color: 'var(--text)',
              marginTop: 4,
            }}
          >
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Report table (grouped by member; last group is often `organization_wide`)
 * ────────────────────────────────────────────────────────────────────────── */

function formatMoney(raw: string | number | null | undefined, currency: string): string {
  if (raw === null || raw === undefined || raw === '') return '';
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(num)) return String(raw);
  const abs = Math.abs(num).toFixed(2);
  const parts = abs.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const withThousands = parts.join('.');
  const sign = num < 0 ? '-' : '';
  return currency === 'USD' ? `${sign}$${withThousands}` : `${sign}${currency} ${withThousands}`;
}

function formatNumber(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined || raw === '') return '';
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(num)) return String(raw);
  // Days / working-days are integer-ish in the API (`"14"`, `"10"`); render
  // without a forced decimal but preserve fractional values if a future
  // response starts emitting them.
  return Number.isInteger(num) ? String(num) : num.toFixed(2);
}

// TODO(ds-gap): status chip color tokens. The design system exposes only
// `--status-{active|inactive}-*`; per-status tokens (`--status-approved-bg`,
// etc.) do not exist yet. Falling back to `--accent-soft` / `--accent` keeps
// every chip on tokens; the tokens should be added when the chip design is
// finalised across statuses.
const STATUS_CHIP_STYLE: Record<
  NonNullable<TimeOffRow['status']>,
  React.CSSProperties
> = {
  approved: { background: 'var(--accent-soft)', color: 'var(--accent)' },
  pending: { background: 'var(--accent-soft)', color: 'var(--accent)' },
  rejected: { background: 'var(--accent-soft)', color: 'var(--accent)' },
  cancelled: { background: 'var(--accent-soft)', color: 'var(--accent)' },
};

function StatusChip({ status }: { status: NonNullable<TimeOffRow['status']> }) {
  const style = STATUS_CHIP_STYLE[status];
  return (
    <span
      style={{
        display: 'inline-block',
        marginLeft: 8,
        padding: '2px 8px',
        borderRadius: 'var(--radius-pill)',
        fontFamily: 'var(--font-display)',
        fontSize: 'var(--fs-11)',
        fontWeight: 600,
        letterSpacing: '.4px',
        textTransform: 'capitalize',
        ...style,
      }}
    >
      {status}
    </span>
  );
}

function ReportTable({
  groups,
  currency,
}: {
  groups: TimeOffGroup[];
  currency: string;
}) {
  const grandTotal = useMemo(() => {
    let days = 0;
    let workingDays = 0;
    let deduction = 0;
    for (const g of groups) {
      days += Number(g.total?.days ?? 0) || 0;
      workingDays += Number(g.total?.workingDays ?? 0) || 0;
      deduction += Number(g.total?.deduction ?? 0) || 0;
    }
    return { days, workingDays, deduction };
  }, [groups]);

  return (
    <div
      data-testid="reports-table"
      role="table"
      aria-label="Time off"
      style={{
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-2xl)',
        overflow: 'hidden',
      }}
    >
      {groups.map((group) => (
        <div key={group.id} role="rowgroup" data-testid={`reports-group-${group.id}`}>
          <div role="row">
            <div
              role="rowheader"
              data-testid={`reports-group-${group.id}-band`}
              style={{
                position: 'sticky',
                top: 0,
                zIndex: 1,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 20px',
                background: 'var(--bg-header)',
                borderTop: '1px solid var(--divider)',
                fontFamily: 'var(--font-display)',
                fontWeight: 600,
                fontSize: 'var(--fs-13)',
                color: 'var(--text-sub)',
              }}
            >
              <span>{group.title}</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>
                {formatNumber(group.total?.workingDays)} working days
                {group.total?.deduction !== null && group.total?.deduction !== undefined
                  ? ` · ${formatMoney(group.total.deduction, currency)}`
                  : ''}
              </span>
            </div>
          </div>

          <div role="row">
            <div
              role="rowheader"
              style={{
                display: 'flex',
                padding: '0 20px',
                height: 42,
                background: 'var(--bg-panel-2)',
                borderTop: '1px solid var(--divider)',
                fontFamily: 'var(--font-display)',
                fontWeight: 600,
                fontSize: 'var(--fs-11)',
                letterSpacing: '1px',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                alignItems: 'center',
                gap: 8,
                width: '100%',
              }}
            >
              {TIME_OFF_COLUMNS.map((h) => (
                <div key={h.value} style={headerCellStyle(h.value)}>
                  {h.title}
                </div>
              ))}
            </div>
          </div>

          {group.rows.map((row, index) => (
            <div
              key={`${group.id}-${index}`}
              role="row"
              data-testid={`reports-group-${group.id}-row-${index}`}
              style={{
                display: 'flex',
                padding: '0 20px',
                minHeight: 52,
                borderTop: '1px solid var(--divider)',
                alignItems: 'center',
                fontSize: 'var(--fs-14)',
                gap: 8,
              }}
            >
              {TIME_OFF_COLUMNS.map((h) => (
                <div key={h.value} style={bodyCellStyle(h.value)}>
                  {renderCell(h.value, row, currency)}
                </div>
              ))}
            </div>
          ))}

          {/* Per-group total row — hidden when there is only ONE group so it
              doesn't duplicate the grand-total footer below. */}
          {groups.length > 1 && (
            <div
              role="row"
              data-testid={`reports-group-${group.id}-total`}
              style={{
                display: 'flex',
                padding: '10px 20px',
                background: 'var(--bg-panel-2)',
                borderTop: '1px solid var(--divider)',
                fontFamily: 'var(--font-display)',
                fontWeight: 600,
                fontSize: 'var(--fs-13)',
                color: 'var(--text)',
                gap: 8,
                alignItems: 'center',
              }}
            >
              {TIME_OFF_COLUMNS.map((h) => (
                <div key={h.value} style={bodyCellStyle(h.value)}>
                  {renderTotalCell(h.value, group.total, currency)}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      <div
        role="row"
        data-testid="reports-table-footer"
        style={{
          display: 'flex',
          padding: '14px 20px',
          background: 'var(--bg-panel-2)',
          borderTop: '2px solid var(--divider)',
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: 'var(--fs-14)',
          color: 'var(--text)',
          gap: 8,
          alignItems: 'center',
        }}
      >
        {TIME_OFF_COLUMNS.map((h, i) => (
          <div key={h.value} style={bodyCellStyle(h.value)}>
            {i === 0 ? (
              <span
                style={{
                  color: 'var(--text-sub)',
                  textTransform: 'uppercase',
                  letterSpacing: '.6px',
                  fontSize: 'var(--fs-11)',
                }}
              >
                Total
              </span>
            ) : h.value === 'days' ? (
              <span style={{ fontFamily: 'var(--font-mono)' }}>
                {formatNumber(grandTotal.days)}
              </span>
            ) : h.value === 'workingDays' ? (
              <span style={{ fontFamily: 'var(--font-mono)' }}>
                {formatNumber(grandTotal.workingDays)}
              </span>
            ) : h.value === 'deduction' ? (
              <span style={{ fontFamily: 'var(--font-mono)' }}>
                {formatMoney(grandTotal.deduction, currency)}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function headerCellStyle(value: string): React.CSSProperties {
  const numeric = NUMERIC_COLUMN_KEYS.has(value);
  // Fixed widths for the numeric columns so amounts line up column-to-column;
  // flex grow for the text columns so Type + Period take the slack.
  const widths: Record<string, number> = {
    days: 100,
    workingDays: 130,
    deduction: 140,
  };
  const width = widths[value];
  const textFlex: Record<string, number> = {
    type: 1,
    period: 2,
  };
  const flex = textFlex[value] ?? 1.4;
  return {
    ...(width ? { width, flex: 'none' } : { flex }),
    padding: '0 6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: numeric ? 'flex-end' : 'flex-start',
    textAlign: numeric ? 'right' : 'left',
    minWidth: 0,
  };
}

function bodyCellStyle(value: string): React.CSSProperties {
  return headerCellStyle(value);
}

function renderCell(
  key: keyof TimeOffRow,
  row: TimeOffRow,
  currency: string,
): React.ReactNode {
  if (key === 'deduction') {
    // Holiday rows: `deduction: null` — render an em-dash so the column line
    // still reads clean, no misleading `$0.00`.
    if (row.deduction === null) {
      return (
        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>—</span>
      );
    }
    return (
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontWeight: 600,
          color: 'var(--text)',
        }}
      >
        {formatMoney(row.deduction, currency)}
      </span>
    );
  }
  if (key === 'days' || key === 'workingDays') {
    return (
      <span style={{ fontFamily: 'var(--font-mono)' }}>
        {formatNumber(row[key] as string)}
      </span>
    );
  }
  if (key === 'type') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          fontFamily: 'var(--font-display)',
          fontWeight: 500,
          color: 'var(--text)',
        }}
      >
        {row.type}
        {row.kind === 'vacation' && row.status && <StatusChip status={row.status} />}
      </span>
    );
  }
  const raw = row[key];
  return <span>{String(raw ?? '')}</span>;
}

function renderTotalCell(
  key: keyof TimeOffRow,
  total: TimeOffGroup['total'],
  currency: string,
): React.ReactNode {
  if (key === 'deduction') {
    if (total.deduction === null || total.deduction === undefined) {
      return (
        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>—</span>
      );
    }
    return (
      <span style={{ fontFamily: 'var(--font-mono)' }}>
        {formatMoney(total.deduction, currency)}
      </span>
    );
  }
  if (key === 'days' || key === 'workingDays') {
    const raw = total[key];
    if (raw === undefined || raw === null || raw === '') return null;
    return (
      <span style={{ fontFamily: 'var(--font-mono)' }}>{formatNumber(raw)}</span>
    );
  }
  return null;
}

/* ────────────────────────────────────────────────────────────────────────── *
 * States — loading, empty, error
 * ────────────────────────────────────────────────────────────────────────── */

function LoadingSkeleton() {
  const block = (w: number | string, h: number, radius = 8): React.CSSProperties => ({
    width: w,
    height: h,
    borderRadius: radius,
    background: 'var(--bg-sunken)',
  });
  return (
    <div data-testid="reports-loading-skeleton">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
          marginBottom: 18,
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-2xl)',
              padding: 16,
            }}
          >
            <div style={block(80, 12)} />
            <div style={{ ...block(140, 22), marginTop: 8 }} />
          </div>
        ))}
      </div>
      <div
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
              gap: 20,
              padding: '14px 20px',
              borderTop: '1px solid var(--divider)',
              alignItems: 'center',
            }}
          >
            <div style={{ ...block(160, 14), flex: 1.5 }} />
            <div style={{ ...block(200, 14), flex: 1.5 }} />
            <div style={{ ...block(80, 14) }} />
            <div style={{ ...block(80, 14) }} />
            <div style={{ ...block(100, 14) }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      data-testid="reports-empty-state"
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
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: 'var(--fs-18)',
          color: 'var(--text)',
        }}
      >
        {REPORTS_MESSAGES.emptyState}
      </div>
    </div>
  );
}

function ErrorBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div data-testid="reports-error-banner">
      <InfoBanner tone="error" role="alert">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--sp-4)',
          }}
        >
          <span>{REPORTS_MESSAGES.toastServerError}</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={onRetry}
            data-testid="reports-error-retry-btn"
          >
            Retry
          </Button>
        </div>
      </InfoBanner>
    </div>
  );
}

