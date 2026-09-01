'use client';

import { notFound, useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  APPLICATION_STATUSES,
  APPLICATION_STATUS_LABELS,
  CANDIDATE_MESSAGES,
  INTERVIEW_MESSAGES,
  candidateFiltersLabel,
  candidateResultLabel,
  candidateScopeTabLabel,
  criterionFilterParam,
  interviewerPickerLabel,
  type ApplicationStatus,
  type CandidateScope,
} from '@devscribed/validation';
import {
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  InfoBanner,
  MenuDrawer,
  Preloader,
  Select,
  Table,
  TableToolbar,
  type SelectOption,
} from '@/ds';
import { PageHeader } from '@/layout/PageHeader';
import { useSession } from '@/layout/session-context';
import { StatusBadge } from '@/hiring/StatusBadge';
import { initialCandidateScope, rememberCandidateScope } from '@/hiring/candidate-scope';
import { formatListWhen } from '@/hiring/format';
import { valuesOf } from '@/hiring/select';
import { useMediaQuery } from '@/hiring/useMediaQuery';
import type {
  CandidateDatabase,
  CandidateRow,
  Category,
  Criterion,
  InterviewerOption,
  Vacancy,
} from '@/hiring/types';
import {
  CriteriaFilterRow,
  completeRows,
  newCriteriaRow,
  type CriteriaFilterRowState,
} from './CriteriaFilterRow';

/** 03 §02.6 — the same 300 ms the member and vacancy searches already use. */
const SEARCH_DEBOUNCE_MS = 300;

/** Below this the email folds under the name (03 design §Responsive). */
const NARROW = '(max-width: 1023px)';

/** How far ahead of the load-more row the next page starts arriving. */
const PREFETCH_MARGIN = '200px';

type Phase = 'loading' | 'ready' | 'failed' | 'gone';

/** The three org-wide lists the filter controls are built from, fetched once. */
interface FilterLibrary {
  vacancies: Vacancy[];
  categories: Category[];
  criteria: Criterion[];
}

const EMPTY_LIBRARY: FilterLibrary = { vacancies: [], categories: [], criteria: [] };

/**
 * The candidate database (spec 03) — one row per **person**, and the filters the two
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
 * **The filters live in a drawer** (03 §09). Five kinds of filter, one of them a
 * repeatable three-part object, is a query builder sitting on top of a list — and the
 * screen is a list. So the toolbar carries the scope, the search and one `Filters (n)`
 * button, and everything else is behind it. The count in that label is what buys the
 * hiding: a filter nobody can see is a filter nobody can undo.
 *
 * **It has absorbed My interviews** (03 §08). The former screen is the `Assigned to me`
 * scope, and an interviewer arrives here rather than at a list of their own. Which means
 * this screen now has two kinds of caller, and the difference shows in exactly two places:
 * somebody who may not see the whole database gets **no tab strip at all** — a control
 * offering one choice is not a choice — and no Interviewer filter, because in that scope
 * the interviewer is them.
 *
 * The scope is never enforced here. `canSeeAll` and the applied `scope` are read off the
 * response and reflected; a hand-crafted `?scope=all` is narrowed by the server, and this
 * screen simply agrees with what came back.
 */
