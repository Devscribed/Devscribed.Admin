'use client';

import { notFound, useRouter, useSearchParams } from 'next/navigation';
import { use, useCallback, useEffect, useState } from 'react';
import { HIRING_MESSAGES, MESSAGES } from '@devscribed/validation';
import {
  Badge,
  Button,
  Card,
  Chip,
  FormActions,
  InfoBanner,
  Modal,
  Popover,
  Preloader,
} from '@/ds';
import { PageHeader } from '@/layout/PageHeader';
import { formatDuration } from '@/hiring/format';
import type { Vacancy } from '@/hiring/types';
import { VacancyDialog } from '../VacancyDialog';

type State = { status: 'loading' } | { status: 'ready'; vacancy: Vacancy } | { status: 'gone' };

/**
 * The ids are the ones the suite already knows these announcements by. They named a `Toast`
 * when there was one to name; what they identify now is the banner slot under the header.
 */
const NOTICE_TEST_IDS: Record<string, string> = {
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
 * indistinguishable from a bug, and the row carries the reason as its description.
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
        <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-7)' }}>
          <Preloader aria-hidden />
          <span
            aria-live="polite"
            style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}
          >
            Loading vacancy
          </span>
        </div>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <Button
              onClick={() => router.push(`/org/${orgId}/hiring/vacancies/${vacancyId}/board`)}
              data-testid="vacancy-board-link"
            >
              Board
            </Button>
            <Button onClick={() => setEditing(true)} data-testid="vacancy-edit-button">
              Edit
            </Button>
            <Popover
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
                  danger: true,
                  disabled: blocked,
                  // Drawn in the row rather than hidden in a `title`, which no browser
                  // reaches from a keyboard — see the design spec's Reversals note.
                  description: blocked ? HIRING_MESSAGES.vacancy.deleteBlocked : undefined,
                  descriptionTestId: 'vacancy-delete-guard-message',
                  onSelect: () => setConfirmingDelete(true),
                },
              ]}
            />
          </div>
        }
      />

      {/*
        Where a toast used to float. An announcement that outlives the moment it was raised has
        to have a place on the page, and the place is directly under the header the action was
        taken from — it pushes the page down rather than covering it, and it goes away when it
        is dismissed or when the next one replaces it.
      */}
      {notice && (
        <div style={{ marginBottom: 'var(--space-7)' }}>
          <InfoBanner
            variant={notice.tone === 'success' ? 'success' : 'error'}
            role="status"
            aria-live="polite"
            onDismiss={() => setNotice(null)}
            data-testid={NOTICE_TEST_IDS[notice.message] ?? 'toast-vacancy-error'}
          >
            {notice.message}
          </InfoBanner>
        </div>
      )}

      <div style={{ display: 'grid', gap: 'var(--space-7)' }}>
        <Card title="Booking link">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-6)' }}>
            <span
              data-testid="vacancy-booking-link"
              style={{
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontFamily: 'var(--font-family-base)',
                fontSize: 'var(--font-size-s)',
                color: 'var(--text-primary)',
              }}
            >
              {bookingUrl}
            </span>
            <Button onClick={copyLink} data-testid="vacancy-copy-link-button">
              Copy
            </Button>
          </div>
          {!open && (
            <p
              data-testid="vacancy-closed-link-note"
              style={{
                margin: 'var(--space-3) 0 0',
                fontSize: 'var(--font-size-xs)',
                color: 'var(--text-secondary)',
              }}
            >
              {HIRING_MESSAGES.vacancy.closedLinkNote}
            </p>
          )}
        </Card>

        {/* Categories and Description side by side, the categories column narrower —
            it holds chips, not prose (01 design §Layout — detail). */}
        <div className="vacancy-detail-columns">
          <Card title="Categories">
            <div
              data-testid="vacancy-detail-categories"
              style={{ display: 'flex', flexWrap: 'wrap' }}
            >
              {vacancy.categories.length === 0 ? (
                <span style={{ fontSize: 'var(--font-size-s)', color: 'var(--text-secondary)' }}>
                  No categories.
                </span>
              ) : (
                vacancy.categories.map((category) => (
                  <Chip
                    key={category.id}
                    label={category.name}
                    data-testid={`vacancy-category-chip-${category.id}`}
                  />
                ))
              )}
            </div>
          </Card>

          <Card title="Description">
            <p
              style={{
                margin: 0,
                whiteSpace: 'pre-wrap',
                fontSize: 'var(--font-size-base)',
                lineHeight: 'var(--line-height-base)',
                color: vacancy.description ? 'var(--text-tertiary)' : 'var(--text-secondary)',
              }}
            >
              {vacancy.description || 'No description.'}
            </p>
          </Card>
        </div>

        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-6)' }}>
            <Badge status={open ? 'active' : 'inactive'} data-testid={`vacancy-status-${vacancy.id}`}>
              {open ? 'Open' : 'Closed'}
            </Badge>
            <span
              data-testid="vacancy-detail-counts"
              style={{ fontSize: 'var(--font-size-s)', color: 'var(--text-tertiary)' }}
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

      {/*
        Still `Modal` rather than blue's `ConfirmDialog`: `ConfirmDialog` fires `onClose` in the
        same breath as `onAccept`, so a confirmation whose action is a request with a busy state
        cannot use it. Flagged for Phase 6, which owns that component.
      */}
      <Modal
        open={confirmingDelete}
        title="Delete vacancy?"
        onClose={() => setConfirmingDelete(false)}
        data-testid="vacancy-delete-confirm"
        style={{ width: 520 }}
      >
        <div style={{ display: 'grid', gap: 'var(--space-7)' }}>
          <p style={{ margin: 0, fontSize: 'var(--font-size-s)', color: 'var(--text-tertiary)' }}>
            {vacancy.title} will be removed. This cannot be undone.
          </p>
          <FormActions align="full">
            <Button onClick={() => setConfirmingDelete(false)}>Cancel</Button>
            <Button
              variant="delete"
              onClick={remove}
              preloader={busy}
              data-testid="vacancy-delete-confirm-button"
            >
              Delete vacancy
            </Button>
          </FormActions>
        </div>
      </Modal>
    </div>
  );
}
