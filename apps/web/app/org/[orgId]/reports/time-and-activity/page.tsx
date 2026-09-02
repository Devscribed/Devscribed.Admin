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
import { ToggleChip } from '@/reports/ToggleChip';
import { daysAgoInTz, formatRangeLabel, todayInTz } from '@/reports/date-utils';
import type {
  BillableFilter,
  FilterOption,
  OwnerScope,
  ReportColumn,
  ReportGroup,
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

/** Numeric columns (right-aligned + mono font). */
const NUMERIC_COLUMN_KEYS = new Set([
  'time',
  'billableTime',
  'nonBillableTime',
  'billedAmount',
  'spent',
]);
const MONEY_COLUMN_KEYS = new Set(['billedAmount', 'spent']);

/**
 * lowercase-dashed slug of a column title, used both for
 * `reports-filter-columns-item-{key}` and by the summary strip.
 */
function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

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

  if (!authorized) return null;

  const showToggle = canViewAll && canViewMy;
  const title = owner === 'my' ? 'My Time & Activity' : 'Time & Activity';
  const rangeLabel = formatRangeLabel(startDate, endDate);
  const currency = data?.meta.currencyCode ?? 'USD';

  // Predicted "shown" count = 3 always-shown defaults + any selected optional
  // columns the caller is actually allowed to see. Matches what the server
  // will return in `response.headers`.
  const shownColumnCount =
    ALWAYS_SHOWN.length +
    selectedColumns.filter((c) => columnAllowed(c, canViewBilled, canViewSpent)).length;

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
        projectOptions={projectOptions}
        projectIds={projectIds}
        onProjectIdsChange={setProjectIds}
        showClients={clientFilterAvailable}
        clientOptions={clientOptions}
        clientIds={clientIds}
        onClientIdsChange={setClientIds}
        sumDateRanges={sumDateRanges}
        onSumDateRangesChange={setSumDateRanges}
        detailedReports={detailedReports}
        onDetailedReportsChange={setDetailedReports}
        selectedColumns={selectedColumns}
        onSelectedColumnsChange={setSelectedColumns}
        canViewBilled={canViewBilled}
        canViewSpent={canViewSpent}
        shownColumnCount={shownColumnCount}
        billable={billable}
        onBillableChange={setBillable}
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
          <ReportTable
            headers={data.headers}
            groups={data.groups}
            currency={currency}
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
  projectOptions,
  projectIds,
  onProjectIdsChange,
  showClients,
  clientOptions,
  clientIds,
  onClientIdsChange,
  sumDateRanges,
  onSumDateRangesChange,
  detailedReports,
  onDetailedReportsChange,
  selectedColumns,
  onSelectedColumnsChange,
  canViewBilled,
  canViewSpent,
  shownColumnCount,
  billable,
  onBillableChange,
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
  projectOptions: FilterOption[];
  projectIds: string[];
  onProjectIdsChange: (next: string[]) => void;
  showClients: boolean;
  clientOptions: FilterOption[];
  clientIds: string[];
  onClientIdsChange: (next: string[]) => void;
  sumDateRanges: boolean;
  onSumDateRangesChange: (next: boolean) => void;
  detailedReports: boolean;
  onDetailedReportsChange: (next: boolean) => void;
  selectedColumns: ReportColumn[];
  onSelectedColumnsChange: (next: ReportColumn[]) => void;
  canViewBilled: boolean;
  canViewSpent: boolean;
  shownColumnCount: number;
  billable: BillableFilter;
  onBillableChange: (next: BillableFilter) => void;
  rangeError: string | null;
  genericError: string | null;
}) {
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
        <MultiSelectFilter
          label="Projects"
          testId="reports-filter-projects"
          options={projectOptions}
          selected={projectIds}
          onChange={onProjectIdsChange}
        />
        {showClients && (
          <MultiSelectFilter
            label="Clients"
            testId="reports-filter-clients"
            options={clientOptions}
            selected={clientIds}
            onChange={onClientIdsChange}
          />
        )}
        <ColumnsPicker
          selected={selectedColumns}
          onChange={onSelectedColumnsChange}
          canViewBilled={canViewBilled}
          canViewSpent={canViewSpent}
          shownColumnCount={shownColumnCount}
        />
        <BillableDropdown value={billable} onChange={onBillableChange} />
        <span style={{ flex: 1 }} />
        <ToggleChip
          label="Sum date ranges"
          testId="reports-filter-sum-toggle"
          active={sumDateRanges}
          onChange={onSumDateRangesChange}
        />
        <ToggleChip
          label="Detailed"
          testId="reports-filter-detailed-toggle"
          active={detailedReports}
          onChange={onDetailedReportsChange}
        />
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
 * Columns picker (spec §Column permission filter + §Alt Flow C)
 * ────────────────────────────────────────────────────────────────────────── */

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
    <div
      ref={wrapperRef}
      style={{ position: 'relative', display: 'inline-block' }}
    >
      <button
        type="button"
        data-testid="reports-filter-columns"
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
          Columns:
        </span>
        {`${shownColumnCount} shown`}
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
            minWidth: 260,
            maxHeight: 360,
            overflowY: 'auto',
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-modal)',
            padding: 8,
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
              <label
                key={col}
                data-testid={`reports-filter-columns-item-${key}`}
                aria-disabled={disabled ? 'true' : undefined}
                title={always ? 'Always shown' : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-sm)',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  fontSize: 'var(--fs-14)',
                  color: disabled ? 'var(--text-muted)' : 'var(--text)',
                  opacity: disabled ? 0.7 : 1,
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggle(col)}
                  style={{ accentColor: 'var(--accent)' }}
                />
                <span style={{ flex: 1 }}>{col}</span>
                {tag && (
                  <span
                    style={{
                      fontSize: 'var(--fs-11)',
                      color: 'var(--text-muted)',
                      fontFamily: 'var(--font-display)',
                      background: 'var(--bg-sunken)',
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-pill)',
                    }}
                  >
                    {tag}
                  </span>
                )}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Billable dropdown (spec §API — Row filter — billable)
 * ────────────────────────────────────────────────────────────────────────── */

