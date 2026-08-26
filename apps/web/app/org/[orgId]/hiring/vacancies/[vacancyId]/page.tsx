'use client';

import { notFound, useRouter, useSearchParams } from 'next/navigation';
import { use, useCallback, useEffect, useState } from 'react';
import { HIRING_MESSAGES, MESSAGES } from '@devscribed/validation';
import { Badge, Button, Card, Menu, Modal, SectionLabel, Skeleton, Toast } from '@/ds';
import { PageHeader } from '@/layout/PageHeader';
import { formatDuration } from '@/hiring/format';
import type { Vacancy } from '@/hiring/types';
import { VacancyDialog } from '../VacancyDialog';

type State = { status: 'loading' } | { status: 'ready'; vacancy: Vacancy } | { status: 'gone' };

const TOAST_TEST_IDS: Record<string, string> = {
  [HIRING_MESSAGES.toast.vacancyCreated]: 'toast-vacancy-created',
  [HIRING_MESSAGES.toast.vacancyUpdated]: 'toast-vacancy-updated',
  [HIRING_MESSAGES.toast.vacancyClosed]: 'toast-vacancy-closed',
  [HIRING_MESSAGES.toast.vacancyReopened]: 'toast-vacancy-reopened',
  [HIRING_MESSAGES.toast.linkCopied]: 'toast-link-copied',
};

type Notice = { message: string; tone: 'success' | 'error' };

/**
 * The vacancy detail page. The booking link is first because copying it is the reason
 * to visit.
 *
 * Closing changes nothing but whether the link accepts bookings (01 §03.9), so the link
 * stays on the page for a closed vacancy — carrying a note rather than disappearing.
 * Delete is disabled rather than hidden once there are candidates: a missing action is
 * indistinguishable from a bug, and the tooltip carries the reason.
 */