export default function CandidatesPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  const router = useRouter();
  const viewer = useSession().account;

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
  /** Manage-only, so it is fetched separately and only for the caller who gets the field. */
  const [interviewers, setInterviewers] = useState<InterviewerOption[]>([]);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [statuses, setStatuses] = useState<ApplicationStatus[]>([]);
  const [vacancyIds, setVacancyIds] = useState<string[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [interviewerIds, setInterviewerIds] = useState<string[]>([]);
  const [criteriaRows, setCriteriaRows] = useState<CriteriaFilterRowState[]>([]);
  const [page, setPage] = useState(1);
  /**
   * Read once, from the URL and then from the last choice — never recomputed, or a
   * `replaceState` of our own would reopen the question we just answered.
   */
  const [scope, setScope] = useState<CandidateScope>(initialCandidateScope);
  const narrow = useMediaQuery(NARROW);

  // The address and the memory follow the applied scope, including the server's own
  // correction of one it refused: an interviewer who typed `?scope=all` ends up with a
  // URL that says what they are actually looking at.
  useEffect(() => {
    rememberCandidateScope(scope);
  }, [scope]);

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

  /** Only complete chips travel; one without a value is not yet a filter. */
  const criteria = useMemo(
    () => completeRows(criteriaRows).map((row) => criterionFilterParam(row)),
    [criteriaRows],
  );
  // Keyed by content rather than by identity: the array is rebuilt whenever a chip is
  // touched, and choosing a criterion — a chip that is not yet a filter — must not fire a
  // request that asks exactly what the last one did.
  const criteriaKey = JSON.stringify(criteria);

  /**
   * The interviewer filter is **not applied in `mine`** (03 §09.48), where the interviewer
   * is the viewer by definition. The field is not drawn there either, so this is the
   * client agreeing with a rule the server already enforces rather than enforcing it: a
   * value left over from the other tab neither travels nor counts.
   */
  const appliedInterviewerIds = useMemo(
    () => (scope === 'mine' ? [] : interviewerIds),
    [scope, interviewerIds],
  );

  /**
   * What the `Filters (n)` badge counts, and what `Clear filters` empties.
   *
   * **Search is not in it.** It has its own always-visible field in the toolbar, so it is
   * never a filter somebody has lost track of — which is the only thing this number is
   * for. **Nor is the scope**: the tab strip is navigation, it survives `Clear filters`,
   * and counting it would make `Assigned to me` read as a filter with no control here.
   */
  const filterCount =
    statuses.length +
    vacancyIds.length +
    categoryIds.length +
    appliedInterviewerIds.length +
    criteria.length;
  /**
   * Whether a **filter** narrows the list — what decides between the two filter-shaped
   * empty states. Search counts here even though it is not in the badge: an empty result
   * from a typo is still something to undo.
   */
  const filtered = filterCount > 0 || query.trim().length > 0;
  /**
   * Whether anything at all narrows it, which is a different question and the one the
   * count line asks. `Assigned to me` with no filters shows `3 of 128 candidates`: three
   * are mine, and a hundred and twenty-eight exist — both of which are true and neither
   * of which the other says.
   */
  const narrowed = filtered || scope === 'mine';

  /**
   * Which request is the current one. A page-2 fetch that lands after a filter change
   * would otherwise append rows from the question before last onto the answer to this one.
   */
  const currentRequest = useRef(0);

  const load = useCallback(async (): Promise<void> => {
    const params = new URLSearchParams();
    if (query.trim()) params.set('search', query.trim());
    for (const status of statuses) params.append('status', status);
    for (const id of vacancyIds) params.append('vacancyId', id);
    for (const id of categoryIds) params.append('categoryId', id);
    for (const id of appliedInterviewerIds) params.append('interviewerId', id);
    for (const filter of criteria) params.append('criterion', filter);
    if (scope === 'mine') params.set('scope', scope);
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
      // The server decides the scope, so the screen follows its answer rather than its
      // own request — which is what makes a hand-crafted `?scope=all` settle on `mine`
      // in the address bar too, instead of the tab and the URL disagreeing forever.
      setScope(body.scope);
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
  }, [
    orgId,
    query,
    statuses,
    vacancyIds,
    categoryIds,
    appliedInterviewerIds,
    criteriaKey,
    scope,
    page,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * The filter controls' own options. Fetched once: the libraries do not change while
   * somebody is filtering, and refetching them on every keystroke would be three requests
   * for lists nobody edited.
   */
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

  /**
   * The interviewer list, and only for the caller the Interviewer field is drawn for.
   *
   * `GET …/hiring/interviewers` is `HiringManageGuard`-only, and deliberately: it names
   * every member who may be assigned anything. So it is asked for **only once the
   * response has said the caller may see the whole database**, which is the same caller
   * — an interviewer's own drawer has no such field, never asks, and never 404s.
   */
  const canSeeAll = data?.canSeeAll ?? false;
  useEffect(() => {
    if (!canSeeAll) return undefined;
    let cancelled = false;

    void (async () => {
      const response = await fetch(`/api/organizations/${orgId}/hiring/interviewers`, {
        credentials: 'same-origin',
      });
      if (cancelled || !response.ok) return;
      const body = await response.json();
      setInterviewers(body.interviewers);
    })();

    return () => {
      cancelled = true;
    };
  }, [orgId, canSeeAll]);

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

  /** Every filter, and nothing else: the search field and the scope tab both survive. */
  function clearFilters(): void {
    applyFilter(() => {
      setStatuses([]);
      setVacancyIds([]);
      setCategoryIds([]);
      setInterviewerIds([]);
      setCriteriaRows([]);
    });
  }

  /** What the no-results state offers, where the search is the likelier culprit. */
  function clearAll(): void {
    setSearch('');
    applyFilter(() => {
      setQuery('');
      setStatuses([]);
      setVacancyIds([]);
      setCategoryIds([]);
      setInterviewerIds([]);
      setCriteriaRows([]);
    });
  }

  const zone = data?.viewerTimeZone ?? 'UTC';
  const shelf = library ?? EMPTY_LIBRARY;

  const options = (entries: Array<{ id: string; label: string }>, testId: string): SelectOption[] =>
    entries.map((entry) => ({
      value: entry.id,
      label: entry.label,
      testId: `${testId}-option-${entry.id}`,
    }));

  const statusOptions = options(
    APPLICATION_STATUSES.map((status) => ({ id: status, label: APPLICATION_STATUS_LABELS[status] })),
    'candidates-filter-status',
  );
  const positionOptions = options(
    shelf.vacancies.map((vacancy) => ({ id: vacancy.id, label: vacancy.title })),
    'candidates-filter-position',
  );
  const categoryOptions = options(
    shelf.categories.map((category) => ({ id: category.id, label: category.name })),
    'candidates-filter-category',
  );
  const interviewerOptions = options(
    interviewers.map((interviewer) => ({
      id: interviewer.accountId,
      // `(me)` rather than a `Me` entry of its own, so the filter and the `Assigned to me`
      // tab are visibly the same person (03 §09.48).
      label: interviewerPickerLabel(interviewer.fullName, interviewer.accountId === viewer.id),
    })),
    'candidates-filter-interviewer',
  );
  const chosen = (all: SelectOption[], ids: readonly string[]): SelectOption[] =>
    all.filter((option) => ids.includes(option.value));

  const criterionById = new Map(shelf.criteria.map((criterion) => [criterion.id, criterion]));
  /**
   * The picker offers what is not already a chip, archived below active and marked
   * (03 §04.19). The marker is the option's `hint` (ledger §21), drawn inside the row and
   * part of its accessible name — and *not* in the label, which is what the control
   * filters on: a badge welded into the text would make an archived criterion unfindable
   * by typing its name.
   */
  const criterionOptions: SelectOption[] = shelf.criteria
    .filter((criterion) => !criteriaRows.some((row) => row.criterionId === criterion.id))
    .slice()
    .sort((left, right) =>
      left.isArchived === right.isArchived
        ? left.name.localeCompare(right.name)
        : left.isArchived
          ? 1
          : -1,
    )
    .map((criterion) => ({
      value: criterion.id,
      label: criterion.name,
      hint: criterion.isArchived ? (
        <Badge status="inactive" outlined>
          {CANDIDATE_MESSAGES.archived}
        </Badge>
      ) : undefined,
      testId: `candidates-criteria-option-${criterion.id}`,
    }));

  return (
    <>
      <PageHeader
        title="Candidates"
        subtitle={<span data-testid="candidates-timezone">Times in {zone}</span>}
      />

      {/*
        Blue's own list-screen row (§52): the strip on the left, the 250px search and the
        actions on the right, 20px gaps. The scope tabs are drawn only once the response
        has said the caller may see both — which is also why they are not rendered while
        the first request is in flight: a strip that appeared and then vanished would be
        the flash the shell's `/api/me` gate exists to prevent.

        Each label carries its own count, computed under the filters already applied — so
        the tab answers "and how many would the other one show?" before it is pressed.
      */}
      <TableToolbar
        tabs={
          data?.canSeeAll
            ? [
                {
                  value: 'all',
                  label: candidateScopeTabLabel('all', data.scopeCounts.all ?? 0),
                  testId: 'candidates-scope-all',
                },
                {
                  value: 'mine',
                  label: candidateScopeTabLabel('mine', data.scopeCounts.mine),
                  testId: 'candidates-scope-mine',
                },
              ]
            : undefined
        }
        activeTab={scope}
        onTab={(next) => applyFilter(() => setScope(next as CandidateScope))}
        tabsLabel={CANDIDATE_MESSAGES.scope.tablist}
        tabsTestId="candidates-scope-tabs"
        search={search}
        onSearch={(event) => setSearch(event.target.value)}
        onClearSearch={() => setSearch('')}
        searchPlaceholder={CANDIDATE_MESSAGES.searchPlaceholder}
        searchLabel="Search name or email"
        searchTestId="candidates-search-input"
      >
        <Button
          variant="primary"
          onClick={() => setFiltersOpen(true)}
          aria-expanded={filtersOpen}
          aria-haspopup="dialog"
          data-testid="candidates-filters-open"
        >
          {candidateFiltersLabel(filterCount)}
        </Button>
      </TableToolbar>

      {/*
        Five kinds of filter behind one button (03 §09). The panel is the shell's own
        drawer, hung from the navbar rather than over it (ledger §51), and it is a dialog:
        focus moves in, `Escape` and the scrim leave, and focus comes back to the button
        that opened it.
      */}
      <MenuDrawer
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        closeLabel={CANDIDATE_MESSAGES.filters.close}
        closeTestId="candidates-filters-close"
        role="dialog"
        aria-labelledby="candidates-filters-title"
        data-testid="candidates-filters"
      >
        <div className="candidates-filters">
          <h2 id="candidates-filters-title" className="candidates-filters-title">
            {CANDIDATE_MESSAGES.filters.title}
          </h2>

          {/*
            Every field is the same multi-select — same chips, same list, same keyboard —
            and **a filter with nothing to choose in it is not drawn** (03 §09.52). Status
            is the only one whose options are constant; the other four are read from a
            library, and all four of those libraries are `admin`/`manager` only, GET
            included (06 §Actors). So an interviewer — who this screen opened to in Phase 1
            — would otherwise be handed four empty pickers on a screen that is theirs. The
            same rule covers an organization that has simply not made a category yet.
          */}
          <Select
            isMulti
            label={CANDIDATE_MESSAGES.filters.status}
            placeholder={CANDIDATE_MESSAGES.filters.anyStatus}
            value={chosen(statusOptions, statuses)}
            options={statusOptions}
            onChange={(option) =>
              applyFilter(() => setStatuses(valuesOf(option) as ApplicationStatus[]))
            }
            data-testid="candidates-filter-status"
            chipTestId={(option) =>
              `candidates-filter-chip-${typeof option === 'string' ? option : option.value}`
            }
          />

          {positionOptions.length > 0 && (
            <Select
              isMulti
              isSearchable
              label={CANDIDATE_MESSAGES.filters.position}
              placeholder={CANDIDATE_MESSAGES.filters.anyPosition}
              value={chosen(positionOptions, vacancyIds)}
              options={positionOptions}
              onChange={(option) => applyFilter(() => setVacancyIds(valuesOf(option)))}
              data-testid="candidates-filter-position"
              chipTestId={(option) =>
                `candidates-filter-chip-${typeof option === 'string' ? option : option.value}`
              }
            />
          )}

          {categoryOptions.length > 0 && (
            <Select
              isMulti
              isSearchable
              label={CANDIDATE_MESSAGES.filters.category}
              placeholder={CANDIDATE_MESSAGES.filters.anyCategory}
              value={chosen(categoryOptions, categoryIds)}
              options={categoryOptions}
              onChange={(option) => applyFilter(() => setCategoryIds(valuesOf(option)))}
              data-testid="candidates-filter-category"
              chipTestId={(option) =>
                `candidates-filter-chip-${typeof option === 'string' ? option : option.value}`
              }
            />
          )}

          {/*
            Absent in `mine`, where the interviewer is the viewer — a field whose only
            answer is already given is not a filter (03 §09.48). Absent, not disabled:
            there is nothing here to enable.
          */}
          {scope !== 'mine' && interviewerOptions.length > 0 && (
            <Select
              isMulti
              isSearchable
              label={CANDIDATE_MESSAGES.filters.interviewer}
              placeholder={CANDIDATE_MESSAGES.filters.anyInterviewer}
              value={chosen(interviewerOptions, interviewerIds)}
              options={interviewerOptions}
              onChange={(option) => applyFilter(() => setInterviewerIds(valuesOf(option)))}
              data-testid="candidates-filter-interviewer"
              chipTestId={(option) =>
                `candidates-filter-chip-${typeof option === 'string' ? option : option.value}`
              }
            />
          )}

          {(shelf.criteria.length > 0 || criteriaRows.length > 0) && (
            <div className="candidates-criteria">
              {/*
                The same autocomplete the candidate card adds an assessment with, minus the
                create row: a filter can only name what the library already holds, and
                nothing is created from here.
              */}
              <Select
                isSearchable
                label={CANDIDATE_MESSAGES.filters.criteria}
                placeholder={CANDIDATE_MESSAGES.addCriterion.placeholder}
                value={undefined}
                options={criterionOptions}
                onChange={(option) => {
                  const criterion = criterionById.get(
                    typeof option === 'string' ? option : (option as SelectOption).value,
                  );
                  if (!criterion) return;
                  applyFilter(() =>
                    setCriteriaRows((current) => [...current, newCriteriaRow(criterion)]),
                  );
                }}
                data-testid="candidates-criteria-filter-add"
              />

              {criteriaRows.length > 0 && (
                <ul className="candidates-criteria-chips">
                  {criteriaRows.map((row, index) => {
                    const criterion = criterionById.get(row.criterionId);
                    if (!criterion) return null;
                    return (
                      <CriteriaFilterRow
                        key={row.criterionId}
                        index={index}
                        row={row}
                        criterion={criterion}
                        onChange={(next) =>
                          applyFilter(() =>
                            setCriteriaRows(
                              criteriaRows.map((existing, at) => (at === index ? next : existing)),
                            ),
                          )
                        }
                        onRemove={() =>
                          applyFilter(() =>
                            setCriteriaRows(criteriaRows.filter((_, at) => at !== index)),
                          )
                        }
                      />
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {/*
            Nothing here applies anything — every control above already did. `Show results`
            dismisses the panel covering the list it has been changing, which is the only
            thing left to want.
          */}
          <div className="candidates-filters-actions">
            <Button
              variant="primary"
              onClick={() => setFiltersOpen(false)}
              data-testid="candidates-filters-apply"
            >
              {CANDIDATE_MESSAGES.filters.showResults}
            </Button>
            {filterCount > 0 && (
              <Button onClick={clearFilters} data-testid="candidates-clear-filters">
                {CANDIDATE_MESSAGES.clearFilters}
              </Button>
            )}
          </div>
        </div>
      </MenuDrawer>

      <div className="candidates-count-row">
        {/*
          The count is the feedback for every filter change, and the only thing on this
          screen that announces itself. It is also the whole answer to what pagination used
          to be here for. During a refetch it holds a loader rather than a stale number — a
          number that was true one request ago is worse than no number.
        */}
        <p aria-live="polite" data-testid="candidates-count">
          {pending && page === 1 ? (
            // Named, but not a live region of its own: the `<p>` around it already is one,
            // and a nested pair announces the same change twice.
            <Preloader size={8} margin={5} aria-label="Counting candidates" />
          ) : data ? (
            candidateResultLabel(data.matched, data.total, narrowed)
          ) : null}
        </p>

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
                  /*
                    The heading moves with the scope, because the column's contents do
                    (03 §08.44). In `All` this is the candidate's most recent application.
                    In `Assigned to me` it is the viewer's own interview — the nearest one
                    ahead, or their most recent behind — and calling that "latest" would
                    be the row disagreeing with the order it is sorted by, in words.
                  */
                  label: scope === 'mine' ? 'Interview' : 'Latest application',
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

          {/*
            Driven by `total` — org-wide and unfiltered — and never by a scoped count.
            An interviewer whose own list is empty must not be told the database is, or
            they are sent off to share a booking link while 35 candidates sit in it.
          */}
          {phase === 'ready' && rows.length === 0 && data?.total === 0 && (
            <EmptyState data-testid="candidates-empty-state">
              {CANDIDATE_MESSAGES.empty}
            </EmptyState>
          )}

          {phase === 'ready' && rows.length === 0 && (data?.total ?? 0) > 0 && (
            <>
              {/*
                Two facts, one slot. Filters that match nobody is a thing to undo, and
                gets the action. `Assigned to me` with nothing filtered is not a failed
                query at all — it is the empty state My interviews had, and it inherits
                its wording rather than accusing the member of over-filtering.
              */}
              <EmptyState data-testid="candidates-no-results">
                {filtered ? CANDIDATE_MESSAGES.noResults : INTERVIEW_MESSAGES.noUpcoming}
              </EmptyState>
              {filtered && (
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
              )}
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
