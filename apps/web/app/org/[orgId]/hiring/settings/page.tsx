'use client';

import { notFound } from 'next/navigation';
import { use, useCallback, useEffect, useState } from 'react';
import {
  LIBRARY_MESSAGES,
  categoryDeleteConfirmation,
  categoryUsageLabel,
  MESSAGES,
} from '@devscribed/validation';
import { Button, Card, InfoBanner, Input, Menu, Modal, Skeleton, Toast } from '@/ds';
import { PageHeader } from '@/layout/PageHeader';
import type { Category } from '@/hiring/types';
import { useMediaQuery } from '@/hiring/useMediaQuery';

type State = { status: 'loading' } | { status: 'ready'; categories: Category[] } | { status: 'gone' };

/** Below this the row's two buttons become one menu (06 design §Responsive). */
const NARROW = '(max-width: 767px)';

/** Absent id creates; present id renames. One dialog, because it is one field. */
type Editing = { id: string | null; name: string };

type Notice = { message: string; tone: 'success' | 'error'; testId: string };

/**
 * Hiring settings — the maintenance inline creation cannot do.
 *
 * Categories are created from the vacancy dialog at the moment they are needed, which is
 * why the empty state points there rather than at the button on this page. What lives
 * here is renaming and deleting, and the usage count that makes the second one a
 * decision rather than a guess.
 *
 * The criteria library shares this screen and arrives with its own phase; the categories
 * card is first because it is the simpler of the two and the more frequently touched.
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
  const narrow = useMediaQuery(NARROW);

  const load = useCallback(async (): Promise<void> => {
    const response = await fetch(`/api/organizations/${orgId}/hiring/categories`, {
      credentials: 'same-origin',
    });
    // `user` and `viewer` never saw the sidebar row, so a direct navigation is the only
    // way to arrive here — and the honest answer to it is the not-found state.
    if (response.status === 403 || response.status === 404) {
      setState({ status: 'gone' });
      return;
    }
    if (!response.ok) {
      setBanner(MESSAGES.generic);
      return;
    }
    const body = await response.json();
    setState({ status: 'ready', categories: body.categories });
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