const BILLABLE_LABEL: Record<BillableFilter, string> = {
  all: 'All',
  billable: 'Billable only',
  'non-billable': 'Non-billable only',
};

function BillableDropdown({
  value,
  onChange,
}: {
  value: BillableFilter;
  onChange: (next: BillableFilter) => void;
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

  function pick(next: BillableFilter) {
    onChange(next);
    setOpen(false);
  }

  return (
    <div
      ref={wrapperRef}
      data-testid="reports-filter-billable"
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
          Billable:
        </span>
        {BILLABLE_LABEL[value]}
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
          {(Object.keys(BILLABLE_LABEL) as BillableFilter[]).map((opt) => {
            const active = opt === value;
            return (
              <button
                key={opt}
                type="button"
                role="option"
                aria-selected={active}
                data-testid={`reports-filter-billable-item-${opt}`}
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
                {BILLABLE_LABEL[opt]}
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
 * Report table (grouped by project)
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

function formatHours(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined || raw === '') return '';
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(num)) return String(raw);
  return `${num.toFixed(2)}h`;
}

function ReportTable({
  headers,
  groups,
  currency,
}: {
  headers: { title: string; value: string }[];
  groups: ReportGroup<TimeAndActivityRow>[];
  currency: string;
}) {
  // Grand-total accumulator over every numeric column the response emitted.
  const grandTotal = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const h of headers) {
      if (!NUMERIC_COLUMN_KEYS.has(h.value)) continue;
      let sum = 0;
      for (const g of groups) {
        const raw = g.total?.[h.value];
        const num = typeof raw === 'number' ? raw : Number(raw ?? 0);
        if (Number.isFinite(num)) sum += num;
      }
      totals[h.value] = sum;
    }
    return totals;
  }, [groups, headers]);

  return (
    <div
      data-testid="reports-table"
      role="table"
      aria-label="Time and activity"
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
                {formatHours(group.total?.time as string | number)}
                {group.total?.billedAmount !== undefined && group.total?.billedAmount !== null
                  ? ` · ${formatMoney(group.total.billedAmount as string | number, currency)}`
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
              {headers.map((h) => (
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
              {headers.map((h) => (
                <div
                  key={h.value}
                  role="cell"
                  style={bodyCellStyle(h.value)}
                >
                  {renderCell(h.value, row, currency)}
                </div>
              ))}
            </div>
          ))}

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
            {headers.map((h) => (
              <div key={h.value} style={bodyCellStyle(h.value)}>
                {renderTotalCell(h.value, group.total, currency)}
              </div>
            ))}
          </div>
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
        {headers.map((h, i) => (
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
            ) : NUMERIC_COLUMN_KEYS.has(h.value) ? (
              <span style={{ fontFamily: 'var(--font-mono)' }}>
                {MONEY_COLUMN_KEYS.has(h.value)
                  ? formatMoney(grandTotal[h.value] ?? 0, currency)
                  : formatHours(grandTotal[h.value] ?? 0)}
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
  // Fixed widths for numeric columns so amounts line up column-to-column, and
  // flex grow for text columns so Project + Notes take up the slack.
  const widths: Record<string, number> = {
    time: 110,
    billableTime: 130,
    nonBillableTime: 140,
    billedAmount: 140,
    spent: 130,
  };
  const width = widths[value];
  const textFlex: Record<string, number> = {
    member: 1.2,
    client: 1.2,
    notes: 2,
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
  key: string,
  row: TimeAndActivityRow,
  currency: string,
): React.ReactNode {
  const raw = row[key as keyof TimeAndActivityRow];
  if (MONEY_COLUMN_KEYS.has(key)) {
    return (
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontWeight: key === 'billedAmount' ? 600 : 400,
          color: 'var(--text)',
        }}
      >
        {formatMoney(raw as string, currency)}
      </span>
    );
  }
  if (NUMERIC_COLUMN_KEYS.has(key)) {
    return <span style={{ fontFamily: 'var(--font-mono)' }}>{formatHours(raw as string)}</span>;
  }
  if (key === 'member') {
    return (
      <span
        style={{ fontFamily: 'var(--font-display)', fontWeight: 500, color: 'var(--text)' }}
      >
        {String(raw ?? '')}
      </span>
    );
  }
  return <span>{String(raw ?? '')}</span>;
}

function renderTotalCell(
  key: string,
  total: ReportGroup<TimeAndActivityRow>['total'],
  currency: string,
): React.ReactNode {
  const raw = total?.[key];
  if (raw === undefined || raw === null || raw === '') return null;
  if (MONEY_COLUMN_KEYS.has(key)) {
    return (
      <span style={{ fontFamily: 'var(--font-mono)' }}>
        {formatMoney(raw as string, currency)}
      </span>
    );
  }
  if (NUMERIC_COLUMN_KEYS.has(key)) {
    return <span style={{ fontFamily: 'var(--font-mono)' }}>{formatHours(raw as string)}</span>;
  }
  return <span>{String(raw ?? '')}</span>;
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
