'use client';

import { notFound, useRouter, useSearchParams } from 'next/navigation';
import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  APPLICATION_STATUSES,
  APPLICATION_STATUS_LABELS,
  CANDIDATE_MESSAGES,
  HIRING_MESSAGES,
  INTERVIEW_MESSAGES,
  MESSAGES,
  candidateActionsLabel,
  candidateDeleteConfirmation,
  candidateDeleteTitle,
  candidateDeletedToast,
  candidateFiltersLabel,
  candidateResultLabel,
  candidateScopeTabLabel,
  formatShortDate,
  formatSlotTime,
  interviewerPickerLabel,
  pageCount,
  type ApplicationStatus,
  type CandidateScope,
} from '@devscribed/validation';
import {
  Badge,
  Button,
  Card,
  Chip,
  ConfirmDialog,
  EmptyState,
  InfoBanner,
  MenuDrawer,
  Pagination,
  Popover,
  Preloader,
  Select,
  Table,
  TableToolbar,
  Toast,
  ToastHost,
  type SelectOption,
} from '@/ds';
import { PageHeader } from '@/layout/PageHeader';
import { useSession } from '@/layout/session-context';
import { CancelInterviewDialog } from '@/hiring/CancelInterviewDialog';
import { StatusBadge } from '@/hiring/StatusBadge';
import { takeDeletedCandidate } from '@/hiring/candidate-deleted';
import {
  candidateListHref,
  candidateListQuery,
  readCandidateListAddress,
  rememberCandidateList,
} from '@/hiring/candidate-list';
import { rememberCandidateOrigin } from '@/hiring/candidate-origin';
import { valuesOf } from '@/hiring/select';
import { useMediaQuery } from '@/hiring/useMediaQuery';
import { useToasts } from '@/hiring/useToasts';
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
  restoreCriteriaRows,
  type CriteriaFilterRowState,
} from './CriteriaFilterRow';

/** 03 §02.6 — the same 300 ms the member and vacancy searches already use. */
const SEARCH_DEBOUNCE_MS = 300;

