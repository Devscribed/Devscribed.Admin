'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Checkbox,
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
import { AggregationToggle, MultiFilter, ScopeToggle, SingleFilter } from '@/reports/ReportFilters';
import {
  ReportEmptyState,
  ReportErrorBanner,
  ReportFilterError,
  ReportLoadingSkeleton,
} from '@/reports/ReportStates';
import { ReportTable } from '@/reports/ReportTable';
import { formatHours, formatMoney, slugify } from '@/reports/format';
import { daysAgoInTz, formatRangeLabel, rangePresets, todayInTz } from '@/reports/date-utils';
import type {
  BillableFilter,
  FilterOption,
  OwnerScope,
  ReportColumn,
  TimeAndActivityResponse,
  TimeAndActivityRow,
} from '@/reports/types';

const DEFAULT_RANGE_DAYS = 30;

/**
 * Full T&A column list (spec §Column permission filter, req 8). Order here is
 * the order the picker renders; the server determines the response header
 * order after intersection.
 */
const ALL_COLUMNS: ReportColumn[] = [
  'Project',
  'Time',
  'Member',
  'Client',
  'Billable Time',
  'Non-Billable Time',
  'Billed Amount',
  'Spent',
  'Notes',
];

/** Spec §Column permission filter req 9 — cannot be deselected. */
const ALWAYS_SHOWN: ReportColumn[] = ['Project', 'Time', 'Member'];

/** Numeric columns — right-aligned, and summed into the grand total. */
const NUMERIC_COLUMN_KEYS = new Set([
  'time',
  'billableTime',
  'nonBillableTime',
  'billedAmount',
  'spent',
]);
const MONEY_COLUMN_KEYS = new Set(['billedAmount', 'spent']);

/** Fixed widths, so a figure sits under the figure above it whatever the group. */
const COLUMN_WIDTHS: Record<string, number> = {
  time: 110,
  billableTime: 130,
  nonBillableTime: 140,
  billedAmount: 140,
  spent: 130,
};

const BILLABLE_LABEL: Record<BillableFilter, string> = {
  all: 'All',
  billable: 'Billable only',
  'non-billable': 'Non-billable only',
};

/**
 * Time & Activity report screen (spec reports/01 §Screens · Report shell +
 * §API Contracts). Structural clone of the Amounts Owed page — same
 * URL-persisted filter state, same owner-scope logic, same PDF export flow —
 * with two additions specific to Time & Activity: a Columns picker (§Column
 * permission filter) and a Billable row filter (§API — Row filter — billable).
 * Column and role-capability decisions here are UI convenience only: the
 * server re-enforces every gate and drops denied columns from the response.
 */
