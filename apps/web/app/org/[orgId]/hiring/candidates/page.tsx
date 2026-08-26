'use client';

import { notFound, useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useMemo, useState } from 'react';
import {
  CANDIDATE_MESSAGES,
  candidateResultLabel,
  criterionFilterParam,
  pageCount as pagesFor,
} from '@devscribed/validation';
import {
  Badge,
  Button,
  Card,
  Combobox,
  InfoBanner,
  Pagination,
  SearchField,
  SectionLabel,
  Skeleton,
  Spinner,
  Table,
} from '@/ds';
import { PageHeader } from '@/layout/PageHeader';
import { StatusBadge } from '@/hiring/StatusBadge';
import { formatListWhen } from '@/hiring/format';
import { useMediaQuery } from '@/hiring/useMediaQuery';
import type { CandidateDatabase, CandidateRow, Category, Criterion, Vacancy } from '@/hiring/types';
import {
  CriteriaFilterRow,
  EMPTY_ROW,
  completeRows,
  type CriteriaFilterRowState,
} from './CriteriaFilterRow';

/** 03 §02.6 — the same 300 ms the member and vacancy searches already use. */
const SEARCH_DEBOUNCE_MS = 300;

/** Below this the email folds under the name (03 design §Responsive). */
const NARROW = '(max-width: 1023px)';

type Phase = 'loading' | 'ready' | 'failed' | 'gone';

/** The three lists the filter controls are built from, fetched once. */
interface FilterLibrary {
  vacancies: Vacancy[];
  categories: Category[];
  criteria: Criterion[];
}

/**
 * The candidate database (spec 03) — one row per **person**, and the filter bar the two
 * libraries exist to feed.
 *
 * Its headline query is the one the whole category and criteria machinery was built for:
 * *everyone who applied to a React position whose English is at least B1*. Which is why
 * the count, not the table, is this screen's primary feedback — "how many match?" is the
 * question being asked, and it is the one thing announced.
 *
 * So a refilter never replaces the list with a spinner. The rows stay, dimmed and
 * `aria-busy`, and only the number becomes a spinner: a table that collapsed and
 * re-expanded on every keystroke would reflow the page under the reader for no
 * information at all.
 */
