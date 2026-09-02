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
  AmountsOwedResponse,
  AmountsOwedRow,
  FilterOption,
  OwnerScope,
  ReportGroup,
} from '@/reports/types';

const DEFAULT_RANGE_DAYS = 30;

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

  if (!authorized) return null;

  const showToggle = canViewAll && canViewMy;
  const title = owner === 'my' ? 'My Amounts Owed' : 'Amounts Owed';
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
        {/* Force the aggregation chips onto their own right-aligned row so
            every report screen's filter bar reads the same way regardless
            of how many primary filters that report has. */}
        <div
          style={{
            flexBasis: '100%',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
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
 * Summary strip
 * ────────────────────────────────────────────────────────────────────────── */

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

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
 * Report table (grouped)
 * ────────────────────────────────────────────────────────────────────────── */

function formatMoney(raw: string | number | null | undefined, currency: string): string {
  if (raw === null || raw === undefined || raw === '') return '';
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(num)) return String(raw);
  // Format with `$` for USD; for anything else use the ISO code prefix. All
  // v1 amounts are USD (spec §Currency), so this is the code path in practice.
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

const ROW_STYLES: Record<string, React.CSSProperties> = {
  holiday: { background: 'var(--accent-soft)' },
  vacation: { background: 'var(--bg-sunken)' },
  project: {},
};

function ReportTable({
  headers,
  groups,
  currency,
}: {
  headers: { title: string; value: string }[];
  groups: ReportGroup<AmountsOwedRow>[];
  currency: string;
}) {
  const grandTotal = useMemo(() => {
    let hours = 0;
    let amount = 0;
    for (const g of groups) {
      hours += Number(g.total?.hours ?? 0) || 0;
      amount += Number(g.total?.amount ?? 0) || 0;
    }
    return { hours, amount };
  }, [groups]);

  return (
    <div
      data-testid="reports-table"
      role="table"
      aria-label="Amounts owed"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--sp-6)',
      }}
    >
      {groups.map((group) => (
        <div
          key={group.id}
          role="rowgroup"
          data-testid={`reports-group-${group.id}`}
          style={{
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-2xl)',
            // Horizontal scroll on narrow viewports so the fixed-width numeric
            // columns (Hours/Rate/Amount) stay legible instead of overlapping
            // the text columns; spec §Responsive Behavior calls for a full
            // per-group card layout on mobile — deferred, this is the
            // pragmatic minimum that keeps the report usable at 375px.
            overflowX: 'auto',
          }}
        >
          <div role="row">
            <div
              role="rowheader"
              data-testid={`reports-group-${group.id}-band`}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '12px 20px',
                background: 'var(--bg-header)',
                fontFamily: 'var(--font-display)',
                fontWeight: 600,
                fontSize: 'var(--fs-13)',
                color: 'var(--text-sub)',
              }}
            >
              <span>{group.title}</span>
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
                minWidth: 640,
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
                minWidth: 640,
                borderTop: '1px solid var(--divider)',
                alignItems: 'center',
                fontSize: 'var(--fs-14)',
                gap: 8,
                ...(ROW_STYLES[row.kind ?? 'project'] ?? {}),
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

          {/* Per-group total row — hidden when there is only ONE group so it
              doesn't duplicate the grand-total footer below. */}
          {groups.length > 1 && (
            <div
              role="row"
              data-testid={`reports-group-${group.id}-total`}
              style={{
                display: 'flex',
                padding: '10px 20px',
                minWidth: 640,
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
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-2xl)',
          overflowX: 'auto',
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: 'var(--fs-14)',
          color: 'var(--text)',
          gap: 8,
          alignItems: 'center',
          minWidth: 0,
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 640, flex: 1 }}>
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
                Total payable
              </span>
            ) : h.value === 'hours' ? (
              <span style={{ fontFamily: 'var(--font-mono)' }}>
                {formatHours(grandTotal.hours)}
              </span>
            ) : h.value === 'amount' ? (
              <span style={{ fontFamily: 'var(--font-mono)' }}>
                {formatMoney(grandTotal.amount, currency)}
              </span>
            ) : null}
          </div>
        ))}
        </div>
      </div>
    </div>
  );
}

function headerCellStyle(value: string): React.CSSProperties {
  const numeric = value === 'hours' || value === 'rate' || value === 'amount';
  const widths: Record<string, number> = { hours: 110, rate: 110, amount: 130 };
  const width = widths[value];
  return {
    ...(width ? { width, flex: 'none' } : { flex: value === 'member' ? 1.5 : 1.5 }),
    padding: '0 6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: numeric ? 'flex-end' : 'flex-start',
    minWidth: 0,
  };
}

function bodyCellStyle(value: string): React.CSSProperties {
  return headerCellStyle(value);
}

function renderCell(
  key: string,
  row: AmountsOwedRow,
  currency: string,
): React.ReactNode {
  const raw = row[key as keyof AmountsOwedRow];
  if (key === 'hours') {
    return <span style={{ fontFamily: 'var(--font-mono)' }}>{formatHours(raw as string)}</span>;
  }
  if (key === 'rate') {
    return (
      <span style={{ fontFamily: 'var(--font-mono)' }}>
        {formatMoney(raw as string, currency)}
      </span>
    );
  }
  if (key === 'amount') {
    return (
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontWeight: 600,
          color: 'var(--text)',
        }}
      >
        {formatMoney(raw as string, currency)}
      </span>
    );
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
  total: ReportGroup<AmountsOwedRow>['total'],
  currency: string,
): React.ReactNode {
  const raw = total?.[key];
  if (raw === undefined || raw === null || raw === '') {
    return null;
  }
  if (key === 'hours') {
    return <span style={{ fontFamily: 'var(--font-mono)' }}>{formatHours(raw as string)}</span>;
  }
  if (key === 'amount') {
    return (
      <span style={{ fontFamily: 'var(--font-mono)' }}>
        {formatMoney(raw as string, currency)}
      </span>
    );
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
