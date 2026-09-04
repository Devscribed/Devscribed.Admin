'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { use, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
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
import { AggregationToggle, MultiFilter, ScopeToggle } from '@/reports/ReportFilters';
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
  AmountsOwedResponse,
  AmountsOwedRow,
  FilterOption,
  OwnerScope,
} from '@/reports/types';

const DEFAULT_RANGE_DAYS = 30;

/** Right-aligned, fixed-width columns, so a figure sits under the figure above it. */
const NUMERIC_COLUMNS = new Set(['hours', 'rate', 'amount']);
const COLUMN_WIDTHS: Record<string, number> = { hours: 110, rate: 110, amount: 130 };

/**
 * A row's own ground, by what kind of row it is. The tints are the system's recessed surface
 * and its blue tint — neither is `--holiday-*`, the amber family the merge record holds for
 * Phase 5: this is a row saying which of three sources it came from, not a marker saying a day
 * is a holiday.
 */
const ROW_TINT: Record<string, CSSProperties> = {
  holiday: { background: 'var(--color-blue-light)' },
  vacation: { background: 'var(--surface-sunken)' },
};

/**
 * Amounts Owed report (spec reports/01 §Screens · Report screen shell). Client
 * component with URL-persisted filter state — sharing the address bar re-runs
 * the same report. Capability decisions here are UI convenience only: the API
 * decides. When the caller holds only the "My" side of a report, the All/My
 * toggle is not drawn and every fetch goes to `/my`; when they only hold "All",
 * the toggle is also hidden. A `404` on the JSON endpoint sends the caller
 * back to `/reports` with the "no permission" toast — the same shape spec
 * Alt Flow B calls out for the /pdf/my crafted URL.
 */
export default function AmountsOwedPage({
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
  const canViewAll = hasCapability(role, 'ViewAmountsOwed');
  const canViewMy = hasCapability(role, 'ViewMyAmountsOwed');
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

  const [owner, setOwner] = useState<OwnerScope>(initialOwner);
  const [startDate, setStartDate] = useState<string>(initialStart);
  const [endDate, setEndDate] = useState<string>(initialEnd);
  const [memberIds, setMemberIds] = useState<string[]>(initialMemberIds);
  const [projectIds, setProjectIds] = useState<string[]>(initialProjectIds);
  const [clientIds, setClientIds] = useState<string[]>(initialClientIds);
  const [sumDateRanges, setSumDateRanges] = useState<boolean>(initialSum);
  const [detailedReports, setDetailedReports] = useState<boolean>(initialDetailed);

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
    // memberIds are preserved even when owner === 'my' so switching back to
    // All restores the selection. The API-facing query dropped them on My
    // (see `buildQuery` below); the URL keeps them for round-trippability.
    for (const id of memberIds) next.append('memberIds', id);
    for (const id of projectIds) next.append('projectIds', id);
    for (const id of clientIds) next.append('clientIds', id);
    if (sumDateRanges) next.set('sumDateRanges', 'true');
    if (detailedReports) next.set('detailedReports', 'true');
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
  const [data, setData] = useState<AmountsOwedResponse | null>(null);
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
    return q;
  }, [startDate, endDate, owner, memberIds, projectIds, clientIds, sumDateRanges, detailedReports]);

  const load = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      setLoading(true);
      setServerError(false);
      setRangeError(null);
      setGenericFilterError(null);
      const requestId = ++lastRequestRef.current;
      const path = owner === 'my' ? 'amounts-owed/my' : 'amounts-owed';
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
            // `validation_error` and any other 422 carry a field map; surface
            // the first field message so the caller sees WHAT is wrong, not a
            // fabricated one-size-fits-all fallback.
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
        const body = (await res.json()) as AmountsOwedResponse;
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
    const path = owner === 'my' ? 'amounts-owed/pdf/my' : 'amounts-owed/pdf';
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
      // Read the server's filename from Content-Disposition; fall back to a
      // deterministic default so the download always has a legible name.
      const disp = res.headers.get('Content-Disposition') ?? '';
      const match = /filename="?([^";]+)"?/i.exec(disp);
      const filename =
        match?.[1] ?? `AmountsOwed_${startDate}_to_${endDate}.pdf`;
      // Force the Blob's MIME to application/pdf even when the server sent a
      // charset (some browsers otherwise render inline instead of downloading).
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

  const columns = useMemo<ReportTableColumn<AmountsOwedRow>[]>(
    () =>
      (data?.headers ?? []).map((header) => ({
        key: header.value,
        label: header.title,
        align: NUMERIC_COLUMNS.has(header.value) ? 'end' : 'start',
        width: COLUMN_WIDTHS[header.value],
        render: (row) => renderCell(header.value, row, currency),
        renderTotal: (total) => renderTotal(header.value, total, currency),
      })),
    [data?.headers, currency],
  );

  const grandTotal = useMemo(() => {
    if (!data) return null;
    let hours = 0;
    let amount = 0;
    for (const group of data.groups) {
      hours += Number(group.total?.hours ?? 0) || 0;
      amount += Number(group.total?.amount ?? 0) || 0;
    }
    return { hours, amount };
  }, [data]);

  if (!authorized) return null;

  const showToggle = canViewAll && canViewMy;
  const title = owner === 'my' ? 'My Amounts Owed' : 'Amounts Owed';
  const rangeLabel = formatRangeLabel(startDate, endDate);

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
          <ReportTable<AmountsOwedRow>
            ariaLabel="Amounts owed"
            columns={columns}
            groups={data.groups}
            rowStyle={(row) => ROW_TINT[row.kind ?? 'project']}
            grandTotal={grandTotal}
            grandTotalLabel="Total payable"
          />
        </>
      ) : null}
    </div>
  );
}

/**
 * A cell's content. The alignment, the gutters and the tabular figures are the column's
 * (§83); what is left here is the format each key is read in.
 */
function renderCell(key: string, row: AmountsOwedRow, currency: string): React.ReactNode {
  const raw = row[key as keyof AmountsOwedRow];
  if (key === 'hours') return formatHours(raw as string);
  if (key === 'rate') return formatMoney(raw as string, currency);
  if (key === 'amount') {
    return (
      <span style={{ fontWeight: 'var(--font-weight-semibold)' }}>
        {formatMoney(raw as string, currency)}
      </span>
    );
  }
  if (key === 'member') {
    return <span style={{ fontWeight: 'var(--font-weight-medium)' }}>{String(raw ?? '')}</span>;
  }
  return String(raw ?? '');
}

function renderTotal(key: string, total: Record<string, any>, currency: string): React.ReactNode {
  const raw = total?.[key];
  if (raw === undefined || raw === null || raw === '') return null;
  if (key === 'hours') return formatHours(raw as string);
  if (key === 'amount') return formatMoney(raw as string, currency);
  return String(raw);
}
