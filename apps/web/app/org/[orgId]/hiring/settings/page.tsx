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
import { Badge, Button, Card, IconButton, InfoBanner, Input, Menu, Modal, Skeleton, Toast, Tooltip } from '@/ds';
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

type Notice = { message: string; tone: 'success' | 'error'; testId: string };

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
  const [banner, setBanner] = useState<string | null>(null);
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
      setBanner(MESSAGES.generic);
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
    setBanner(null);
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
            ? { message: LIBRARY_MESSAGES.toast.renamed, tone: 'success', testId: 'toast-library-renamed' }
            : { message: LIBRARY_MESSAGES.toast.created, tone: 'success', testId: 'toast-library-created' },
        );
        return;
      }

      const body = await response.json().catch(() => ({}));
      // A collision and a bad name are both about the one field, so both belong on it —
      // the message the server sends is the one shown, never a guess at it.
      if (body.error === 'duplicate_name') setFieldError(body.message);
      else if (body.error === 'validation') setFieldError(body.fields?.name ?? MESSAGES.generic);
      else setBanner(body.message ?? MESSAGES.generic);
    } catch {
      setBanner(MESSAGES.generic);
    } finally {
      setBusy(false);
    }
  }

  async function remove(): Promise<void> {
    if (!deleting || busy) return;
    setBusy(true);
    setBanner(null);
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/hiring/categories/${deleting.id}`,
        { method: 'DELETE', credentials: 'same-origin' },
      );
      setDeleting(null);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setBanner(body.message ?? MESSAGES.generic);
      } else {
        setNotice({
          message: LIBRARY_MESSAGES.toast.deleted,
          tone: 'success',
          testId: 'toast-library-deleted',
        });
      }
      await load();
    } catch {
      setBanner(MESSAGES.generic);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Archive and restore apply immediately with a toast and no confirmation — both are
   * reversible, and a confirmation on a reversible action is a dialog nobody reads.
   */
  async function setArchived(criterion: Criterion, isArchived: boolean): Promise<void> {
    if (busy) return;
    setBusy(true);
    setBanner(null);
    try {
      const response = await fetch(`/api/organizations/${orgId}/hiring/criteria/${criterion.id}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isArchived }),
      });
      if (!response.ok) {
        setBanner((await response.json().catch(() => ({}))).message ?? MESSAGES.generic);
      } else {
        setNotice({
          message: isArchived ? CRITERION_MESSAGES.toast.archived : CRITERION_MESSAGES.toast.restored,
          tone: 'success',
          testId: isArchived ? 'toast-criteria-archived' : 'toast-criteria-restored',
        });
      }
      await load();
    } catch {
      setBanner(MESSAGES.generic);
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
    setBanner(null);
    try {
      const response = await fetch(`/api/organizations/${orgId}/hiring/criteria/${criterion.id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (!response.ok) {
        setBanner((await response.json().catch(() => ({}))).message ?? MESSAGES.generic);
      } else {
        setNotice({
          message: CRITERION_MESSAGES.toast.deleted,
          tone: 'success',
          testId: 'toast-criteria-deleted',
        });
      }
      await load();
    } catch {
      setBanner(MESSAGES.generic);
    } finally {
      setBusy(false);
    }
  }

  if (state.status === 'gone') notFound();

  return (
    <div data-testid="hiring-settings">
      <PageHeader title="Hiring settings" />

      {banner && (
        <div style={{ marginBottom: 'var(--sp-10)' }}>
          <InfoBanner tone="error" data-testid="library-error-banner">
            {banner}
          </InfoBanner>
        </div>
      )}

      <Card
        title="Categories"
        action={
          <Button
            variant="secondary"
            size="sm"
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
          <Skeleton rows={3} height={22} />
        ) : state.categories.length === 0 ? (
          <p
            data-testid="categories-empty"
            style={{ margin: 0, fontSize: 'var(--fs-14)', color: 'var(--text-muted)' }}
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
                  style={{ flex: 1, minWidth: 0, fontSize: 'var(--fs-15)' }}
                >
                  {category.name}
                </span>
                {/* Immediately left of the actions, so the number and the decision it
                    governs are read together (06 design §Layout). */}
                <span
                  data-testid={`category-usage-${category.id}`}
                  style={{ fontSize: 'var(--fs-13)', color: 'var(--text-muted)' }}
                >
                  {categoryUsageLabel(category.vacancyCount)}
                </span>

                {narrow ? (
                  <Menu
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
                        tone: 'danger',
                        testId: `category-delete-${category.id}`,
                        onSelect: () => setDeleting(category),
                      },
                    ]}
                  />
                ) : (
                  <span style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                    {/* Named with the entry and its usage, never a bare verb repeated
                        down the page — the archive-versus-delete decision has to be
                        available without sighted scanning (06 design §Accessibility). */}
                    <Button
                      variant="ghost"
                      size="sm"
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
                      variant="ghost"
                      size="sm"
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
            margin: 'var(--sp-8) 0 0',
            fontSize: 'var(--fs-12)',
            color: 'var(--text-muted)',
          }}
        >
          {LIBRARY_MESSAGES.category.mergeUnavailable}
        </p>
      </Card>

      <div style={{ marginTop: 'var(--sp-10)' }}>
        <Card
          title="Criteria"
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setCriterionDialog({})}
              data-testid="criterion-new-button"
            >
              New criteria
            </Button>
          }
        >
          {state.status === 'loading' ? (
            <Skeleton rows={3} height={22} />
          ) : state.criteria.length === 0 ? (
            <p
              data-testid="criteria-empty"
              style={{ margin: 0, fontSize: 'var(--fs-14)', color: 'var(--text-muted)' }}
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
            tone: 'success',
            testId: wasEditing ? 'toast-criteria-updated' : 'toast-library-created',
          });
        }}
      />

      <Modal
        open={editing !== null}
        title={editing?.id ? 'Rename category' : 'New category'}
        onClose={() => setEditing(null)}
        width={420}
        data-testid="category-dialog"
        actions={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={save}
              loading={busy}
              data-testid="category-submit-button"
            >
              {editing?.id ? 'Save' : 'Create'}
            </Button>
          </>
        }
      >
        <Input
          label="Name"
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
          aria-invalid={fieldError ? true : undefined}
          data-testid="category-name-input"
        />
      </Modal>

      <Modal
        open={deleting !== null}
        title="Delete category?"
        onClose={() => setDeleting(null)}
        data-testid="category-delete-confirm"
        actions={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={remove}
              loading={busy}
              data-testid="category-delete-confirm-button"
            >
              Delete
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 'var(--fs-14)', color: 'var(--text-sub)' }}>
          {/* The count is interpolated because it is the whole reason to confirm. There
              is no undo, and the copy does not pretend otherwise. */}
          {deleting
            ? categoryDeleteConfirmation(deleting.name, deleting.vacancyCount)
            : null}{' '}
          The vacancies themselves are untouched. This cannot be undone.
        </p>
      </Modal>

      {notice && (
        <Toast tone={notice.tone} onDismiss={() => setNotice(null)} data-testid={notice.testId}>
          {notice.message}
        </Toast>
      )}
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
          style={{ fontSize: 'var(--fs-15)', minWidth: 0 }}
        >
          {criterion.name}
        </span>
        <Badge tone="neutral" dot={false} data-testid={`criterion-type-${criterion.id}`}>
          {CRITERION_TYPE_LABELS[criterion.type]}
        </Badge>
        {criterion.isArchived && (
          <Badge
            tone="neutral"
            outline
            data-testid={`criterion-archived-badge-${criterion.id}`}
          >
            {CRITERION_MESSAGES.archivedBadge}
          </Badge>
        )}

        <span className="criterion-row-actions">
          {narrow ? (
            <Menu
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
                  tone: 'danger',
                  disabled: deleteBlocked,
                  tooltip: deleteBlocked
                    ? criterionDeleteBlockedMessage(criterion.assessmentCount)
                    : undefined,
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
                variant="ghost"
                size="sm"
                aria-label={`Edit ${criterion.name}`}
                onClick={onEdit}
                data-testid={`criterion-edit-${criterion.id}`}
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`${archiveLabel} ${criterion.name}, ${usage}`}
                onClick={() => onArchive(!criterion.isArchived)}
                data-testid={archiveTestId}
              >
                {archiveLabel}
              </Button>
              <DeleteAction
                criterion={criterion}
                blocked={deleteBlocked}
                usage={usage}
                onDelete={onDelete}
              />
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

/**
 * Delete, disabled once the criterion has been assessed.
 *
 * `aria-disabled` and a live tooltip rather than the `disabled` attribute, which would
 * take the control out of the tab order and the reason with it.
 */
function DeleteAction({
  criterion,
  blocked,
  usage,
  onDelete,
}: {
  criterion: Criterion;
  blocked: boolean;
  usage: string;
  onDelete: () => void;
}) {
  const reason = blocked ? criterionDeleteBlockedMessage(criterion.assessmentCount) : undefined;

  return (
    <Tooltip content={reason}>
      {(tooltipId: string) => (
        <Button
          variant="ghost"
          size="sm"
          aria-label={blocked ? reason : `Delete ${criterion.name}, ${usage}`}
          aria-disabled={blocked || undefined}
          aria-describedby={blocked ? tooltipId : undefined}
          onClick={() => {
            if (blocked) return;
            onDelete();
          }}
          data-testid={`criterion-delete-${criterion.id}`}
          style={blocked ? { color: 'var(--text-faint)' } : undefined}
        >
          Delete
        </Button>
      )}
    </Tooltip>
  );
}