export default function TimeAndActivityPage({
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
  const canViewAll = hasCapability(role, 'ViewTimeAndActivity');
  const canViewMy = hasCapability(role, 'ViewMyTimeAndActivity');
  const canViewBilled = hasCapability(role, 'ViewTimeAndActivityBilled');
  const canViewSpent = hasCapability(role, 'ViewTimeAndActivitySpent');
  const canExport = can(role, 'export-reports');
  const canViewClients = can(role, 'view-clients');
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
  const initialProjectIds = searchParams.getAll('projectIds');
  const initialClientIds = searchParams.getAll('clientIds');
  const initialSum = searchParams.get('sumDateRanges') === 'true';
  const initialDetailed = searchParams.get('detailedReports') === 'true';
  // Columns URL params are only the *optional* columns the caller has chosen
  // (spec §Column permission filter req 9 — the three defaults are always
  // included by the server and are not part of the request payload).
  const initialSelectedColumns = searchParams
    .getAll('columns')
    .filter((c): c is ReportColumn =>
      (ALL_COLUMNS as string[]).includes(c) && !(ALWAYS_SHOWN as string[]).includes(c),
    );
  const initialBillable = ((): BillableFilter => {
    const raw = searchParams.get('billable');
    return raw === 'billable' || raw === 'non-billable' ? raw : 'all';
  })();

  const [owner, setOwner] = useState<OwnerScope>(initialOwner);
  const [startDate, setStartDate] = useState<string>(initialStart);
  const [endDate, setEndDate] = useState<string>(initialEnd);
  const [memberIds, setMemberIds] = useState<string[]>(initialMemberIds);
  const [projectIds, setProjectIds] = useState<string[]>(initialProjectIds);
  const [clientIds, setClientIds] = useState<string[]>(initialClientIds);
  const [sumDateRanges, setSumDateRanges] = useState<boolean>(initialSum);
  const [detailedReports, setDetailedReports] = useState<boolean>(initialDetailed);
  const [selectedColumns, setSelectedColumns] = useState<ReportColumn[]>(initialSelectedColumns);
  const [billable, setBillable] = useState<BillableFilter>(initialBillable);

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
    for (const id of projectIds) next.append('projectIds', id);
    for (const id of clientIds) next.append('clientIds', id);
    if (sumDateRanges) next.set('sumDateRanges', 'true');
    if (detailedReports) next.set('detailedReports', 'true');
    for (const col of selectedColumns) next.append('columns', col);
    // `billable=all` is the server default; omit to keep the URL clean.
    if (billable !== 'all') next.set('billable', billable);
    router.replace(`?${next.toString()}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    authorized,
    owner,
    startDate,
    endDate,
    memberIds,
    projectIds,
    clientIds,
    sumDateRanges,
    detailedReports,
    selectedColumns,
    billable,
  ]);

  // ── Filter option catalogues ──────────────────────────────────────────────
  const [memberOptions, setMemberOptions] = useState<FilterOption[]>([]);
  const [projectOptions, setProjectOptions] = useState<FilterOption[]>([]);
  const [clientOptions, setClientOptions] = useState<FilterOption[]>([]);
  const [clientFilterAvailable, setClientFilterAvailable] = useState<boolean>(canViewClients);

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

    async function loadProjects(): Promise<void> {
      try {
        const res = await fetch(`/api/organizations/${orgId}/projects`, {
          credentials: 'same-origin',
        });
        if (cancelled || !res.ok) return;
        const data = (await res.json()) as { projects?: { id: string; name: string }[] };
        setProjectOptions(
          (data.projects ?? []).map((p) => ({ id: p.id, label: p.name })),
        );
      } catch {
        /* silent */
      }
    }

    async function loadClients(): Promise<void> {
      if (!canViewClients) {
        setClientFilterAvailable(false);
        return;
      }
      try {
        const res = await fetch(`/api/organizations/${orgId}/clients`, {
          credentials: 'same-origin',
        });
        if (cancelled) return;
        if (res.status === 403 || res.status === 404) {
          setClientFilterAvailable(false);
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as { clients?: { id: string; name: string }[] };
        setClientOptions(
          (data.clients ?? []).map((c) => ({ id: c.id, label: c.name })),
        );
      } catch {
        /* silent */
      }
    }

    void loadMembers();
    void loadProjects();
    void loadClients();
    return () => {
      cancelled = true;
    };
  }, [orgId, authorized, canViewClients]);

  // ── Report data ────────────────────────────────────────────────────────────
  const [data, setData] = useState<TimeAndActivityResponse | null>(null);
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
    for (const id of projectIds) q.append('projectIds', id);
    for (const id of clientIds) q.append('clientIds', id);
    if (sumDateRanges) q.set('sumDateRanges', 'true');
    if (detailedReports) q.set('detailedReports', 'true');
    for (const col of selectedColumns) q.append('columns', col);
    if (billable !== 'all') q.set('billable', billable);
    return q;
  }, [
    startDate,
    endDate,
    owner,
    memberIds,
    projectIds,
    clientIds,
    sumDateRanges,
    detailedReports,
    selectedColumns,
    billable,
  ]);

  const load = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      setLoading(true);
      setServerError(false);
      setRangeError(null);
      setGenericFilterError(null);
      const requestId = ++lastRequestRef.current;
      const path = owner === 'my' ? 'time-and-activity/my' : 'time-and-activity';
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
        const body = (await res.json()) as TimeAndActivityResponse;
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
    const path = owner === 'my' ? 'time-and-activity/pdf/my' : 'time-and-activity/pdf';
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
      const filename =
        match?.[1] ?? `TimeAndActivity_${startDate}_to_${endDate}.pdf`;
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

  const columns = useMemo<ReportTableColumn<TimeAndActivityRow>[]>(
    () =>
      (data?.headers ?? []).map((header) => ({
        key: header.value,
        label: header.title,
        align: NUMERIC_COLUMN_KEYS.has(header.value) ? 'end' : 'start',
        width: COLUMN_WIDTHS[header.value],
        render: (row) => renderCell(header.value, row, currency),
        renderTotal: (total) => renderFigure(header.value, total?.[header.value], currency),
      })),
    [data?.headers, currency],
  );

  /** Every numeric column the response emitted, summed across the groups. */
  const grandTotal = useMemo(() => {
    if (!data) return null;
    const totals: Record<string, number> = {};
    for (const header of data.headers) {
      if (!NUMERIC_COLUMN_KEYS.has(header.value)) continue;
      let sum = 0;
      for (const group of data.groups) {
        const raw = group.total?.[header.value];
        const num = typeof raw === 'number' ? raw : Number(raw ?? 0);
        if (Number.isFinite(num)) sum += num;
      }
      totals[header.value] = sum;
    }
    return totals;
  }, [data]);

  if (!authorized) return null;

  const showToggle = canViewAll && canViewMy;
  const title = owner === 'my' ? 'My Time & Activity' : 'Time & Activity';
  const rangeLabel = formatRangeLabel(startDate, endDate);

  // Predicted "shown" count = 3 always-shown defaults + any selected optional
  // columns the caller is actually allowed to see. Matches what the server
  // will return in `response.headers`.
  const shownColumnCount =
    ALWAYS_SHOWN.length +
    selectedColumns.filter((c) => columnAllowed(c, canViewBilled, canViewSpent)).length;

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
        aggregations={
          <>
            <AggregationToggle
              label="Sum date ranges"
              testId="reports-filter-sum-toggle"
              active={sumDateRanges}
              onChange={setSumDateRanges}
            />
            <AggregationToggle
              label="Detailed"
              testId="reports-filter-detailed-toggle"
              active={detailedReports}
              onChange={setDetailedReports}
            />
          </>
        }
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
        <MultiFilter
          label="Projects"
          testId="reports-filter-projects"
          options={projectOptions}
          selected={projectIds}
          onChange={setProjectIds}
        />
        {clientFilterAvailable && (
          <MultiFilter
            label="Clients"
            testId="reports-filter-clients"
            options={clientOptions}
            selected={clientIds}
            onChange={setClientIds}
          />
        )}
        <ColumnsPicker
          selected={selectedColumns}
          onChange={setSelectedColumns}
          canViewBilled={canViewBilled}
          canViewSpent={canViewSpent}
          shownColumnCount={shownColumnCount}
        />
        <SingleFilter<BillableFilter>
          label="Billable"
          testId="reports-filter-billable"
          value={billable}
          options={Object.keys(BILLABLE_LABEL) as BillableFilter[]}
          labelFor={(option) => BILLABLE_LABEL[option]}
          onChange={setBillable}
        />
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
          <ReportTable<TimeAndActivityRow>
            ariaLabel="Time and activity"
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

function columnAllowed(col: ReportColumn, canViewBilled: boolean, canViewSpent: boolean): boolean {
  if (col === 'Billed Amount') return canViewBilled;
  if (col === 'Spent') return canViewSpent;
  return true;
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Columns picker
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * The picker stays a list of real checkboxes rather than becoming a `Select isMulti`, and the
 * spec is why: §Alt Flow C says Spent is listed "grayed out with a small admin-only tag beside
 * it; **the checkbox is disabled**", and §Accessibility says the locked defaults "expose
 * `aria-disabled="true"` with a title **Always shown**". A `Select` moves a chosen option out
 * of the list and into a chip, so a column that is *checked and cannot be unchecked* has
 * nowhere to be drawn — the one state this picker exists to show.
 *
 * What is the system's is everything inside it: `Checkbox` (§79) draws the rows and carries
 * their `disabled`, `Badge` (§59) draws the tags in the one tone that is not a status, and the
 * trigger is a `Button`. What is left local is the panel and its outside-click, because
 * `Popover` (§22) is a menu of actions and these are not actions.
 */
function ColumnsPicker({
  selected,
  onChange,
  canViewBilled,
  canViewSpent,
  shownColumnCount,
}: {
  selected: ReportColumn[];
  onChange: (next: ReportColumn[]) => void;
  canViewBilled: boolean;
  canViewSpent: boolean;
  shownColumnCount: number;
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

  function toggle(col: ReportColumn) {
    if ((ALWAYS_SHOWN as string[]).includes(col)) return;
    if (col === 'Billed Amount' && !canViewBilled) return;
    if (col === 'Spent' && !canViewSpent) return;
    const next = selected.includes(col)
      ? selected.filter((c) => c !== col)
      : [...selected, col];
    onChange(next);
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative', display: 'inline-block' }}>
      <Button
        data-testid="reports-filter-columns"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((p) => !p)}
      >
        {`Columns: ${shownColumnCount} shown`}
      </Button>
      {open && (
        <div
          role="listbox"
          aria-label="Columns"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 1000,
            marginTop: 'var(--space-4)',
            minWidth: 260,
            maxHeight: 360,
            overflowY: 'auto',
            background: 'var(--surface-overlay)',
            border: 'var(--border-width-hairline) solid var(--border-default)',
            borderRadius: 'var(--radius-l)',
            boxShadow: 'var(--shadow-popover)',
            padding: 'var(--space-3)',
          }}
        >
          {ALL_COLUMNS.map((col) => {
            const key = slugify(col);
            const always = (ALWAYS_SHOWN as string[]).includes(col);
            const deniedBilled = col === 'Billed Amount' && !canViewBilled;
            const deniedSpent = col === 'Spent' && !canViewSpent;
            const disabled = always || deniedBilled || deniedSpent;
            // Denied columns are still visible but display unchecked; the
            // always-shown ones display checked (spec §Alt Flow C).
            const checked = always ? true : selected.includes(col);
            const tag = always
              ? 'Always shown'
              : deniedSpent
              ? 'admin only'
              : deniedBilled
              ? 'admin/manager only'
              : null;
            return (
              <div
                key={col}
                role="option"
                aria-selected={checked}
                data-testid={`reports-filter-columns-item-${key}`}
                aria-disabled={disabled ? 'true' : undefined}
                title={always ? 'Always shown' : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-4)',
                  padding: 'var(--space-3) var(--space-4)',
                  borderRadius: 'var(--radius-s)',
                }}
              >
                <Checkbox
                  id={`reports-column-${key}`}
                  label={col}
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggle(col)}
                  wrapperStyle={{ flex: 1 }}
                />
                {tag && (
                  <Badge status="neutral" size="s">
                    {tag}
                  </Badge>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Cells
 * ────────────────────────────────────────────────────────────────────────── */

/** Hours or money, whichever the column holds. Shared by the body and both totals. */
function renderFigure(key: string, raw: unknown, currency: string): React.ReactNode {
  if (raw === undefined || raw === null || raw === '') return null;
  if (MONEY_COLUMN_KEYS.has(key)) return formatMoney(raw as string, currency);
  if (NUMERIC_COLUMN_KEYS.has(key)) return formatHours(raw as string);
  return String(raw);
}

function renderCell(key: string, row: TimeAndActivityRow, currency: string): React.ReactNode {
  const raw = row[key as keyof TimeAndActivityRow];
  if (key === 'billedAmount') {
    return (
      <span style={{ fontWeight: 'var(--font-weight-semibold)' }}>
        {formatMoney(raw as string, currency)}
      </span>
    );
  }
  if (NUMERIC_COLUMN_KEYS.has(key)) return renderFigure(key, raw, currency);
  if (key === 'member' || key === 'project') {
    return <span style={{ fontWeight: 'var(--font-weight-medium)' }}>{String(raw ?? '')}</span>;
  }
  return String(raw ?? '');
}
