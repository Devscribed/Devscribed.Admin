'use client';

import { notFound } from 'next/navigation';
import { use, useCallback, useEffect, useState } from 'react';
import {
  CRITERION_MESSAGES,
  CRITERION_TYPE_LABELS,
  LIBRARY_MESSAGES,
  SCALE_SEPARATOR,
  categoryDeleteConfirmation,
  categoryUsageLabel,
  criterionDeleteBlockedMessage,
  criterionUsageLabel,
  MESSAGES,
} from '@devscribed/validation';
import {
  Badge,
  Button,
  Card,
  Chip,
  ConfirmDialog,
  FormActions,
  InfoBanner,
  Modal,
  Popover,
  Preloader,
  TextInput,
} from '@/ds';
import { PageHeader } from '@/layout/PageHeader';
import { CriterionDialog } from '@/hiring/CriterionDialog';
import type { Category, Criterion } from '@/hiring/types';
import { useMediaQuery } from '@/hiring/useMediaQuery';

type State =
  | { status: 'loading' }
  | { status: 'ready'; categories: Category[]; criteria: Criterion[] }
  | { status: 'gone' };

/** Below this the row's two buttons become one menu (06 design §Responsive). */
const NARROW = '(max-width: 767px)';

/** Absent id creates; present id renames. One dialog, because it is one field. */
type Editing = { id: string | null; name: string };

/**
 * One announcement, in the slot reversal 4 gave every screen: directly under the header the
 * action was taken from. The ids are the ones the suite already knows these by — they named
 * a `Toast` when there was one to name; what they identify now is this banner.
 */
type Notice = { message: string; variant: 'success' | 'error'; testId: string };

const failure = (message: string): Notice => ({
  message,
  variant: 'error',
  testId: 'library-error-banner',
});

/**
 * Hiring settings — the maintenance inline creation cannot do.
 *
 * Both libraries are created where they are needed: a category from the vacancy dialog,
 * a criterion from a candidate card mid-interview. Which is why both empty states point
 * there rather than at the buttons on this page. What lives here is renaming, archiving
 * and deleting, and the usage counts that make those decisions rather than guesses.
 *
 * Categories come first because they are the simpler of the two and the more frequently
 * touched. Criteria are the ones with structure, and the ones where the decision is
 * archive-versus-delete rather than delete-or-not — which is why their count is the more
 * load-bearing of the two.
 */