/** Below this the email folds under the name (03 design §Responsive). */
const NARROW = '(max-width: 1023px)';

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
  /**
   * The query the **router** reports, which is not the same thing as `window.location`'s
   * during a client-side navigation — see `readCandidateListAddress`. A card's back link
   * arrives here through `router.push`, and this is the only source that is already
   * holding the address it pushed.
   */
  const asked = useSearchParams();
  const viewer = useSession().account;

  const [phase, setPhase] = useState<Phase>('loading');
  /**
   * The whole of the last answer — its counts, its zone **and its page of rows**.
   *
   * One piece of state rather than two, which is what makes a refetch dim the list instead
   * of emptying it: the previous page is still here, and it is replaced only when the next
   * one has actually arrived (03 design §Interactions).
   */
  const [data, setData] = useState<CandidateDatabase | null>(null);
  const [pending, setPending] = useState(false);
  const [library, setLibrary] = useState<FilterLibrary | null>(null);
  /** Manage-only, so it is fetched separately and only for the caller who gets the field. */
  const [interviewers, setInterviewers] = useState<InterviewerOption[]>([]);

  const [filtersOpen, setFiltersOpen] = useState(false);
  /**
   * The question this screen opened on, read once from the URL and the remembered scope.
   *
   * Once, and in one place: every field below initialises from it, and a second read would
   * be a second answer the moment this screen rewrote its own address — which it does on
   * the first render.
   */
  const [opened] = useState(() => readCandidateListAddress(asked.toString()));
  const [search, setSearch] = useState(opened.search);
  const [query, setQuery] = useState(opened.search);
  const [statuses, setStatuses] = useState<ApplicationStatus[]>(opened.statuses);
  const [vacancyIds, setVacancyIds] = useState<string[]>(opened.vacancyIds);
  const [categoryIds, setCategoryIds] = useState<string[]>(opened.categoryIds);
  const [interviewerIds, setInterviewerIds] = useState<string[]>(opened.interviewerIds);
  /**
   * Restored **without the library**, which has not arrived yet and which the first
   * request must not wait for.
   *
   * A row rebuilt from the URL alone sends exactly the parameter it was built from — see
   * `restoreCriteriaRows` — so the opening request asks the question the address states.
   * What it cannot know is which criteria are `boolean`, whose two questions live inside
   * the operator rather than beside it; that is the one thing the library fixes up when it
   * lands, and until then the chip simply is not drawn.
   */
  const [criteriaRows, setCriteriaRows] = useState<CriteriaFilterRowState[]>(() =>
    restoreCriteriaRows(opened.criteria),
  );
  const [page, setPage] = useState(opened.page);
  /**
   * Read once, from the URL and then from the last choice — never recomputed, or a
   * `replaceState` of our own would reopen the question we just answered.
   */
  const [scope, setScope] = useState<CandidateScope>(opened.scope);
  const narrow = useMediaQuery(NARROW);
  /**
   * Toasts, and the one row whose interview is being called off.
   *
   * The dialog is mounted **once for the page**, not once per row: twenty-five rows would
   * otherwise be twenty-five idle dialogs, and only one of them can ever be open.
   */
  const { toasts, push, dismiss } = useToasts();
  const [cancelling, setCancelling] = useState<CandidateRow | null>(null);
  /**
   * The row whose person is being deleted, and whether the request is in flight.
   *
   * `busy` matters here in a way it does not for the interview actions: this confirmation
   * is the last point at which the member can change their mind, so it stays up until the
   * server has actually answered rather than dismissing on the press and leaving the
   * outcome to a toast that may never come (ledger §41).
   */
  const [deleting, setDeleting] = useState<CandidateRow | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  /**
   * A delete taken on the candidate card lands here (03 §11.65).
   *
   * The card 404s the instant the flag is set, so it cannot report its own outcome — it
   * leaves the name and navigates, and this is where the confirmation is raised. Read
   * once and cleared, so a reload of the list a minute later says nothing.
   */
  useEffect(() => {
    const deleted = takeDeletedCandidate();
    if (deleted === null) return;
    push({
      message: candidateDeletedToast(deleted),
      tone: 'success',
      testId: 'toast-candidate-deleted',
    });
  }, [push]);

  // Typing debounces; every other filter is a discrete choice and refetches at once —
  // waiting 300 ms on a click reads as lag rather than as care (03 design §Interactions).
  //
  // A run that would apply the term already applied does nothing at all, and that guard is
  // load-bearing rather than an optimisation: this effect also fires on mount, and a list
  // opened at `?page=3` would otherwise be returned to page 1 three hundred milliseconds
  // after arriving on it (§09.53). Typing back to what was already searched is the same
  // non-event and gets the same answer.
  useEffect(() => {
    if (search === query) return undefined;
    const timer = setTimeout(() => {
      setQuery(search);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search, query]);

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
  const criteria = useMemo(() => completeRows(criteriaRows), [criteriaRows]);
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
   * The whole question, in the one shape the request and the address bar share.
   *
   * Built here rather than in each of them, because the URL claiming a list the server was
   * never asked for is precisely the bug a back link is supposed to be immune to.
   */
  const address = useMemo(
    () => ({
      scope,
      search: query,
      statuses,
      vacancyIds,
      categoryIds,
      interviewerIds: appliedInterviewerIds,
      criteria,
      page,
    }),
    // `criteriaKey` stands in for `criteria` for the reason given above it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope, query, statuses, vacancyIds, categoryIds, appliedInterviewerIds, criteriaKey, page],
  );

  /** Where this list currently is — one string, written to two places. */
  const listHref = useMemo(() => candidateListHref(orgId, address), [orgId, address]);

  /**
   * The address bar and the remembered scope follow what is actually applied — the
   * server's own correction of a scope it refused included, so an interviewer who typed
   * `?scope=all` ends up with a URL that says what they are looking at (03 §08.40).
   */
  useEffect(() => {
    rememberCandidateList(listHref, address.scope);
  }, [listHref, address.scope]);

  /**
   * And the same address is what a candidate card comes back to (04 §01.8).
   *
   * Recorded from this screen rather than from each door out of it: a row click, a row's
   * `href`, `View candidate` and `Reschedule interview` are four ways to the same card,
   * and the one that forgot to record would be a back link that lied.
   */
  useEffect(() => {
    rememberCandidateOrigin(orgId, {
      label: HIRING_MESSAGES.card.backToCandidates,
      href: listHref,
    });
  }, [orgId, listHref]);

  /**
   * Which request is the current one. A page-2 fetch that lands after a filter change
   * would otherwise append rows from the question before last onto the answer to this one.
   */
  const currentRequest = useRef(0);

  const load = useCallback(async (): Promise<void> => {
    const params = candidateListQuery(address);

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
      setPhase('ready');
    } catch {
      if (currentRequest.current === request) setPhase('failed');
    } finally {
      if (currentRequest.current === request) setPending(false);
    }
    // One dependency, because there is one question: `address` is already memoised on
    // `criteriaKey` rather than on the array's identity, so a chip touched without being
    // completed still does not refetch.
  }, [orgId, address]);

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
   * The chips this screen opened on, redrawn now that their criteria are known.
   *
   * Once, and only for the rows the URL supplied: the picker cannot offer a criterion
   * before the library holds one, so nothing the member did can be sitting here to
   * overwrite. Every row already sends the right parameter — this is what makes the
   * `boolean` ones **drawable** (03 §09.53).
   */
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !library || opened.criteria.length === 0) return;
    restored.current = true;
    setCriteriaRows(restoreCriteriaRows(opened.criteria, library.criteria));
  }, [library, opened]);

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

  /** The page on screen, which is the last answer's — never a page still in flight. */
  const rows = data?.candidates ?? [];
  /**
   * Every request dims the rows rather than replacing them with a loader, page changes
   * included: a table that collapsed and re-expanded would reflow the page under the
   * reader, and a page change is exactly when the reader is looking at it.
   */
  const refiltering = pending && rows.length > 0;
  const pages = data ? pageCount(data.matched, data.pageSize) : 1;

  /**
   * A page that no longer exists.
   *
   * Every filter change already returns to page 1, so this can only be reached by the
   * list shrinking under a page somebody was on — a candidate deleted, an interview
   * cancelled out of a status filter. Falling back to the first page is the only answer
   * that shows rows; clamping silently to the last would be a page nobody asked for.
   */
  useEffect(() => {
    if (!data || pending) return;
    if (data.candidates.length === 0 && data.matched > 0 && page > 1) setPage(1);
  }, [data, pending, page]);

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

  /**
   * Deleting the person a row is about (03 §11).
   *
   * The list is refetched rather than the row spliced out: the person leaves every count
   * on the screen at once — both scope tabs, the match line and the org-wide total — and
   * a row removed locally would leave four numbers claiming they are still there.
   */
  async function remove(row: CandidateRow): Promise<void> {
    setDeletingBusy(true);
    try {
      const response = await fetch(`/api/organizations/${orgId}/hiring/candidates/${row.id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (!response.ok) {
        // Said out loud rather than left to a row that quietly stayed put. A 403 here is
        // a caller the menu should not have been drawn for, and both readings of that are
        // the member's to know about.
        push({
          message: MESSAGES.generic,
          tone: 'error',
          testId: 'toast-candidate-delete-failed',
        });
        return;
      }
      push({
        message: candidateDeletedToast(row.fullName),
        tone: 'success',
        testId: 'toast-candidate-deleted',
      });
      void load();
    } catch {
      push({ message: MESSAGES.generic, tone: 'error', testId: 'toast-candidate-delete-failed' });
    } finally {
      setDeletingBusy(false);
      setDeleting(null);
    }
  }

  /**
   * The row's kebab (03 §10.53).
   *
   * Split by what the item is *about*. `View candidate` is about the person and is always
   * there; the three interview actions are drawn only while there is an interview to act
   * on — one that has not been called off. Absent rather than disabled, which is the same
   * rule the candidate card's own pair follows (07 §14.65): the API refuses a cancelled or
   * past interview anyway, so a disabled row would only invite somebody to work out why.
   *
   * A past interview keeps them. `isLiveBooking` is the card's test because the card is
   * where the whole interview is on screen; here the row carries a date and a status and
   * nothing else, and hiding the actions on a list would leave a member wondering which of
   * two rows they were allowed to press. The endpoints answer for themselves.
   */
  function rowActions(row: CandidateRow) {
    const application = row.latestApplication;
    const open = () => router.push(`/org/${orgId}/hiring/candidates/${row.id}`);

    const items = [];
    if (application && !application.isCancelled) {
      items.push({
        key: 'calendar',
        label: CANDIDATE_MESSAGES.actions.viewInCalendar,
        testId: `candidate-action-calendar-${row.id}`,
        // Confirms and does nothing else — no navigation, no request. The interview's
        // entry is the interviewer's own mailbox event and this product holds no deep
        // link into it, so the row says the request landed rather than pretending to
        // somewhere to go (03 §10.55).
        onSelect: () =>
          push({
            message: CANDIDATE_MESSAGES.toast.viewInCalendar,
            tone: 'info',
            testId: `toast-calendar-${row.id}`,
          }),
      });
      items.push({
        key: 'reschedule',
        label: CANDIDATE_MESSAGES.actions.reschedule,
        testId: `candidate-action-reschedule-${row.id}`,
        // The team never sends the candidate's own manage link (07 §01.5), so the internal
        // door is the card — opened on this application, with the dialog already up.
        onSelect: () =>
          router.push(
            `/org/${orgId}/hiring/candidates/${row.id}?application=${application.id}&reschedule=1`,
          ),
      });
      items.push({
        key: 'cancel',
        label: CANDIDATE_MESSAGES.actions.cancel,
        testId: `candidate-action-cancel-${row.id}`,
        danger: true,
        onSelect: () => setCancelling(row),
      });
    }

    items.push({
      key: 'open',
      label: CANDIDATE_MESSAGES.actions.viewCandidate,
      testId: `candidate-action-open-${row.id}`,
      onSelect: open,
    });

    /*
     * The only item about the person rather than about an interview, and the only one
     * gated on the caller (03 §11.60). `canSeeAll` is exactly the manage role the
     * endpoint requires — it is the guard's own finding, arriving on the same response —
     * so the menu and the server are reading one fact, not two. An interviewer reached
     * this list through an assignment, and an assignment is not authority over a record.
     */
    if (canSeeAll) {
      items.push({
        key: 'delete',
        label: CANDIDATE_MESSAGES.actions.delete,
        testId: `candidate-action-delete-${row.id}`,
        danger: true,
        onSelect: () => setDeleting(row),
      });
    }

    return items;
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
          loader and both empty messages sit inside it rather than replacing it.
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
                // The kebab lives inside the row, and pressing it is not opening the row.
                // `closest` rather than a stopPropagation in the menu, because the menu is
                // a portal (ledger §55) and its rows are not inside this anchor at all.
                if ((event.target as HTMLElement).closest('[data-row-actions]')) {
                  event.preventDefault();
                  return;
                }
                event.preventDefault();
                router.push(`/org/${orgId}/hiring/candidates/${row.id}`);
              }}
              columns={[
                {
                  label: CANDIDATE_MESSAGES.columns.name,
                  flex: 1.5,
                  align: 'flex-start',
                  render: (row) => (
                    <div className="candidate-name-cell">
                      <span className="candidate-name-line">
                        <span data-testid={`candidate-name-${row.id}`} className="candidate-name">
                          {row.fullName}
                        </span>
                        {/* Only when there is more than one — "1 application" is noise. It
                            sits on the name's own line, above the chips, because it is a
                            fact about the person rather than one more thing they were
                            assessed as. */}
                        {row.applicationCount > 1 && (
                          <span
                            data-testid={`candidate-app-count-${row.id}`}
                            className="candidate-name-meta"
                          >
                            {row.applicationCount} applications
                          </span>
                        )}
                      </span>
                      {/*
                        Four columns do not fit a tablet, and the email is the one that can
                        be read on a second line without losing its meaning — a date or a
                        status cannot. Rendered here **or** in its own column, never both,
                        so the row still holds exactly one of each testid.
                      */}
                      {narrow && (
                        <span
                          data-testid={`candidate-email-${row.id}`}
                          className="candidate-name-meta"
                        >
                          {row.email}
                        </span>
                      )}
                      {/*
                        What this person has been assessed as, rolled up to their most
                        recent interview that answered each criterion (03 §01.2). The same
                        read-only `Chip` the candidate card draws an assessment with, and
                        the same sentence in the other direction: the card records
                        *English is B1*, this says *English: B1*.
                      */}
                      {row.criteria.length > 0 && (
                        <span className="candidate-criteria">
                          {row.criteria.map((assessment) => (
                            <Chip
                              key={assessment.criterionId}
                              label={`${assessment.name}: ${assessment.value}`}
                              data-testid={`candidate-criterion-${row.id}-${assessment.criterionId}`}
                            />
                          ))}
                        </span>
                      )}
                    </div>
                  ),
                },
                ...(narrow
                  ? []
                  : [
                      {
                        label: CANDIDATE_MESSAGES.columns.email,
                        flex: 1.2,
                        align: 'flex-start' as const,
                        render: (row: CandidateRow) => (
                          <span data-testid={`candidate-email-${row.id}`} className="candidate-ellipsis">
                            {row.email}
                          </span>
                        ),
                      },
                    ]),
                {
                  /*
                    Vacancy and interview date are two columns rather than one stacked
                    cell: they are scanned for different reasons, and the date wants
                    centring while a title wants its left edge.
                  */
                  label: CANDIDATE_MESSAGES.columns.vacancy,
                  flex: 1.1,
                  align: 'flex-start',
                  render: (row) => (
                    <div data-testid={`candidate-vacancy-${row.id}`} className="candidate-stacked">
                      <span className="candidate-ellipsis">{row.latestApplication?.vacancyTitle}</span>
                      {/*
                        The interviewer rides as a quieter second line under the title
                        rather than taking a column of its own, which would only repeat the
                        vacancy: it is 1:1 with it. Absent in `mine`, where it is the viewer
                        on every row and says nothing (03 §09.48).
                      */}
                      {scope !== 'mine' && row.latestApplication && (
                        <span
                          data-testid={`candidate-interviewer-${row.id}`}
                          className="candidate-ellipsis candidate-subline"
                        >
                          {row.latestApplication.interviewer.fullName}
                        </span>
                      )}
                    </div>
                  ),
                },
                {
                  label: CANDIDATE_MESSAGES.columns.interviewDate,
                  flex: 1,
                  align: 'center',
                  render: (row) => (
                    <div data-testid={`candidate-latest-${row.id}`} className="candidate-date">
                      {row.latestApplication && (
                        <>
                          <span>{formatShortDate(new Date(row.latestApplication.startUtc), zone)}</span>
                          <span className="candidate-subline">
                            {formatSlotTime(new Date(row.latestApplication.startUtc), zone)}
                          </span>
                        </>
                      )}
                    </div>
                  ),
                },
                {
                  label: CANDIDATE_MESSAGES.columns.status,
                  // `Table` has grow and a cap but no basis, so a fixed 120px column is
                  // written as the smallest share that reaches the cap at every width
                  // this screen targets. Blue's own 80px cap is back on the last column,
                  // where it was measured — prod's icon-only actions cell (§18) — because
                  // Status is no longer the one holding it.
                  flex: 0.8,
                  align: 'flex-start',
                  maxWidth: 120,
                  render: (row) =>
                    !row.latestApplication ? null : row.latestApplication.isCancelled ? (
                      /*
                        A cancelled interview has no stage to report. `isCancelled` says the
                        interview did not take place and deliberately nothing about the
                        candidate's standing (07 §01.1), so the row states that instead of a
                        status the candidate never moved out of.
                      */
                      <Badge
                        status="inactive"
                        outlined
                        data-testid={`candidate-status-${row.id}`}
                      >
                        {HIRING_MESSAGES.board.cancelled}
                      </Badge>
                    ) : (
                      <StatusBadge
                        status={row.latestApplication.status}
                        data-testid={`candidate-status-${row.id}`}
                      />
                    ),
                },
                {
                  label: CANDIDATE_MESSAGES.columns.actions,
                  render: (row) => (
                    <Popover
                      label={candidateActionsLabel(row.fullName)}
                      /* The trigger is inside the row's anchor by construction, so the row
                         has to be told which press was not for it. `Popover` forwards rest
                         props onto the trigger, so this marks the button itself and the
                         handler above finds it with `closest`. The menu needs no such mark:
                         it is portalled, and §55 stops what it raises from reaching here. */
                      data-row-actions=""
                      data-testid={`candidate-actions-${row.id}`}
                      items={rowActions(row)}
                    />
                  ),
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

      {/*
        Reversal 1, back the other way: the page strip returns, and the count it was once
        traded for is still above the table — position and volume are two different
        questions and the two controls answer one each. It draws nothing at one page
        (ledger §53), so a short list is unchanged.
      */}
      {phase === 'ready' && (
        <Pagination
          page={page}
          pageCount={pages}
          onChange={setPage}
          label={CANDIDATE_MESSAGES.pagination.label}
          previousLabel={CANDIDATE_MESSAGES.pagination.previous}
          nextLabel={CANDIDATE_MESSAGES.pagination.next}
          pageTestId={(number) => `candidates-page-${number}`}
          data-testid="candidates-pagination"
        />
      )}

      {/*
        The same dialog the candidate card mounts, over the same endpoint (07 §08.40) —
        one component, two hosts. Mounted once for the page rather than once per row, and
        only while a row has actually asked for it.
      */}
      {cancelling?.latestApplication && (
        <CancelInterviewDialog
          open
          orgId={orgId}
          applicationId={cancelling.latestApplication.id}
          candidateName={cancelling.fullName}
          startUtc={cancelling.latestApplication.startUtc}
          timeZone={zone}
          onClose={() => setCancelling(null)}
          onCancelled={() => {
            setCancelling(null);
            push({
              message: HIRING_MESSAGES.toast.interviewCancelled,
              tone: 'success',
              testId: 'toast-interview-cancelled',
            });
            // The row's badge, the status filter and both scope counts all move with it,
            // so the answer is refetched rather than patched in place.
            void load();
          }}
        />
      )}

      {/*
        A yes/no whose accept is the whole action, which is what blue's `ConfirmDialog` is
        for. It stays up while the request is in flight (`closeOnAccept={false}`, ledger
        §41): this is the last point at which the member can change their mind, and a
        dialog that dismissed on the press would leave the outcome to a toast that has not
        happened yet.
      */}
      {deleting && (
        <ConfirmDialog
          open
          title={candidateDeleteTitle(deleting.fullName)}
          // Both counts, because they are what makes the decision answerable — and no
          // "cannot be undone", because it can: re-booking with the same address brings
          // the whole record back (03 §11.61).
          description={candidateDeleteConfirmation(
            deleting.applicationCount,
            deleting.assessmentCount,
          )}
          acceptBtnText={CANDIDATE_MESSAGES.deleteDialog.accept}
          declineBtnText={CANDIDATE_MESSAGES.deleteDialog.decline}
          busy={deletingBusy}
          closeOnAccept={false}
          onAccept={() => void remove(deleting)}
          onClose={() => setDeleting(null)}
          acceptTestId={`candidate-delete-confirm-${deleting.id}`}
          data-testid="candidate-delete-dialog"
        />
      )}

      <ToastHost>
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            tone={toast.tone}
            data-testid={toast.testId}
            onDismiss={() => dismiss(toast.id)}
          >
            {toast.message}
          </Toast>
        ))}
      </ToastHost>
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
