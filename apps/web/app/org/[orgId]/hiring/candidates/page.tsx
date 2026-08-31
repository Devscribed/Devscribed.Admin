'use client';

import { notFound, useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CANDIDATE_MESSAGES,
  candidateResultLabel,
  criterionFilterParam,
} from '@devscribed/validation';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  FieldLabel,
  InfoBanner,
  Preloader,
  SearchInput,
  Select,
  Table,
  type SelectOption,
} from '@/ds';
import { PageHeader } from '@/layout/PageHeader';
import { StatusBadge } from '@/hiring/StatusBadge';
import { formatListWhen } from '@/hiring/format';
import { valuesOf } from '@/hiring/select';
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

/** How far ahead of the load-more row the next page starts arriving. */
const PREFETCH_MARGIN = '200px';

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
 * So a refilter never replaces the list with a loader. The rows stay, dimmed and
 * `aria-busy` (`Table busy`, ledger §34), and only the number becomes a `Preloader`: a
 * table that collapsed and re-expanded on every keystroke would reflow the page under the
 * reader for no information at all.
 *
 * **The page controls are gone** (reversal 1). Pagination was Meridian's answer and blue's
 * list screens scroll, so the list grows as it is scrolled. The reason the database was
 * paginated in the first place — infinite scroll cannot say how many match — is answered by
 * the count line, which never moved: it is its own `aria-live` node above the table and it
 * still reads `12 of 128 candidates`. What pagination actually carried was *position*, and
 * the in-table load-more row carries that instead.
 */
