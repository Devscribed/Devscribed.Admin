'use client';

import { notFound } from 'next/navigation';
import { use, useCallback, useEffect, useState } from 'react';
import {
  CRITERION_MESSAGES,
  CRITERION_TYPE_LABELS,
  LIBRARY_MESSAGES,
  SCALE_SEPARATOR,
  categoryDeleteConfirmation,
  categoryUsageDescription,
  criterionDeleteBlockedMessage,
  criterionDeleteConfirmation,
  criterionUsageLabel,
  libraryActionsLabel,
  libraryTabLabel,
  MESSAGES,
  type LibraryTab,
} from '@devscribed/validation';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  FormActions,
  Modal,
  Popover,
  Preloader,
  Table,
  TableToolbar,
  TextInput,
} from '@devscribed/ds';
import { PageHeader } from '@/layout/PageHeader';
import { CriterionDialog } from '@/hiring/CriterionDialog';
import { LoadFailed } from '@/hiring/LoadFailed';
import { useToast } from '@/toast';
import type { Category, Criterion } from '@/hiring/types';

type Phase = 'loading' | 'ready' | 'failed' | 'gone';

/** The same 300 ms every other search in the product debounces by. */
const SEARCH_DEBOUNCE_MS = 300;

/** Absent id creates; present id renames. One dialog, because it is one field. */
type Editing = { id: string | null; name: string };

/**
 * Libraries — the maintenance inline creation cannot do.
 *
 * Both libraries are created where they are needed: a category from the vacancy dialog,
 * a criterion from a candidate card mid-interview. Which is why both empty states point
 * there rather than at the buttons on this page. What lives here is renaming, archiving
 * and deleting, and the usage counts that make those decisions rather than guesses.
 *
 * The body is the product's own list-screen row — the toolbar with its strip, search and
 * primary action over a table whose rows act through a kebab — because that is what every
 * other list in the module became, and two lists stacked as cards had this screen reading
 * as the one place the layout was from somewhere else. The two libraries are the two
 * tabs: they were never two halves of one page so much as two pages sharing mechanics.
 *
 * Unlike the vacancy strip, the tab counts ignore the search. The search is not shared
 * across the strip — it resets on a switch, since a term typed over categories means
 * nothing over criteria — so each label carries its whole library's size, which is
 * exactly what pressing its tab shows.
 */