export default function HiringSettingsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  const [state, setState] = useState<State>({ status: 'loading' });
  const [editing, setEditing] = useState<Editing | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  /** Absent is closed; a present `criterion` edits, an absent one creates. */
  const [criterionDialog, setCriterionDialog] = useState<{ criterion?: Criterion } | null>(null);
  const narrow = useMediaQuery(NARROW);

  const load = useCallback(async (): Promise<void> => {
    const [categories, criteria] = await Promise.all([
      fetch(`/api/organizations/${orgId}/hiring/categories`, { credentials: 'same-origin' }),
      // Archived criteria included: this is the screen that restores them, and one that
      // could not show an archived criterion could not offer the way back (06 §03.19).
      fetch(`/api/organizations/${orgId}/hiring/criteria?includeArchived=true`, {
        credentials: 'same-origin',
      }),
    ]);

    // `user` and `viewer` never saw the sidebar row, so a direct navigation is the only
    // way to arrive here — and the honest answer to it is the not-found state.
    if ([categories.status, criteria.status].some((status) => status === 403 || status === 404)) {
      setState({ status: 'gone' });
      return;
    }
    if (!categories.ok || !criteria.ok) {
      setNotice(failure(MESSAGES.generic));
      return;
    }
    setState({
      status: 'ready',
      categories: (await categories.json()).categories,
      criteria: (await criteria.json()).criteria,
    });
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(): Promise<void> {
    if (!editing || busy) return;
    setBusy(true);
    setNotice(null);
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
        setNotice(
          renaming
            ? { message: LIBRARY_MESSAGES.toast.renamed, variant: 'success', testId: 'toast-library-renamed' }
            : { message: LIBRARY_MESSAGES.toast.created, variant: 'success', testId: 'toast-library-created' },
        );
        return;
      }

      const body = await response.json().catch(() => ({}));
      // A collision and a bad name are both about the one field, so both belong on it —
      // the message the server sends is the one shown, never a guess at it.
      if (body.error === 'duplicate_name') setFieldError(body.message);
      else if (body.error === 'validation') setFieldError(body.fields?.name ?? MESSAGES.generic);
      else setNotice(failure(body.message ?? MESSAGES.generic));
    } catch {
      setNotice(failure(MESSAGES.generic));
    } finally {
      setBusy(false);
    }
  }

  async function remove(category: Category): Promise<void> {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/hiring/categories/${category.id}`,
        { method: 'DELETE', credentials: 'same-origin' },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setNotice(failure(body.message ?? MESSAGES.generic));
      } else {
        setNotice({
          message: LIBRARY_MESSAGES.toast.deleted,
          variant: 'success',
          testId: 'toast-library-deleted',
        });
      }
      await load();
    } catch {
      setNotice(failure(MESSAGES.generic));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Archive and restore apply immediately with an announcement and no confirmation — both
   * are reversible, and a confirmation on a reversible action is a dialog nobody reads.
   */
  async function setArchived(criterion: Criterion, isArchived: boolean): Promise<void> {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/organizations/${orgId}/hiring/criteria/${criterion.id}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isArchived }),
      });
      if (!response.ok) {
        setNotice(failure((await response.json().catch(() => ({}))).message ?? MESSAGES.generic));
      } else {
        setNotice({
          message: isArchived ? CRITERION_MESSAGES.toast.archived : CRITERION_MESSAGES.toast.restored,
          variant: 'success',
          testId: isArchived ? 'toast-criteria-archived' : 'toast-criteria-restored',
        });
      }
      await load();
    } catch {
      setNotice(failure(MESSAGES.generic));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Only ever reached for a criterion nobody has assessed, since the control is disabled
   * otherwise. The 409 is still handled: the count can change between the render and the
   * click, and answering it with the server's own message is better than a stale button.
   */
  async function deleteCriterion(criterion: Criterion): Promise<void> {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/organizations/${orgId}/hiring/criteria/${criterion.id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (!response.ok) {
        setNotice(failure((await response.json().catch(() => ({}))).message ?? MESSAGES.generic));
      } else {
        setNotice({
          message: CRITERION_MESSAGES.toast.deleted,
          variant: 'success',
          testId: 'toast-criteria-deleted',
        });
      }
      await load();
    } catch {
      setNotice(failure(MESSAGES.generic));
    } finally {
      setBusy(false);
    }
  }

  if (state.status === 'gone') notFound();

  return (
    <div data-testid="hiring-settings">
      <PageHeader title="Hiring settings" />

      {/*
        Where a toast used to float. An announcement that outlives the moment it was raised
        has to have a place on the page, and the place is directly under the header the
        action was taken from — it pushes the page down rather than covering it, and it goes
        away when it is dismissed or when the next one replaces it. Nothing stacks and
        nothing auto-dismisses (reversal 4).
      */}
      {notice && (
        <div style={{ marginBottom: 'var(--space-7)' }}>
          <InfoBanner
            variant={notice.variant}
            role="status"
            aria-live="polite"
            onDismiss={() => setNotice(null)}
            data-testid={notice.testId}
          >
            {notice.message}
          </InfoBanner>
        </div>
      )}

      {/* `clip={false}`: the narrow layout's row menus drop their list into the card. */}
      <Card
        clip={false}
        title="Categories"
        action={
          <Button
            onClick={() => {
              setEditing({ id: null, name: '' });
              setFieldError(null);
            }}
            data-testid="category-new-button"
          >
            New category
          </Button>
        }
      >
        {state.status === 'loading' ? (
          <LibraryLoading label="Loading categories" />
        ) : state.categories.length === 0 ? (
          <p
            data-testid="categories-empty"
            style={{ margin: 0, fontSize: 'var(--font-size-s)', color: 'var(--text-secondary)' }}
          >
            {LIBRARY_MESSAGES.category.empty}
          </p>
        ) : (
          <ul
            data-testid="categories-list"
            style={{ listStyle: 'none', margin: 0, padding: 0 }}
          >
            {state.categories.map((category) => (
              <li
                key={category.id}
                data-testid={`category-row-${category.id}`}
                className="library-row"
              >
                <span
                  data-testid={`category-name-${category.id}`}
                  style={{ flex: 1, minWidth: 0, fontSize: 'var(--font-size-base)' }}
                >
                  {category.name}
                </span>
                {/* Immediately left of the actions, so the number and the decision it
                    governs are read together (06 design §Layout). */}
                <span
                  data-testid={`category-usage-${category.id}`}
                  style={{ fontSize: 'var(--font-size-s)', color: 'var(--text-secondary)' }}
                >
                  {categoryUsageLabel(category.vacancyCount)}
                </span>

                {narrow ? (
                  <Popover
                    label={`Actions for ${category.name}`}
                    items={[
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
                        onSelect: () => setDeleting(category),
                      },
                    ]}
                  />
                ) : (
                  <span style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    {/* Named with the entry and its usage, never a bare verb repeated
                        down the page — the archive-versus-delete decision has to be
                        available without sighted scanning (06 design §Accessibility). */}
                    <Button
                      aria-label={`Rename ${category.name}`}
                      onClick={() => {
                        setEditing({ id: category.id, name: category.name });
                        setFieldError(null);
                      }}
                      data-testid={`category-rename-${category.id}`}
                    >
                      Rename
                    </Button>
                    <Button
                      aria-label={`Delete ${category.name}, used by ${categoryUsageLabel(
                        category.vacancyCount,
                      )}`}
                      onClick={() => setDeleting(category)}
                      data-testid={`category-delete-${category.id}`}
                    >
                      Delete
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* Stated rather than discovered: with uniqueness enforced and no merge in this
            release, a duplicate already in the library cannot be renamed away (06 §01.5). */}
        <p
          data-testid="categories-merge-note"
          style={{
            margin: 'var(--space-6) 0 0',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--text-secondary)',
          }}
        >
          {LIBRARY_MESSAGES.category.mergeUnavailable}
        </p>
      </Card>

      <div style={{ marginTop: 'var(--space-7)' }}>
        <Card
          clip={false}
          title="Criteria"
          action={
            <Button onClick={() => setCriterionDialog({})} data-testid="criterion-new-button">
              New criteria
            </Button>
          }
        >
          {state.status === 'loading' ? (
            <LibraryLoading label="Loading criteria" />
          ) : state.criteria.length === 0 ? (
            <p
              data-testid="criteria-empty"
              style={{ margin: 0, fontSize: 'var(--font-size-s)', color: 'var(--text-secondary)' }}
            >
              {CRITERION_MESSAGES.empty}
            </p>
          ) : (
            <ul data-testid="criteria-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {state.criteria.map((criterion) => (
                <CriterionRow
                  key={criterion.id}
                  criterion={criterion}
                  narrow={narrow}
                  onEdit={() => setCriterionDialog({ criterion })}
                  onArchive={(isArchived) => void setArchived(criterion, isArchived)}
                  onDelete={() => void deleteCriterion(criterion)}
                />
              ))}
            </ul>
          )}
        </Card>
      </div>

      <CriterionDialog
        orgId={orgId}
        open={criterionDialog !== null}
        criterion={criterionDialog?.criterion}
        onClose={() => setCriterionDialog(null)}
        onSaved={() => {
          // The list is reloaded rather than patched: an edit can change the usage counts
          // on a scale's values, and this screen is the one that decides on them.
          const wasEditing = criterionDialog?.criterion !== undefined;
          setCriterionDialog(null);
          void load();
          setNotice({
            message: wasEditing ? CRITERION_MESSAGES.toast.updated : LIBRARY_MESSAGES.toast.created,
            variant: 'success',
            testId: wasEditing ? 'toast-criteria-updated' : 'toast-library-created',
          });
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
              void save();
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
              onClick={() => void save()}
              preloader={busy}
              data-testid="category-submit-button"
            >
              {editing?.id ? 'Save' : 'Create'}
            </Button>
          </FormActions>
        </div>
      </Modal>

      {/*
        A yes/no whose accept is the whole action, which is what blue's `ConfirmDialog` is
        for — the category dialog above it is a form, and stays a `Modal`. Blue paints the
        accept primary even here; a destructive confirmation says what it is in the title
        and the sentence, not in the button's fill.
      */}
      <ConfirmDialog
        open={deleting !== null}
        title="Delete category?"
        description={
          <>
            {/* The count is interpolated because it is the whole reason to confirm. There
                is no undo, and the copy does not pretend otherwise. */}
            {deleting ? categoryDeleteConfirmation(deleting.name, deleting.vacancyCount) : null}{' '}
            The vacancies themselves are untouched. This cannot be undone.
          </>
        }
        acceptBtnText="Delete"
        declineBtnText="Cancel"
        onAccept={() => {
          if (deleting) void remove(deleting);
        }}
        onClose={() => setDeleting(null)}
        acceptTestId="category-delete-confirm-button"
        data-testid="category-delete-confirm"
      />
    </div>
  );
}

/** The loader's dots say nothing; this is what says it beside them. */
function LibraryLoading({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-7)' }}>
      <Preloader aria-hidden />
      <span aria-live="polite" style={VISUALLY_HIDDEN}>
        {label}
      </span>
    </div>
  );
}

/**
 * One criterion: name, type and actions on the first line; the scale and the usage count
 * on the second.
 *
 * Two lines rather than one because a six-value scale and a count do not fit beside a
 * name without one of them being truncated — and the count is the thing this row exists
 * to make answerable, so it is never the one that goes.
 */
function CriterionRow({
  criterion,
  narrow,
  onEdit,
  onArchive,
  onDelete,
}: {
  criterion: Criterion;
  narrow: boolean;
  onEdit: () => void;
  onArchive: (isArchived: boolean) => void;
  onDelete: () => void;
}) {
  const usage = criterionUsageLabel(criterion.assessmentCount);
  // Deleting an assessed criterion would destroy every judgement recorded against it, so
  // it is disabled rather than hidden and archive is named as what to do instead.
  const deleteBlocked = criterion.assessmentCount > 0;
  const blockedReason = criterionDeleteBlockedMessage(criterion.assessmentCount);
  const archiveLabel = criterion.isArchived ? 'Restore' : 'Archive';
  const archiveTestId = criterion.isArchived
    ? `criterion-restore-${criterion.id}`
    : `criterion-archive-${criterion.id}`;

  return (
    <li
      data-testid={`criterion-row-${criterion.id}`}
      className="library-row criterion-row"
      // Archived rows recede rather than disappear: their assessments are still real, and
      // this is the only screen that can bring one back.
      style={criterion.isArchived ? { opacity: 0.7 } : undefined}
    >
      <div className="criterion-row-head">
        <span
          data-testid={`criterion-name-${criterion.id}`}
          style={{ fontSize: 'var(--font-size-base)', minWidth: 0 }}
        >
          {criterion.name}
        </span>
        {/* `Chip`, not `Badge` — blue's `Badge` is `ActivityBadge`, and a type is a
            classification rather than a state. The same split §20 made for a vacancy's
            categories, one screen along. */}
        <Chip
          label={CRITERION_TYPE_LABELS[criterion.type]}
          style={{ margin: 0 }}
          data-testid={`criterion-type-${criterion.id}`}
        />
        {criterion.isArchived && (
          // And this one *is* a state — the two-valued kind blue's badge was measured for,
          // in the outlined form that belongs on a row already receded to .7.
          <Badge
            status="inactive"
            outlined
            data-testid={`criterion-archived-badge-${criterion.id}`}
          >
            {CRITERION_MESSAGES.archivedBadge}
          </Badge>
        )}

        <span className="criterion-row-actions">
          {narrow ? (
            <Popover
              label={`Actions for ${criterion.name}`}
              items={[
                { key: 'edit', label: 'Edit', testId: `criterion-edit-${criterion.id}`, onSelect: onEdit },
                {
                  key: 'archive',
                  label: archiveLabel,
                  testId: archiveTestId,
                  onSelect: () => onArchive(!criterion.isArchived),
                },
                {
                  key: 'delete',
                  label: 'Delete',
                  danger: true,
                  disabled: deleteBlocked,
                  // Drawn in the row rather than left to a bubble, which no browser reaches
                  // from a keyboard — §22, and the answer Phase 3 gave reversal 2 on the
                  // vacancy's blocked delete. The wide layout answers it the other way, and
                  // the design spec says why.
                  description: deleteBlocked ? blockedReason : undefined,
                  descriptionTestId: `criterion-delete-guard-${criterion.id}`,
                  testId: `criterion-delete-${criterion.id}`,
                  onSelect: onDelete,
                },
              ]}
            />
          ) : (
            <>
              {/* Named with the entry and its count, never a bare verb repeated down the
                  page — the archive-versus-delete decision has to be available without
                  sighted scanning (06 design §Accessibility). */}
              <Button
                aria-label={`Edit ${criterion.name}`}
                onClick={onEdit}
                data-testid={`criterion-edit-${criterion.id}`}
              >
                Edit
              </Button>
              <Button
                aria-label={`${archiveLabel} ${criterion.name}, ${usage}`}
                onClick={() => onArchive(!criterion.isArchived)}
                data-testid={archiveTestId}
              >
                {archiveLabel}
              </Button>
              {/*
                Blocked, and saying so as its own name. `aria-disabled` rather than the
                `disabled` attribute, which would take the control out of the tab order and
                the reason with it — and no bubble, because the reason already *is* what a
                reader hears here, and the count it interpolates is drawn one line below on
                this same row. Reversal 2's third answer, with nothing lost to it.
              */}
              <Button
                aria-label={deleteBlocked ? blockedReason : `Delete ${criterion.name}, ${usage}`}
                aria-disabled={deleteBlocked || undefined}
                onClick={() => {
                  if (deleteBlocked) return;
                  onDelete();
                }}
                data-testid={`criterion-delete-${criterion.id}`}
                style={deleteBlocked ? { color: 'var(--text-secondary)', opacity: 0.6 } : undefined}
              >
                Delete
              </Button>
            </>
          )}
        </span>
      </div>

      <div className="criterion-row-meta">
        {criterion.type === 'scale' && (
          // An ordered list, so the order is structural and not only the › glyphs.
          <ol
            data-testid={`criterion-values-${criterion.id}`}
            style={{ display: 'flex', flexWrap: 'wrap', listStyle: 'none', margin: 0, padding: 0 }}
          >
            {criterion.values.map((value, index) => (
              <li key={value.id}>
                {index > 0 && <span aria-hidden="true">{SCALE_SEPARATOR}</span>}
                {value.label}
              </li>
            ))}
          </ol>
        )}
        <span data-testid={`criterion-usage-${criterion.id}`} style={{ marginLeft: 'auto' }}>
          {usage}
        </span>
      </div>
    </li>
  );
}

/** Present to a screen reader, absent to everything else. */
const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
} as const;