export default function CandidatesPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>('loading');
  /** The latest response's head — the counts and the zone, never the rows. */
  const [data, setData] = useState<CandidateDatabase | null>(null);
  /** Every page fetched for the current question, in order. */
  const [rows, setRows] = useState<CandidateRow[]>([]);
  /**
   * A page that answered with nothing ends the scroll.
   *
   * `matched` is counted by one query and the rows by the next, so a candidate booked between
   * the two leaves the list permanently one short of the count it is compared against — and
   * the load-more row would then ask for page after page of nothing, forever.
   */
  const [exhausted, setExhausted] = useState(false);
  const [pending, setPending] = useState(false);
  const [library, setLibrary] = useState<FilterLibrary | null>(null);

  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [vacancyIds, setVacancyIds] = useState<string[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [criteriaRows, setCriteriaRows] = useState<CriteriaFilterRowState[]>([]);
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
   * Every change to what is being asked returns to the first page, which is also what
   * empties the accumulated list: a filter change is a new question, and rows fetched
   * against the old one are not part of its answer.
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
    () => completeRows(criteriaRows).map((row) => criterionFilterParam(row)),
    [criteriaRows],
  );
  // Keyed by content rather than by identity: the array is rebuilt whenever a row is
  // touched, and choosing a criterion — a row that is not yet a filter — must not fire a
  // request that asks exactly what the last one did.
  const criteriaKey = JSON.stringify(criteria);

  const filterCount = vacancyIds.length + categoryIds.length + criteria.length;
  const filtered = filterCount > 0 || query.trim().length > 0;

  /**
   * Which request is the current one. A page-2 fetch that lands after a filter change
   * would otherwise append rows from the question before last onto the answer to this one.
   */
  const currentRequest = useRef(0);

  const load = useCallback(async (): Promise<void> => {
    const params = new URLSearchParams();
    if (query.trim()) params.set('search', query.trim());
    for (const id of vacancyIds) params.append('vacancyId', id);
    for (const id of categoryIds) params.append('categoryId', id);
    for (const filter of criteria) params.append('criterion', filter);
    if (page > 1) params.set('page', String(page));

    const request = ++currentRequest.current;
    setPending(true);
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/hiring/candidates?${params}`,
        { credentials: 'same-origin' },
      );
      if (currentRequest.current !== request) return;

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

      const body: CandidateDatabase = await response.json();
      if (currentRequest.current !== request) return;

      setData(body);
      // Page 1 answers a new question and replaces the list; anything later extends it.
      setRows((current) => (page === 1 ? body.candidates : [...current, ...body.candidates]));
      setExhausted(page > 1 && body.candidates.length === 0);
      setPhase('ready');
    } catch {
      if (currentRequest.current === request) setPhase('failed');
    } finally {
      if (currentRequest.current === request) setPending(false);
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

  const hasMore = data ? !exhausted && rows.length < data.matched : false;
  /** The refilter dims the rows; loading page 2 must not — nothing on screen changed. */
  const refiltering = pending && page === 1 && rows.length > 0;

  /**
   * The next page starts arriving before the load-more row is reached, so the list grows
   * under the scroll rather than after it.
   */
  const loadMore = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = loadMore.current;
    if (!node || !hasMore || pending) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setPage((current) => current + 1);
      },
      { rootMargin: PREFETCH_MARGIN },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, pending]);

  if (phase === 'gone') notFound();

  function clearAll(): void {
    setSearch('');
    applyFilter(() => {
      setQuery('');
      setVacancyIds([]);
      setCategoryIds([]);
      setCriteriaRows([]);
    });
  }

  const zone = data?.viewerTimeZone ?? 'UTC';

  const options = (entries: Array<{ id: string; label: string }>, testId: string): SelectOption[] =>
    entries.map((entry) => ({
      value: entry.id,
      label: entry.label,
      testId: `${testId}-option-${entry.id}`,
    }));

  const positionOptions = options(
    (library?.vacancies ?? []).map((vacancy) => ({ id: vacancy.id, label: vacancy.title })),
    'candidates-filter-position',
  );
  const categoryOptions = options(
    (library?.categories ?? []).map((category) => ({ id: category.id, label: category.name })),
    'candidates-filter-category',
  );
  const chosen = (all: SelectOption[], ids: string[]): SelectOption[] =>
    all.filter((option) => ids.includes(option.value));

  return (
    <>
      <PageHeader
        title="Candidates"
        subtitle={<span data-testid="candidates-timezone">Times in {zone}</span>}
      />

      <SearchInput
        outlined
        placeholder={CANDIDATE_MESSAGES.searchPlaceholder}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        onClear={() => setSearch('')}
        aria-label="Search name or email"
        data-testid="candidates-search-input"
        wrapperStyle={{ width: '100%', marginBottom: 'var(--space-5)' }}
      />

      {/*
        A control surface rather than data, which is why it sits on `--surface-sunken` — the
        tone blue already puts behind a `Table`'s own header row — and why it is a labelled
        landmark: three kinds of filter is a lot to walk through with a screen reader on the
        way to the table, and this is what lets it be skipped whole (03 design §Accessibility).
      */}
      <section aria-label="Filters" style={{ marginBottom: 'var(--space-6)' }}>
        {/*
          `clip={false}` because every control in here opens a list into the card, and a
          `Card` clips to its radius by default. This is the surface reversal 6 was written
          for and the first one to exercise it — Phase 3's two popovers opened from a `Modal`
          and from `PageHeader`, neither of which is a `Card`.
        */}
        <Card clip={false} style={{ background: 'var(--surface-sunken)' }}>
          <div className="candidates-filter-row">
            <div className="candidates-filter-label">
              <FieldLabel htmlFor="candidates-filter-position">Position</FieldLabel>
            </div>
            <Select
              isMulti
              isSearchable
              id="candidates-filter-position"
              value={chosen(positionOptions, vacancyIds)}
              options={positionOptions}
              onChange={(option) => applyFilter(() => setVacancyIds(valuesOf(option)))}
              placeholder="Any position"
              data-testid="candidates-filter-position"
              chipTestId={(option) =>
                `candidates-filter-chip-${typeof option === 'string' ? option : option.value}`
              }
              wrapperStyle={{ flex: 1, minWidth: 0 }}
            />
          </div>

          <div className="candidates-filter-row">
            <div className="candidates-filter-label">
              <FieldLabel htmlFor="candidates-filter-category">Category</FieldLabel>
            </div>
            <Select
              isMulti
              isSearchable
              id="candidates-filter-category"
              value={chosen(categoryOptions, categoryIds)}
              options={categoryOptions}
              onChange={(option) => applyFilter(() => setCategoryIds(valuesOf(option)))}
              placeholder="Any category"
              data-testid="candidates-filter-category"
              chipTestId={(option) =>
                `candidates-filter-chip-${typeof option === 'string' ? option : option.value}`
              }
              wrapperStyle={{ flex: 1, minWidth: 0 }}
            />
          </div>

          <div className="candidates-filter-row">
            {/* No `htmlFor`: this one names a stack of rows rather than a single
                control, and each row labels its own three (03 design §Accessibility). */}
            <div className="candidates-filter-label">
              <FieldLabel>Criteria</FieldLabel>
            </div>
            <div className="candidates-criteria-rows">
              {criteriaRows.map((row, index) => (
                <CriteriaFilterRow
                  key={index}
                  index={index}
                  row={row}
                  criteria={library?.criteria ?? []}
                  onChange={(next) =>
                    setCriteriaRows(
                      criteriaRows.map((existing, at) => (at === index ? next : existing)),
                    )
                  }
                  onRemove={() =>
                    setCriteriaRows(criteriaRows.filter((_, at) => at !== index))
                  }
                />
              ))}
              <div>
                <Button
                  onClick={() => setCriteriaRows([...criteriaRows, EMPTY_ROW])}
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
          gap: 'var(--space-5)',
          marginBottom: 'var(--space-4)',
          // Reserved, so the count turning into a loader never moves the table.
          minHeight: 44,
        }}
      >
        {/*
          The count is the feedback for every filter change, and the only thing on this
          screen that announces itself. It is also the whole answer to what pagination used
          to be here for. During a refetch it holds a loader rather than a stale number — a
          number that was true one request ago is worse than no number.
        */}
        <p
          aria-live="polite"
          data-testid="candidates-count"
          style={{
            margin: 0,
            fontSize: 'var(--font-size-s)',
            color: 'var(--text-tertiary)',
          }}
        >
          {pending && page === 1 ? (
            // Named, but not a live region of its own: the `<p>` around it already is one,
            // and a nested pair announces the same change twice.
            <Preloader size={8} margin={5} aria-label="Counting candidates" />
          ) : data ? (
            candidateResultLabel(data.matched, data.total, filtered)
          ) : null}
        </p>

        {filterCount > 1 && (
          <Button onClick={clearAll} data-testid="candidates-clear-filters">
            {CANDIDATE_MESSAGES.clearFilters}
          </Button>
        )}
      </div>

      {phase === 'failed' ? (
        <InfoBanner variant="error" data-testid="candidates-error">
          {CANDIDATE_MESSAGES.loadFailed}{' '}
          <Button onClick={() => void load()} data-testid="candidates-retry">
            Try again
          </Button>
        </InfoBanner>
      ) : (
        /*
          One surface at every state, which is what blue's table screens do: the card gives
          the edge-to-edge table its border and rounds its first and last rows, and the
          loader, both empty messages and the load-more row sit inside it rather than
          replacing it.
        */
        <Card padded={false} data-testid="candidates-list">
          {rows.length > 0 && (
            <Table<CandidateRow>
              rows={rows}
              busy={refiltering}
              rowKey="id"
              rowHref={(row) => `/org/${orgId}/hiring/candidates/${row.id}`}
              rowTestId={(row) => `candidate-row-${row.id}`}
              onRowClick={(row, event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey) return;
                event.preventDefault();
                router.push(`/org/${orgId}/hiring/candidates/${row.id}`);
              }}
              footer={
                hasMore ? (
                  /* Inside the table, in the row position the next page will occupy —
                     prod's own `.loadNextTableIndicator`, at the 8/5 it measures rather
                     than the 12/7 the overlay loader uses. */
                  <div
                    ref={loadMore}
                    data-testid="candidates-load-more"
                    style={{ display: 'flex', alignItems: 'center' }}
                  >
                    <Preloader size={8} margin={5} aria-hidden />
                    <span aria-live="polite" style={SR_ONLY}>
                      Loading more candidates
                    </span>
                  </div>
                ) : undefined
              }
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
                          style={{
                            fontSize: 'var(--font-size-xs)',
                            color: 'var(--text-tertiary)',
                          }}
                        >
                          {row.email}
                        </div>
                      )}
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          gap: 'var(--space-1)',
                          marginTop: 'var(--space-1)',
                        }}
                      >
                        {/* The same read-only chip the vacancies list draws (§20) — a
                            category is a tag, and `Badge` is blue's two-hue status pill. */}
                        {row.categories.map((category) => (
                          <Chip key={category.id} label={category.name} />
                        ))}
                        {/* Only when there is more than one — "1 application" is noise. */}
                        {row.applicationCount > 1 && (
                          <span
                            data-testid={`candidate-app-count-${row.id}`}
                            style={{
                              fontSize: 'var(--font-size-xs)',
                              color: 'var(--text-secondary)',
                            }}
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
                      <div
                        style={{
                          fontSize: 'var(--font-size-xs)',
                          color: 'var(--text-secondary)',
                        }}
                      >
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
                  // Blue caps the last column at 80px for prod's icon-only actions cell
                  // (§18); "Didn't pass" is wider than that.
                  maxWidth: 140,
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
          )}

          {phase === 'loading' && rows.length === 0 && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-7)' }}>
              {/* The dots carry no text, so the announcement is made beside them. */}
              <Preloader data-testid="candidates-loading" aria-hidden />
              <span aria-live="polite" style={SR_ONLY}>
                Loading candidates
              </span>
            </div>
          )}

          {phase === 'ready' && rows.length === 0 && data?.total === 0 && (
            <EmptyState data-testid="candidates-empty-state">
              {CANDIDATE_MESSAGES.empty}
            </EmptyState>
          )}

          {phase === 'ready' && rows.length === 0 && (data?.total ?? 0) > 0 && (
            <>
              <EmptyState data-testid="candidates-no-results">
                {CANDIDATE_MESSAGES.noResults}
              </EmptyState>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  padding: 'var(--space-6)',
                }}
              >
                <Button onClick={clearAll} data-testid="candidates-clear-all">
                  {CANDIDATE_MESSAGES.clearFilters}
                </Button>
              </div>
            </>
          )}
        </Card>
      )}
    </>
  );
}

/** The loader's dots say nothing; this is what says it beside them. */
const SR_ONLY = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const;