export default function HiringSettingsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  const [phase, setPhase] = useState<Phase>('loading');
  /** A request is in flight over rows that are already on screen (decisions §34). */
  const [refreshing, setRefreshing] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [criteria, setCriteria] = useState<Criterion[]>([]);

  const [tab, setTab] = useState<LibraryTab>('categories');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');

  const [editing, setEditing] = useState<Editing | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const [deletingCriterion, setDeletingCriterion] = useState<Criterion | null>(null);
  const [busy, setBusy] = useState(false);
  /** Absent is closed; a present `criterion` edits, an absent one creates. */
  const [criterionDialog, setCriterionDialog] = useState<{ criterion?: Criterion } | null>(null);
  const { push } = useToast();

  // Typing debounces; the tabs do not, because a click is already a deliberate act.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async (): Promise<void> => {
    setRefreshing(true);
    try {
      const [categoriesRes, criteriaRes] = await Promise.all([
        fetch(`/api/organizations/${orgId}/hiring/categories`, { credentials: 'same-origin' }),
        // Archived criteria included: this is the screen that restores them, and one that
        // could not show an archived criterion could not offer the way back (06 §03.19).
        fetch(`/api/organizations/${orgId}/hiring/criteria?includeArchived=true`, {
          credentials: 'same-origin',
        }),
      ]);

      // `user` and `viewer` never saw the sidebar row, so a direct navigation is the only
      // way to arrive here — and the honest answer to it is the not-found state.
      if (
        [categoriesRes.status, criteriaRes.status].some(
          (status) => status === 403 || status === 404,
        )
      ) {
        setPhase('gone');
        return;
      }
      if (!categoriesRes.ok || !criteriaRes.ok) {
        setPhase('failed');
        push({
          message: LIBRARY_MESSAGES.loadFailed,
          tone: 'error',
          testId: 'toast-libraries-load-failed',
        });
        return;
      }
      setCategories((await categoriesRes.json()).categories);
      setCriteria((await criteriaRes.json()).criteria);
      setPhase('ready');
    } catch {
      setPhase('failed');
      push({
        message: LIBRARY_MESSAGES.loadFailed,
        tone: 'error',
        testId: 'toast-libraries-load-failed',
      });
    } finally {
      setRefreshing(false);
    }
  }, [orgId, push]);

  useEffect(() => {
    void load();
  }, [load]);

  if (phase === 'gone') notFound();

  const failed = (message?: string): void => {
    push({ message: message ?? MESSAGES.generic, tone: 'error', testId: 'toast-library-error' });
  };

  async function saveCategory(): Promise<void> {
    if (!editing || busy) return;
    setBusy(true);
    try {
      const renaming = editing.id !== null;
      const response = await fetch(
        `/api/organizations/${orgId}/hiring/categories${renaming ? `/${editing.id}` : ''}`,
        {
          method: renaming ? 'PATCH' : 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: editing.name }),
        },
      );

      if (response.ok) {
        setEditing(null);
        setFieldError(null);
        await load();
        // Created is the one change this list cannot show — a new entry lands somewhere
        // in an alphabetical order, possibly off-screen. A rename changes its row in
        // front of the reader and gets no announcement (06 §Error Messages).
        if (!renaming) {
          push({
            message: LIBRARY_MESSAGES.toast.created,
            testId: 'toast-library-created',
          });
        }
        return;
      }

      const body = await response.json().catch(() => ({}));
      // A collision and a bad name are both about the one field, so both belong on it —
      // the message the server sends is the one shown, never a guess at it.
      if (body.error === 'duplicate_name') setFieldError(body.message);
      else if (body.error === 'validation') setFieldError(body.fields?.name ?? MESSAGES.generic);
      else failed(body.message);
    } catch {
      failed();
    } finally {
      setBusy(false);
    }
  }

  async function removeCategory(category: Category): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/hiring/categories/${category.id}`,
        { method: 'DELETE', credentials: 'same-origin' },
      );
      setDeletingCategory(null);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        failed(body.message);
      }
      await load();
    } catch {
      failed();
    } finally {
      setBusy(false);
    }
  }

  /**
   * Archive and restore apply immediately with a toast and no confirmation — both are
   * reversible, and a confirmation on a reversible action is a dialog nobody reads. The
   * toast is earned here as it is nowhere else on this screen: an archived criterion is
   * still on the page, looking almost exactly as it did, so the change needs saying.
   */
  async function setArchived(criterion: Criterion, isArchived: boolean): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/organizations/${orgId}/hiring/criteria/${criterion.id}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isArchived }),
      });
      if (!response.ok) {
        failed((await response.json().catch(() => ({}))).message);
      } else {
        push({
          message: isArchived
            ? CRITERION_MESSAGES.toast.archived
            : CRITERION_MESSAGES.toast.restored,
          testId: isArchived ? 'toast-criteria-archived' : 'toast-criteria-restored',
        });
      }
      await load();
    } catch {
      failed();
    } finally {
      setBusy(false);
    }
  }

  /**
   * Only ever reached for a criterion nobody has assessed, since the menu item is
   * disabled otherwise. The 409 is still handled: the count can change between the render
   * and the click, and answering it with the server's own message is better than a stale
   * menu row.
   */
  async function removeCriterion(criterion: Criterion): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/organizations/${orgId}/hiring/criteria/${criterion.id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      setDeletingCriterion(null);
      if (!response.ok) {
        failed((await response.json().catch(() => ({}))).message);
      }
      await load();
    } catch {
      failed();
    } finally {
      setBusy(false);
    }
  }

  const onCategories = tab === 'categories';
  const needle = query.trim().toLowerCase();
  const hit = (name: string): boolean => name.toLowerCase().includes(needle);
  const categoryRows = categories.filter((category) => hit(category.name));
  const criterionRows = criteria.filter((criterion) => hit(criterion.name));
  const rows = onCategories ? categoryRows.length : criterionRows.length;
  const total = onCategories ? categories.length : criteria.length;

  function categoryActions(category: Category) {
    return [
      {
        key: 'rename',
        label: 'Rename',
        testId: `category-rename-${category.id}`,
        onSelect: () => {
          setEditing({ id: category.id, name: category.name });
          setFieldError(null);
        },
      },
      {
        key: 'delete',
        label: 'Delete',
        danger: true,
        testId: `category-delete-${category.id}`,
        onSelect: () => setDeletingCategory(category),
      },
    ];
  }

  function criterionActions(criterion: Criterion) {
    // Deleting an assessed criterion would destroy every judgement recorded against it, so
    // it is disabled rather than hidden and archive is named as what to do instead — in a
    // bubble beside the menu, over a hidden copy that is the row's permanent
    // `aria-describedby` target, so a keyboard reaches it too (decisions §62).
    const blocked = criterion.assessmentCount > 0;
    return [
      {
        key: 'edit',
        label: 'Edit',
        testId: `criterion-edit-${criterion.id}`,
        onSelect: () => setCriterionDialog({ criterion }),
      },
      criterion.isArchived
        ? {
            key: 'restore',
            label: 'Restore',
            testId: `criterion-restore-${criterion.id}`,
            onSelect: () => void setArchived(criterion, false),
          }
        : {
            key: 'archive',
            label: 'Archive',
            testId: `criterion-archive-${criterion.id}`,
            onSelect: () => void setArchived(criterion, true),
          },
      {
        key: 'delete',
        label: 'Delete',
        danger: !blocked,
        disabled: blocked,
        tooltip: blocked
          ? criterionDeleteBlockedMessage(criterion.assessmentCount)
          : undefined,
        tooltipTestId: `criterion-delete-guard-${criterion.id}`,
        testId: `criterion-delete-${criterion.id}`,
        onSelect: () => setDeletingCriterion(criterion),
      },
    ];
  }

  return (
    <div data-testid="hiring-settings">
      {/*
        `Libraries`, on the route `/hiring/settings`. Nothing on this screen is a setting —
        it is two lists and their maintenance — so the title says what it is and the path
        stays where readers have already bookmarked it.
      */}
      <PageHeader title="Libraries" />

      {/*
        The tabs are drawn only once a response has arrived: a strip whose labels read
        `Categories (0)` and then jumped would be the flash the shell's `/api/me` gate
        exists to prevent, one screen further in.
      */}
      <TableToolbar
        tabs={
          phase === 'ready'
            ? [
                {
                  value: 'categories',
                  label: libraryTabLabel('categories', categories.length),
                  testId: 'libraries-tab-categories',
                },
                {
                  value: 'criteria',
                  label: libraryTabLabel('criteria', criteria.length),
                  testId: 'libraries-tab-criteria',
                },
              ]
            : undefined
        }
        activeTab={tab}
        onTab={(next) => {
          setTab(next as LibraryTab);
          // The term belonged to the library it was typed over; carrying it across
          // would open the other tab pre-narrowed by a search nobody made there.
          setSearch('');
          setQuery('');
        }}
        tabsLabel="Libraries"
        tabsTestId="libraries-tabs"
        search={search}
        onSearch={(event) => setSearch(event.target.value)}
        onClearSearch={() => {
          setSearch('');
          setQuery('');
        }}
        searchPlaceholder={onCategories ? 'Search categories…' : 'Search criteria…'}
        searchLabel={onCategories ? 'Search categories' : 'Search criteria'}
        searchTestId={onCategories ? 'categories-search-input' : 'criteria-search-input'}
      >
        {onCategories ? (
          <Button
            variant="primary"
            onClick={() => {
              setEditing({ id: null, name: '' });
              setFieldError(null);
            }}
            data-testid="category-new-button"
          >
            New category
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={() => setCriterionDialog({})}
            data-testid="criterion-new-button"
          >
            New criteria
          </Button>
        )}
      </TableToolbar>

      {phase === 'failed' ? (
        /*
          The toast said it; this is what stays. A toast leaves, and a library that could
          not be read must not leave a blank page behind it, so the failure is drawn where
          the rows would be, on the page's own ground, with the way back inside it (§65).
        */
        <LoadFailed
          message={LIBRARY_MESSAGES.loadFailed}
          retryLabel="Try again"
          onRetry={() => void load()}
          retryTestId="libraries-retry"
          data-testid="libraries-error"
        />
      ) : phase === 'loading' ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-7)' }}>
          {/* The dots carry no text, so the announcement is made beside them. */}
          <Preloader data-testid="libraries-loading" aria-hidden />
          <span aria-live="polite" style={VISUALLY_HIDDEN}>
            Loading libraries
          </span>
        </div>
      ) : rows === 0 ? (
        /*
          Two different sentences for two different facts: an empty library points at
          where its entries are actually created — inline creation is the primary path —
          while a search that matched nothing must not be allowed to claim the library
          is empty beside a button that would prove it wrong. Both stand on the page's own
          ground, as the candidate database's do: the card is the table's.
        */
        total === 0 ? (
          <EmptyState data-testid={onCategories ? 'categories-empty' : 'criteria-empty'}>
            {onCategories ? LIBRARY_MESSAGES.category.empty : CRITERION_MESSAGES.empty}
          </EmptyState>
        ) : (
          <EmptyState
            data-testid={onCategories ? 'categories-no-results' : 'criteria-no-results'}
          >
            {onCategories ? LIBRARY_MESSAGES.category.noResults : CRITERION_MESSAGES.noResults}
          </EmptyState>
        )
      ) : (
        /*
          The card is the table's and is drawn only around rows: it gives the edge-to-edge
          table its border and rounds its first and last rows. The row kebab opens inside
          it, but the DS `Popover` portals its menu (decisions §55), so nothing it raises is
          clipped by the surface it was opened from.
        */
        <Card padded={false} data-testid={onCategories ? 'categories-list' : 'criteria-list'}>
          {onCategories && (
            <Table<Category>
              rows={categoryRows}
              /* A refetch after an action dims the rows in place rather than replacing
                 them with a loader (decisions §34). */
              busy={refreshing}
              rowKey="id"
              rowTestId={(row) => `category-row-${row.id}`}
              columns={[
                {
                  label: 'Name',
                  render: (row) => (
                    <span data-testid={`category-name-${row.id}`} style={ELLIPSIS}>
                      {row.name}
                    </span>
                  ),
                },
                {
                  label: 'Vacancies',
                  flex: 3,
                  align: 'flex-start',
                  render: (row) => <VacanciesCell category={row} />,
                },
                {
                  label: 'Actions',
                  render: (row) => (
                    <Popover
                      label={libraryActionsLabel(row.name)}
                      data-testid={`category-actions-${row.id}`}
                      items={categoryActions(row)}
                    />
                  ),
                },
              ]}
            />
          )}

          {!onCategories && (
            <Table<Criterion>
              rows={criterionRows}
              busy={refreshing}
              rowKey="id"
              rowTestId={(row) => `criterion-row-${row.id}`}
              columns={[
                {
                  label: 'Name',
                  flex: 2.6,
                  render: (row) => <CriterionNameCell criterion={row} />,
                },
                {
                  // Plain text, like Role or Status in the system's own tables — a chip here
                  // would read as a label on the criterion rather than this column's
                  // value, and the words are the radio group's, so the row and the
                  // dialog call a type by one name.
                  label: 'Type',
                  align: 'flex-start',
                  render: (row) => (
                    <span data-testid={`criterion-type-${row.id}`} style={receded(row)}>
                      {CRITERION_TYPE_LABELS[row.type]}
                    </span>
                  ),
                },
                {
                  label: 'Assessments',
                  align: 'flex-start',
                  render: (row) => (
                    <span data-testid={`criterion-usage-${row.id}`} style={receded(row)}>
                      {criterionUsageLabel(row.assessmentCount)}
                    </span>
                  ),
                },
                {
                  label: 'Actions',
                  render: (row) => (
                    <Popover
                      label={libraryActionsLabel(row.name)}
                      data-testid={`criterion-actions-${row.id}`}
                      items={criterionActions(row)}
                    />
                  ),
                },
              ]}
            />
          )}

        </Card>
      )}

      {/* Stated rather than discovered: with uniqueness enforced and no merge in this
          release, a duplicate already in the library cannot be renamed away (06 §01.5). */}
      {onCategories && phase === 'ready' && (
        <p
          data-testid="categories-merge-note"
          style={{
            margin: 'var(--space-4) 0 0',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--text-secondary)',
          }}
        >
          {LIBRARY_MESSAGES.category.mergeUnavailable}
        </p>
      )}

      <CriterionDialog
        orgId={orgId}
        open={criterionDialog !== null}
        criterion={criterionDialog?.criterion}
        onClose={() => setCriterionDialog(null)}
        onSaved={() => {
          // The list is reloaded rather than patched: an edit can change the usage counts
          // on a scale's values, and this screen is the one that decides on them.
          const created = criterionDialog?.criterion === undefined;
          setCriterionDialog(null);
          void load();
          // An edit's row changes in front of the reader; a new entry may land off-screen.
          if (created) {
            push({
              message: LIBRARY_MESSAGES.toast.created,
              testId: 'toast-library-created',
            });
          }
        }}
      />

      <Modal
        open={editing !== null}
        title={editing?.id ? 'Rename category' : 'New category'}
        onClose={() => setEditing(null)}
        data-testid="category-dialog"
        style={{ width: 420 }}
      >
        <div style={{ display: 'grid', gap: 'var(--space-7)' }}>
          <TextInput
            label="Name"
            id="category-name-input"
            placeholder="React"
            autoFocus
            value={editing?.name ?? ''}
            onChange={(event) =>
              setEditing((prev) => (prev ? { ...prev, name: event.target.value } : prev))
            }
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              void saveCategory();
            }}
            error={fieldError ?? undefined}
            errorId="category-name-error"
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? 'category-name-error' : undefined}
            data-testid="category-name-input"
          />

          <FormActions align="full">
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => void saveCategory()}
              preloader={busy}
              data-testid="category-submit-button"
            >
              {editing?.id ? 'Save' : 'Create'}
            </Button>
          </FormActions>
        </div>
      </Modal>

      {/*
        Both deletes are `ConfirmDialog`s that stay up while the request runs (§41), the
        shape every row confirmation in the module settled on in Phase 7: the last point
        at which somebody can change their mind is not also the point the outcome stops
        being visible. The category dialog above them is a form, and stays a `Modal`.
      */}
      <ConfirmDialog
        open={deletingCategory !== null}
        title="Delete category?"
        description={
          <>
            {/* The count is interpolated because it is the whole reason to confirm. There
                is no undo, and the copy does not pretend otherwise. */}
            {deletingCategory
              ? categoryDeleteConfirmation(deletingCategory.name, deletingCategory.vacancyCount)
              : null}{' '}
            The vacancies themselves are untouched. This cannot be undone.
          </>
        }
        acceptBtnText="Delete"
        declineBtnText="Cancel"
        busy={busy}
        closeOnAccept={false}
        onAccept={() => {
          if (deletingCategory) void removeCategory(deletingCategory);
        }}
        onClose={() => setDeletingCategory(null)}
        acceptTestId="category-delete-confirm-button"
        data-testid="category-delete-confirm"
      />

      <ConfirmDialog
        open={deletingCriterion !== null}
        title="Delete criteria?"
        description={deletingCriterion ? criterionDeleteConfirmation(deletingCriterion.name) : ''}
        acceptBtnText="Delete"
        declineBtnText="Cancel"
        busy={busy}
        closeOnAccept={false}
        onAccept={() => {
          if (deletingCriterion) void removeCriterion(deletingCriterion);
        }}
        onClose={() => setDeletingCriterion(null)}
        acceptTestId="criterion-delete-confirm-button"
        data-testid="criterion-delete-confirm"
      />

    </div>
  );
}

/**
 * Whole titles, then a `+N` for the rest — the Members table's projects cell, one name
 * wider, because vacancy titles are long and a truncated one ("Full Stack Develop…")
 * names nothing. The count that makes the delete decision answerable is not painted at
 * all, so it lives in the cell's accessible name with every folded title spelled out.
 */
function VacanciesCell({ category }: { category: Category }) {
  return (
    <span
      data-testid={`category-usage-${category.id}`}
      aria-label={categoryUsageDescription(category.vacancyCount, category.vacancies)}
      style={{ display: 'flex', alignItems: 'center', minWidth: 0, width: '100%' }}
    >
      {category.vacancies.length === 0 ? (
        <span style={{ color: 'var(--text-secondary)' }}>No vacancies</span>
      ) : (
        <>
          <span style={ELLIPSIS}>{category.vacancies.slice(0, 2).join(', ')}</span>
          {category.vacancies.length > 2 && (
            // A 32px circle on an 8% black wash — the app's own overflow bubble.
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                width: 32,
                height: 32,
                marginLeft: 10,
                borderRadius: '50%',
                fontSize: 12,
                backgroundColor: 'rgba(0,0,0,0.08)',
              }}
            >
              +{category.vacancies.length - 2}
            </span>
          )}
        </>
      )}
    </span>
  );
}

/**
 * The name over its scale: a second line inside the title cell, the same shape the
 * vacancies list gives a title over its category chips.
 *
 * Joined by ›, never commas — the separator is what says the order carries meaning, and
 * the list around it is a real `<ol>` so the order is conveyed structurally too.
 */
function CriterionNameCell({ criterion }: { criterion: Criterion }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-1)',
        minWidth: 0,
        ...receded(criterion),
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}>
        <span data-testid={`criterion-name-${criterion.id}`} style={ELLIPSIS}>
          {criterion.name}
        </span>
        {criterion.isArchived && (
          // A state, not a classification — the two-valued kind the system's badge was measured
          // for, in the outlined form that belongs on a row already receded to .7.
          <Badge
            status="inactive"
            outlined
            data-testid={`criterion-archived-badge-${criterion.id}`}
          >
            {CRITERION_MESSAGES.archivedBadge}
          </Badge>
        )}
      </span>
      {criterion.type === 'scale' && criterion.values.length > 0 && (
        <ol
          data-testid={`criterion-values-${criterion.id}`}
          aria-label={`${criterion.name} values, worst to best`}
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            listStyle: 'none',
            margin: 0,
            padding: 0,
            fontSize: 'var(--font-size-xs)',
            color: 'var(--text-secondary)',
          }}
        >
          {criterion.values.map((value, index) => (
            <li key={value.id}>
              {index > 0 && <span aria-hidden="true">{SCALE_SEPARATOR}</span>}
              {value.label}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/**
 * Archived rows recede rather than disappear: their assessments are still real, and this
 * is the only screen that can bring one back. The dimming sits on each cell's content and
 * never touches the Actions cell — the badge naming the state is allowed to fade with its
 * row, but the menu holding the way back is not.
 */
const receded = (criterion: Criterion): { opacity: number } | undefined =>
  criterion.isArchived ? { opacity: 0.7 } : undefined;

const ELLIPSIS = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

/** Present to a screen reader, absent to everything else. */
const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
} as const;
