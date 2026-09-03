'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge,
  DateRangePicker,
  ReportControls,
  ReportSummaryBanner,
  ReportTableTitle,
  type ReportTableColumn,
} from '@devscribed/ds';
import { useSession } from '@/layout/session-context';
import { useToast } from '@/toast';
import {
  REPORTS_MESSAGES,
  can,
  hasCapability,
  type Role,
} from '@devscribed/validation';
import { MultiFilter, ScopeToggle, SingleFilter } from '@/reports/ReportFilters';
import {
  ReportEmptyState,
  ReportErrorBanner,
  ReportFilterError,
  ReportLoadingSkeleton,
} from '@/reports/ReportStates';
import { ReportTable } from '@/reports/ReportTable';
import { formatMoney, formatNumber, slugify } from '@/reports/format';
import { daysAgoInTz, formatRangeLabel, rangePresets, todayInTz } from '@/reports/date-utils';
import type {
  FilterOption,
  OwnerScope,
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

/** Fixed widths, so a figure sits under the figure above it whatever the group. */
const COLUMN_WIDTHS: Record<string, number> = {
  days: 100,
  workingDays: 130,
  deduction: 140,
};

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

/**
 * A vacation's state, in `Badge`'s tones (§32, §59).
 *
 * The four states were painted identically before — one blue tint for approved, pending,
 * rejected and cancelled alike — which is a status colour saying nothing. §32 is written for
 * exactly this: a workflow with more than two states cannot be drawn in two without one of
 * them lying, so it carries four. `cancelled` takes `neutral`, the tone that is *not* a
 * status: a request somebody withdrew did not go well or badly, it stopped.
 */
const STATUS_TONE: Record<NonNullable<TimeOffRow['status']>, 'active' | 'warning' | 'inactive' | 'neutral'> = {
  approved: 'active',
  pending: 'warning',
  rejected: 'inactive',
  cancelled: 'neutral',
};

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

  // ── Presentation ──────────────────────────────────────────────────────────
  const currency = data?.meta.currencyCode ?? 'USD';
  const presets = useMemo(() => rangePresets(tz), [tz]);
  const maxDate = useMemo(() => todayInTz(tz), [tz]);

  const columns = useMemo<ReportTableColumn<TimeOffRow>[]>(
    () =>
      TIME_OFF_COLUMNS.map((header) => ({
        key: header.value,
        label: header.title,
        align: NUMERIC_COLUMN_KEYS.has(header.value) ? 'end' : 'start',
        width: COLUMN_WIDTHS[header.value],
        render: (row) => renderCell(header.value, row, currency),
        renderTotal: (total) => renderTotal(header.value, total, currency),
      })),
    [currency],
  );

  const grandTotal = useMemo(() => {
    if (!data) return null;
    let days = 0;
    let workingDays = 0;
    let deduction = 0;
    for (const group of data.groups) {
      days += Number(group.total?.days ?? 0) || 0;
      workingDays += Number(group.total?.workingDays ?? 0) || 0;
      deduction += Number(group.total?.deduction ?? 0) || 0;
    }
    return { days, workingDays, deduction };
  }, [data]);

  if (!authorized) return null;

  const showToggle = canViewAll && canViewMy;
  const title = owner === 'my' ? 'My Time Off' : 'Time Off';
  const rangeLabel = formatRangeLabel(startDate, endDate);
  // A holiday has no approval state, so the Status filter is not drawn for it.
  const showStatus = type !== 'holiday';

  return (
    <div>
      <ReportTableTitle
        data-testid="reports-page"
        title={title}
        titleTestId="reports-page-title"
        caption={`${rangeLabel} · ${currency}`}
        captionTestId="reports-page-sub"
        onExport={canExport ? () => void handleExport() : undefined}
        exportLabel="Export PDF"
        exportBusyLabel="Rendering PDF…"
        exporting={exporting}
        exportTestId="reports-export-pdf-btn"
      />

      <ReportControls
        scope={showToggle ? <ScopeToggle owner={owner} onChange={setOwner} /> : undefined}
        messages={
          <>
            {rangeError && (
              <ReportFilterError testId="reports-filter-range-error">{rangeError}</ReportFilterError>
            )}
            {genericFilterError && (
              <ReportFilterError testId="reports-filter-generic-error">
                {genericFilterError}
              </ReportFilterError>
            )}
          </>
        }
      >
        <DateRangePicker
          data-testid="reports-filter-range"
          triggerTestId="reports-filter-range-input"
          label="Range"
          start={startDate}
          end={endDate}
          maxDate={maxDate}
          presets={presets}
          onChange={([from, to]) => {
            setStartDate(from);
            setEndDate(to);
          }}
        />
        {owner === 'all' && (
          <MultiFilter
            label="Members"
            testId="reports-filter-members"
            options={memberOptions}
            selected={memberIds}
            onChange={setMemberIds}
          />
        )}
        <SingleFilter<TimeOffTypeFilter>
          label="Type"
          testId="reports-filter-type"
          value={type}
          options={Object.keys(TYPE_LABEL) as TimeOffTypeFilter[]}
          labelFor={(option) => TYPE_LABEL[option]}
          onChange={setType}
        />
        {showStatus && (
          <SingleFilter<TimeOffStatusFilter>
            label="Status"
            testId="reports-filter-status"
            value={status}
            options={Object.keys(STATUS_LABEL) as TimeOffStatusFilter[]}
            labelFor={(option) => STATUS_LABEL[option]}
            onChange={setStatus}
          />
        )}
      </ReportControls>

      {loading ? (
        <ReportLoadingSkeleton />
      ) : serverError ? (
        <ReportErrorBanner onRetry={() => void load()} />
      ) : data && data.groups.length === 0 ? (
        <ReportEmptyState />
      ) : data ? (
        <>
          <ReportSummaryBanner
            data-testid="reports-summary-strip"
            summary={data.summary.map((item) => ({
              label: item.label,
              value: item.value,
              testId: `reports-summary-tile-${slugify(item.label)}`,
            }))}
          />
          <ReportTable<TimeOffRow>
            ariaLabel="Time off"
            columns={columns}
            groups={data.groups}
            grandTotal={grandTotal}
            grandTotalLabel="Total"
          />
        </>
      ) : null}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Cells
 * ────────────────────────────────────────────────────────────────────────── */

function renderCell(key: keyof TimeOffRow, row: TimeOffRow, currency: string): React.ReactNode {
  if (key === 'deduction') {
    // Holiday rows: `deduction: null` — render an em-dash so the column line
    // still reads clean, no misleading `$0.00`.
    if (row.deduction === null) {
      return <span style={{ color: 'var(--text-secondary)' }}>—</span>;
    }
    return (
      <span style={{ fontWeight: 'var(--font-weight-semibold)' }}>
        {formatMoney(row.deduction, currency)}
      </span>
    );
  }
  if (key === 'days' || key === 'workingDays') return formatNumber(row[key] as string);
  if (key === 'type') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <span style={{ fontWeight: 'var(--font-weight-medium)' }}>{row.type}</span>
        {row.kind === 'vacation' && row.status && (
          <Badge status={STATUS_TONE[row.status]} size="s" style={{ textTransform: 'capitalize' }}>
            {row.status}
          </Badge>
        )}
      </span>
    );
  }
  return String(row[key] ?? '');
}

function renderTotal(
  key: keyof TimeOffRow,
  total: Record<string, any>,
  currency: string,
): React.ReactNode {
  if (key === 'deduction') {
    if (total?.deduction === null || total?.deduction === undefined) {
      return <span style={{ color: 'var(--text-secondary)' }}>—</span>;
    }
    return formatMoney(total.deduction, currency);
  }
  if (key === 'days' || key === 'workingDays') {
    const raw = total?.[key];
    if (raw === undefined || raw === null || raw === '') return null;
    return formatNumber(raw);
  }
  return null;
}