export default function CandidatesPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>('loading');
  /** Kept across a refetch, which is what lets the list dim rather than disappear. */
  const [data, setData] = useState<CandidateDatabase | null>(null);
  const [busy, setBusy] = useState(false);
  const [library, setLibrary] = useState<FilterLibrary | null>(null);

  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [vacancyIds, setVacancyIds] = useState<string[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [rows, setRows] = useState<CriteriaFilterRowState[]>([]);
  const [page, setPage] = useState(1);
  const narrow = useMediaQuery(NARROW);

  // Typing debounces; every other filter is a discrete choice and refetches at once —
  // waiting 300 ms on a click reads as lag rather than as care (03 design §Interactions).
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  /**
   * Every change to what is being asked returns to the first page: page 3 of a narrower
   * result is a page that may no longer exist (03 design §Interactions).
   *
   * Paired with each setter rather than written as an effect on the filters, because an
   * effect would fire a request for the old page before the reset landed — one wasted
   * round trip whose answer is discarded, per filter change.
   */
  function applyFilter(change: () => void): void {
    change();
    setPage(1);
  }

  /** Only complete rows travel; a half-built one is not yet a filter. */
  const criteria = useMemo(
    () => completeRows(rows).map((row) => criterionFilterParam(row)),
    [rows],
  );
  // Keyed by content rather than by identity: the array is rebuilt whenever a row is
  // touched, and choosing a criterion — a row that is not yet a filter — must not fire a
  // request that asks exactly what the last one did.
  const criteriaKey = JSON.stringify(criteria);

  const filterCount = vacancyIds.length + categoryIds.length + criteria.length;
  const filtered = filterCount > 0 || query.trim().length > 0;

  const load = useCallback(async (): Promise<void> => {
    const params = new URLSearchParams();
    if (query.trim()) params.set('search', query.trim());
    for (const id of vacancyIds) params.append('vacancyId', id);
    for (const id of categoryIds) params.append('categoryId', id);
    for (const filter of criteria) params.append('criterion', filter);
    if (page > 1) params.set('page', String(page));

    setBusy(true);
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/hiring/candidates?${params}`,
        { credentials: 'same-origin' },
      );

      // `user` and `viewer` never saw the sidebar row, so a direct navigation is the only
      // way to arrive here — and the API answers the same 404 the screen renders.
      if (response.status === 404 || response.status === 403) {
        setPhase('gone');
        return;
      }
      if (!response.ok) {
        setPhase('failed');
        return;
      }

      setData(await response.json());
      setPhase('ready');
    } catch {
      setPhase('failed');
    } finally {
      setBusy(false);
    }
    // `criteriaKey` stands in for `criteria` — see above; the array itself is what
    // travels, and its content is what decides when to refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, query, vacancyIds, categoryIds, criteriaKey, page]);

  useEffect(() => {
    void load();
  }, [load]);

  // The filter controls' own options. Fetched once: the libraries do not change while
  // somebody is filtering, and refetching them on every keystroke would be three
  // requests for a list nobody edited.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const responses = await Promise.all([
        fetch(`/api/organizations/${orgId}/hiring/vacancies`, { credentials: 'same-origin' }),
        fetch(`/api/organizations/${orgId}/hiring/categories`, { credentials: 'same-origin' }),
        // Archived criteria included: history stays filterable, which is the whole
        // difference between archiving a criterion and deleting one (03 §04.19).
        fetch(`/api/organizations/${orgId}/hiring/criteria?includeArchived=true`, {
          credentials: 'same-origin',
        }),
      ]);
      if (cancelled || responses.some((response) => !response.ok)) return;

      const [vacancies, categories, criteriaList] = await Promise.all(
        responses.map((response) => response.json()),
      );
      setLibrary({
        vacancies: vacancies.vacancies,
        categories: categories.categories,
        criteria: criteriaList.criteria,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [orgId]);

  if (phase === 'gone') notFound();

  function clearAll(): void {
    setSearch('');
    applyFilter(() => {
      setQuery('');
      setVacancyIds([]);
      setCategoryIds([]);
      setRows([]);
    });
  }

  const zone = data?.viewerTimeZone ?? 'UTC';
  const pageTotal = data ? pagesFor(data.matched, data.pageSize) : 1;

  return (
    <>
      <PageHeader
        title="Candidates"
        subtitle={<span data-testid="candidates-timezone">Times in {zone}</span>}
      />

      <SearchField
        placeholder={CANDIDATE_MESSAGES.searchPlaceholder}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        aria-label="Search name or email"
        data-testid="candidates-search-input"
        style={{ width: '100%', marginBottom: 'var(--sp-6)' }}
      />

      {/*
        A control surface rather than data, which is why it sits on `--bg-panel-2` and
        why it is a labelled landmark: three kinds of filter is a lot to walk through
        with a screen reader on the way to the table, and this is what lets it be skipped
        whole (03 design §Accessibility).
      */}
      <section aria-label="Filters" style={{ marginBottom: 'var(--sp-8)' }}>
        {/* `clip={false}` because every control in here opens a list into the card. */}
        <Card clip={false} style={{ background: 'var(--bg-panel-2)' }}>
          <div className="candidates-filter-row">
            <SectionLabel className="candidates-filter-label">Position</SectionLabel>
            <Combobox
              value={vacancyIds}
              options={(library?.vacancies ?? []).map((vacancy) => ({
                value: vacancy.id,
                label: vacancy.title,
              }))}
              onChange={(value) => applyFilter(() => setVacancyIds(value))}
              placeholder="Any position"
              aria-label="Filter by position"
              data-testid="candidates-filter-position"
              chipTestId={(value) => `candidates-filter-chip-${value}`}
              optionTestId={(value) => `candidates-filter-position-option-${value}`}
              wrapperStyle={{ flex: 1, minWidth: 0 }}
            />
          </div>

          <div className="candidates-filter-row">
            <SectionLabel className="candidates-filter-label">Category</SectionLabel>
            <Combobox
              value={categoryIds}
              options={(library?.categories ?? []).map((category) => ({
                value: category.id,
                label: category.name,
              }))}
              onChange={(value) => applyFilter(() => setCategoryIds(value))}
              placeholder="Any category"
              aria-label="Filter by category"
              data-testid="candidates-filter-category"
              chipTestId={(value) => `candidates-filter-chip-${value}`}
              optionTestId={(value) => `candidates-filter-category-option-${value}`}
              wrapperStyle={{ flex: 1, minWidth: 0 }}
            />
          </div>

          <div className="candidates-filter-row">
            <SectionLabel className="candidates-filter-label">Criteria</SectionLabel>
            <div className="candidates-criteria-rows">
              {rows.map((row, index) => (
                <CriteriaFilterRow
                  key={index}
                  index={index}
                  row={row}
                  criteria={library?.criteria ?? []}
                  onChange={(next) =>
                    setRows(rows.map((existing, at) => (at === index ? next : existing)))
                  }
                  onRemove={() => setRows(rows.filter((_, at) => at !== index))}
                />
              ))}
              <div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRows([...rows, EMPTY_ROW])}
                  data-testid="candidates-criteria-filter-add"
                >
                  {CANDIDATE_MESSAGES.addCriteriaFilter}
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </section>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--sp-6)',
          marginBottom: 'var(--sp-5)',
          // Reserved, so the count turning into a spinner never moves the table.
          minHeight: 34,
        }}
      >
        {/*
          The count is the feedback for every filter change, and the only thing on this
          screen that announces itself. During a refetch it holds a spinner rather than a
          stale number — a number that was true one request ago is worse than no number.
        */}
        <p
          aria-live="polite"
          data-testid="candidates-count"
          style={{ margin: 0, fontSize: 'var(--fs-14)', color: 'var(--text-sub)' }}
        >
          {busy || !data ? (
            <Spinner size={15} />
          ) : (
            candidateResultLabel(data.matched, data.total, filtered)
          )}
        </p>

        {filterCount > 1 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAll}
            data-testid="candidates-clear-filters"
          >
            {CANDIDATE_MESSAGES.clearFilters}
          </Button>
        )}
      </div>

      {phase === 'failed' ? (
        <InfoBanner tone="error" data-testid="candidates-error">
          {CANDIDATE_MESSAGES.loadFailed}{' '}
          <Button variant="ghost" size="sm" onClick={() => void load()} data-testid="candidates-retry">
            Try again
          </Button>
        </InfoBanner>
      ) : !data ? (
        <Card>
          <Skeleton rows={5} height={22} data-testid="candidates-loading-skeleton" />
        </Card>
      ) : data.total === 0 ? (
        <Card>
          <p
            data-testid="candidates-empty-state"
            style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-14)' }}
          >
            {CANDIDATE_MESSAGES.empty}
          </p>
        </Card>
      ) : data.candidates.length === 0 ? (
        <Card>
          <p
            data-testid="candidates-no-results"
            style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-14)' }}
          >
            {CANDIDATE_MESSAGES.noResults}
          </p>
          <div style={{ marginTop: 'var(--sp-4)' }}>
            <Button variant="secondary" size="sm" onClick={clearAll} data-testid="candidates-clear-all">
              {CANDIDATE_MESSAGES.clearFilters}
            </Button>
          </div>
        </Card>
      ) : (
        <div data-testid="candidates-list">
          <Table<CandidateRow>
            rows={data.candidates}
            busy={busy}
            rowHref={(row) => `/org/${orgId}/hiring/candidates/${row.id}`}
            rowTestId={(row) => `candidate-row-${row.id}`}
            onRowClick={(row, event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey) return;
              event.preventDefault();
              router.push(`/org/${orgId}/hiring/candidates/${row.id}`);
            }}
            columns={[
              {
                label: 'Name',
                flex: 2,
                render: (row) => (
                  <div style={{ minWidth: 0 }}>
                    <span data-testid={`candidate-name-${row.id}`}>{row.fullName}</span>
                    {/*
                      Four columns do not fit a tablet, and the email is the one that can
                      be read on a second line without losing its meaning — a date or a
                      status cannot. Rendered here **or** in its own column, never both,
                      so the row still holds exactly one of each testid.
                    */}
                    {narrow && (
                      <div
                        data-testid={`candidate-email-${row.id}`}
                        style={{ fontSize: 'var(--fs-13)', color: 'var(--text-sub)' }}
                      >
                        {row.email}
                      </div>
                    )}
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: 'var(--sp-2)',
                        marginTop: 'var(--sp-2)',
                      }}
                    >
                      {row.categories.map((category) => (
                        <Badge key={category.id} tone="neutral" dot={false}>
                          {category.name}
                        </Badge>
                      ))}
                      {/* Only when there is more than one — "1 application" is noise. */}
                      {row.applicationCount > 1 && (
                        <span
                          data-testid={`candidate-app-count-${row.id}`}
                          style={{ fontSize: 'var(--fs-12)', color: 'var(--text-muted)' }}
                        >
                          {row.applicationCount} applications
                        </span>
                      )}
                    </div>
                  </div>
                ),
              },
              ...(narrow
                ? []
                : [
                    {
                      label: 'Email',
                      flex: 2,
                      render: (row: CandidateRow) => (
                        <span data-testid={`candidate-email-${row.id}`}>{row.email}</span>
                      ),
                    },
                  ]),
              {
                label: 'Latest application',
                flex: 2,
                render: (row) => (
                  <div data-testid={`candidate-latest-${row.id}`} style={{ minWidth: 0 }}>
                    <div>{row.latestApplication?.vacancyTitle}</div>
                    <div style={{ fontSize: 'var(--fs-12)', color: 'var(--text-muted)' }}>
                      {row.latestApplication
                        ? formatListWhen(row.latestApplication.startUtc, zone)
                        : null}
                    </div>
                  </div>
                ),
              },
              {
                label: 'Status',
                flex: 1,
                align: 'flex-end',
                render: (row) =>
                  row.latestApplication ? (
                    <StatusBadge
                      status={row.latestApplication.status}
                      data-testid={`candidate-status-${row.id}`}
                    />
                  ) : null,
              },
            ]}
          />

          {pageTotal > 1 && (
            <div style={{ marginTop: 'var(--sp-6)' }}>
              <Pagination
                page={data.page}
                pageCount={pageTotal}
                onChange={setPage}
                data-testid="candidates-pagination"
                pageTestId={(n) => `candidates-page-${n}`}
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}