export default function VacancyDetailPage({
  params,
}: {
  params: Promise<{ orgId: string; vacancyId: string }>;
}) {
  const { orgId, vacancyId } = use(params);
  const router = useRouter();
  const search = useSearchParams();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [notice, setNotice] = useState<Notice | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  // Raised here rather than on the list, so it survives the navigation that follows a
  // successful create.
  useEffect(() => {
    if (search.get('created') === '1') {
      setNotice({ message: HIRING_MESSAGES.toast.vacancyCreated, tone: 'success' });
    }
  }, [search]);

  const load = useCallback(async (): Promise<Vacancy | null> => {
    const response = await fetch(`/api/organizations/${orgId}/hiring/vacancies/${vacancyId}`, {
      credentials: 'same-origin',
    });
    if (response.status === 403 || response.status === 404) {
      setState({ status: 'gone' });
      return null;
    }
    if (!response.ok) return null;
    const vacancy: Vacancy = await response.json();
    setState({ status: 'ready', vacancy });
    return vacancy;
  }, [orgId, vacancyId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Close and reopen are the same write with a different value (01 §03.8). */
  async function setStatus(next: 'open' | 'closed'): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/organizations/${orgId}/hiring/vacancies/${vacancyId}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!response.ok) {
        setNotice({ message: MESSAGES.generic, tone: 'error' });
        return;
      }
      // Refetched rather than patched in place — no optimistic updates on this screen.
      await load();
      setNotice({
        message:
          next === 'closed'
            ? HIRING_MESSAGES.toast.vacancyClosed
            : HIRING_MESSAGES.toast.vacancyReopened,
        tone: 'success',
      });
    } catch {
      setNotice({ message: MESSAGES.generic, tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function remove(): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/organizations/${orgId}/hiring/vacancies/${vacancyId}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (response.ok) {
        router.push(`/org/${orgId}/hiring/vacancies`);
        return;
      }
      // Reachable only by a race — the action is disabled once there are candidates —
      // so the server's reason is what gets shown, not a guess at it.
      const body = await response.json().catch(() => ({}));
      setConfirmingDelete(false);
      setNotice({ message: body.message ?? MESSAGES.generic, tone: 'error' });
      await load();
    } catch {
      setNotice({ message: MESSAGES.generic, tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  if (state.status === 'gone') notFound();

  if (state.status === 'loading') {
    return (
      <Card>
        <Skeleton rows={4} height={22} />
      </Card>
    );
  }

  const { vacancy } = state;
  const open = vacancy.status === 'open';
  const blocked = vacancy.applicationCount > 0;
  const bookingUrl =
    typeof window === 'undefined' ? '' : `${window.location.origin}/book/${vacancy.publicSlug}`;

  async function copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(bookingUrl);
      setNotice({ message: HIRING_MESSAGES.toast.linkCopied, tone: 'success' });
    } catch {
      // The action never silently fails: if the clipboard is unavailable, the link
      // text is selected so it can be copied by hand.
      const node = document.querySelector('[data-testid="vacancy-booking-link"]');
      if (node) {
        const range = document.createRange();
        range.selectNodeContents(node);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }
  }

  return (
    <div data-testid="vacancy-detail">
      <PageHeader
        title={vacancy.title}
        subtitle={`${open ? 'Open' : 'Closed'} · ${formatDuration(
          vacancy.durationMinutes,
        )} · ${vacancy.interviewer.fullName}`}
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
            <Button
              variant="secondary"
              onClick={() => router.push(`/org/${orgId}/hiring/vacancies/${vacancyId}/board`)}
              data-testid="vacancy-board-link"
            >
              Board
            </Button>
            <Button variant="secondary" onClick={() => setEditing(true)} data-testid="vacancy-edit-button">
              Edit
            </Button>
            <Menu
              label="Vacancy actions"
              data-testid="vacancy-actions-menu"
              items={[
                open
                  ? {
                      key: 'close',
                      label: 'Close vacancy',
                      testId: 'vacancy-action-close',
                      onSelect: () => void setStatus('closed'),
                    }
                  : {
                      key: 'reopen',
                      label: 'Reopen vacancy',
                      testId: 'vacancy-action-reopen',
                      onSelect: () => void setStatus('open'),
                    },
                {
                  key: 'delete',
                  label: 'Delete vacancy',
                  testId: 'vacancy-action-delete',
                  tone: 'danger',
                  disabled: blocked,
                  tooltip: HIRING_MESSAGES.vacancy.deleteBlocked,
                  tooltipTestId: 'vacancy-delete-guard-message',
                  onSelect: () => setConfirmingDelete(true),
                },
              ]}
            />
          </div>
        }
      />

      <div style={{ display: 'grid', gap: 'var(--sp-10)' }}>
        <Card>
          <SectionLabel>Booking link</SectionLabel>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--sp-8)',
              marginTop: 'var(--sp-4)',
            }}
          >
            <span
              data-testid="vacancy-booking-link"
              style={{
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--fs-14)',
                color: 'var(--text)',
              }}
            >
              {bookingUrl}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={copyLink}
              data-testid="vacancy-copy-link-button"
            >
              Copy
            </Button>
          </div>
          {!open && (
            <p
              data-testid="vacancy-closed-link-note"
              style={{ margin: 'var(--sp-4) 0 0', fontSize: 'var(--fs-12)', color: 'var(--text-muted)' }}
            >
              {HIRING_MESSAGES.vacancy.closedLinkNote}
            </p>
          )}
        </Card>

        {/* Categories and Description side by side, the categories column narrower —
            it holds chips, not prose (01 design §Layout — detail). */}
        <div className="vacancy-detail-columns">
          <Card>
            <SectionLabel>Categories</SectionLabel>
            <div
              data-testid="vacancy-detail-categories"
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 'var(--sp-2)',
                marginTop: 'var(--sp-4)',
              }}
            >
              {vacancy.categories.length === 0 ? (
                <span style={{ fontSize: 'var(--fs-14)', color: 'var(--text-muted)' }}>
                  No categories.
                </span>
              ) : (
                vacancy.categories.map((category) => (
                  <Badge
                    key={category.id}
                    tone="neutral"
                    dot={false}
                    data-testid={`vacancy-category-chip-${category.id}`}
                  >
                    {category.name}
                  </Badge>
                ))
              )}
            </div>
          </Card>

          <Card>
            <SectionLabel>Description</SectionLabel>
            <p
              style={{
                margin: 'var(--sp-4) 0 0',
                whiteSpace: 'pre-wrap',
                fontSize: 'var(--fs-15)',
                lineHeight: 'var(--lh-normal)',
                color: vacancy.description ? 'var(--text-sub)' : 'var(--text-muted)',
              }}
            >
              {vacancy.description || 'No description.'}
            </p>
          </Card>
        </div>

        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-8)' }}>
            <Badge
              tone={open ? 'active' : 'inactive'}
              data-testid={`vacancy-status-${vacancy.id}`}
            >
              {open ? 'Open' : 'Closed'}
            </Badge>
            <span
              data-testid="vacancy-detail-counts"
              style={{ fontSize: 'var(--fs-14)', color: 'var(--text-sub)' }}
            >
              {vacancy.applicationCount} candidates · {vacancy.scheduledCount} scheduled
            </span>
          </div>
        </Card>
      </div>

      <VacancyDialog
        orgId={orgId}
        open={editing}
        vacancy={vacancy}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          void load();
          setNotice({ message: HIRING_MESSAGES.toast.vacancyUpdated, tone: 'success' });
        }}
      />

      <Modal
        open={confirmingDelete}
        title="Delete vacancy?"
        onClose={() => setConfirmingDelete(false)}
        data-testid="vacancy-delete-confirm"
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={remove}
              loading={busy}
              data-testid="vacancy-delete-confirm-button"
            >
              Delete vacancy
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 'var(--fs-14)', color: 'var(--text-sub)' }}>
          {vacancy.title} will be removed. This cannot be undone.
        </p>
      </Modal>

      {notice && (
        <Toast
          tone={notice.tone}
          onDismiss={() => setNotice(null)}
          data-testid={TOAST_TEST_IDS[notice.message] ?? 'toast-vacancy-error'}
        >
          {notice.message}
        </Toast>
      )}
    </div>
  );
}
