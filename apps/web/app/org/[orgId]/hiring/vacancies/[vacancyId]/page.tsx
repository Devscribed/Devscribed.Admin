'use client';

import { notFound, useRouter, useSearchParams } from 'next/navigation';
import { use, useCallback, useEffect, useRef, useState } from 'react';
import {
  HIRING_MESSAGES,
  MESSAGES,
  clipboardUnavailableLink,
  vacancyCloseConfirmation,
  vacancyDeleteConfirmation,
} from '@devscribed/validation';
import {
  BackTo,
  Badge,
  Button,
  ConfirmDialog,
  PageTitle,
  Popover,
  Preloader,
  ToastHost,
} from '@devscribed/ds';
import { rememberCandidateOrigin } from '@/hiring/candidate-origin';
import { LoadFailed } from '@/hiring/LoadFailed';
import { useToasts } from '@/hiring/useToasts';
import { VacancyStatusBadge } from '@/hiring/StatusBadge';
import type { Board, Vacancy } from '@/hiring/types';
import { VacancyDialog } from '../VacancyDialog';
import { VacancyBoard, type BoardState } from './VacancyBoard';

type State =
  | { status: 'loading' }
  | { status: 'ready'; vacancy: Vacancy }
  | { status: 'error' }
  | { status: 'gone' };

/** Which of the two confirmations is up. */
type Pending = 'close' | 'delete';

/** The clamp, in lines, and the share of the screen an expanded description may take. */
const DESCRIPTION_LINES = 3;
const DESCRIPTION_SHARE = 0.2;
/** Floor and ceiling on that share, so it is a fifth of a *reasonable* page (01 §08.29). */
const DESCRIPTION_MIN = 66;
const DESCRIPTION_MAX = 132;

/**
 * The vacancy: a header over its own board.
 *
 * **Two routes became one screen** (01 §08.27). The board was never a sibling of this page
 * — it is what this page is *for*, and the split cost a navigation to answer "who has
 * applied?", which is the first question anybody opening a vacancy has. So the four cards
 * that used to fill this screen are dissolved into the header above it: the booking link
 * became the button that copies it, the categories and the interviewer and the length
 * became one meta line, the status became a badge beside the title, and the counts became
 * the numbers the board's own columns already carry. What is left is a header worth about
 * a fifth of the page, and the board with the rest.
 *
 * **The screen owns the viewport height.** `AppShell`'s content box has a definite height,
 * so this one takes it: the header does not scroll, and the columns scroll inside what is
 * left. That is what makes the description's clamp load-bearing rather than cosmetic — an
 * unbounded description would push the board off the bottom of a screen that cannot scroll
 * to reach it.
 *
 * **Two requests, drawn as they arrive.** The vacancy and the board are separate endpoints
 * with separate guards, and the header does not wait on the board: the title, the link and
 * the menu are usable while the columns are still loading, which is the whole point of not
 * having made this a second page.
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
  const [boardState, setBoardState] = useState<BoardState>({ status: 'loading' });
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const { toasts, push, dismiss } = useToasts();

  /**
   * Raised here rather than on the list, so it survives the navigation that follows a
   * successful create — and raised **once**, which a toast has to be explicit about in a
   * way the banner it replaced did not.
   *
   * A banner was a single slot: setting it twice showed it once. A queue appends, so the
   * same effect running twice — a re-render, a remount, React's development double-invoke
   * — is two lines saying the same thing. So the flag is consumed: the ref makes it once
   * per mount, and stripping the query makes it once per arrival, rather than again on
   * every reload of an address somebody kept.
   */
  const announcedCreate = useRef(false);
  useEffect(() => {
    if (search.get('created') !== '1' || announcedCreate.current) return;
    announcedCreate.current = true;
    push({
      message: HIRING_MESSAGES.toast.vacancyCreated,
      testId: 'toast-vacancy-created',
    });
    router.replace(`/org/${orgId}/hiring/vacancies/${vacancyId}`);
  }, [search, push, router, orgId, vacancyId]);

  /**
   * A card opened from a column comes back here, and the link says `Board` (04 §01.8).
   *
   * Recorded from the screen rather than from `BoardCard`'s own `href`, for the reason the
   * candidate list records it from the screen too: there is one place a member can be, and
   * counting the ways out of it is how one of them gets missed.
   */
  useEffect(() => {
    rememberCandidateOrigin(orgId, {
      label: HIRING_MESSAGES.card.backToBoard,
      href: `/org/${orgId}/hiring/vacancies/${vacancyId}`,
    });
  }, [orgId, vacancyId]);

  const load = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(`/api/organizations/${orgId}/hiring/vacancies/${vacancyId}`, {
        credentials: 'same-origin',
      });
      if (response.status === 403 || response.status === 404) {
        setState({ status: 'gone' });
        return;
      }
      if (!response.ok) {
        setState({ status: 'error' });
        push({ message: MESSAGES.generic, tone: 'error', testId: 'toast-vacancy-load-failed' });
        return;
      }
      setState({ status: 'ready', vacancy: await response.json() });
    } catch {
      setState({ status: 'error' });
      push({ message: MESSAGES.generic, tone: 'error', testId: 'toast-vacancy-load-failed' });
    }
  }, [orgId, vacancyId, push]);

  const loadBoard = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/hiring/vacancies/${vacancyId}/board`,
        { credentials: 'same-origin' },
      );
      // 403 for a role with no board access, 404 for a vacancy this caller may not see.
      // Both are the same dead end from here, and which of the two it is, is precisely
      // what the API declines to say (05 §API). The vacancy request answers the same
      // question one line above, so this only has to agree with it.
      if (response.status === 403 || response.status === 404) {
        setBoardState({ status: 'gone' });
        setState({ status: 'gone' });
        return;
      }
      if (!response.ok) {
        setBoardState({ status: 'error' });
        push({ message: MESSAGES.generic, tone: 'error', testId: 'toast-board-load-failed' });
        return;
      }
      const board: Board = await response.json();
      setBoardState({ status: 'ready', board });
    } catch {
      // Announced here, where the request is owned; the board draws what stays behind
      // once the toast has gone — the failure in the region's place, with its retry.
      setBoardState({ status: 'error' });
      push({ message: MESSAGES.generic, tone: 'error', testId: 'toast-board-load-failed' });
    }
  }, [orgId, vacancyId, push]);

  useEffect(() => {
    void load();
    void loadBoard();
  }, [load, loadBoard]);

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
        push({ message: MESSAGES.generic, tone: 'error', testId: 'toast-vacancy-error' });
        return;
      }
      setPending(null);
      // Refetched rather than patched in place — no optimistic updates on this screen.
      await load();
      push({
        message:
          next === 'closed'
            ? HIRING_MESSAGES.toast.vacancyClosed
            : HIRING_MESSAGES.toast.vacancyReopened,
        testId: next === 'closed' ? 'toast-vacancy-closed' : 'toast-vacancy-reopened',
      });
    } catch {
      push({ message: MESSAGES.generic, tone: 'error', testId: 'toast-vacancy-error' });
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
      setPending(null);
      push({
        message: body.message ?? MESSAGES.generic,
        tone: 'error',
        testId: 'toast-vacancy-error',
      });
      await load();
    } catch {
      push({ message: MESSAGES.generic, tone: 'error', testId: 'toast-vacancy-error' });
    } finally {
      setBusy(false);
    }
  }

  if (state.status === 'gone') notFound();

  if (state.status === 'loading') {
    // On the page's own ground, as every hiring screen's first load is: a bordered white
    // box holding three dots is a surface drawn around nothing.
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-7)' }}>
        <Preloader data-testid="vacancy-loading" aria-hidden />
        <span
          aria-live="polite"
          style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}
        >
          Loading vacancy
        </span>
      </div>
    );
  }

  if (state.status === 'error') {
    // The toast said it; this is what stays, with the way back inside it (§65). The host
    // is mounted on this state too — the failure was raised into it a moment ago.
    return (
      <>
        <LoadFailed
          message={MESSAGES.generic}
          retryLabel={HIRING_MESSAGES.card.retry}
          onRetry={() => void load()}
          retryTestId="vacancy-load-retry"
          data-testid="vacancy-load-error"
        />
        <ToastHost toasts={toasts} onDismiss={dismiss} />
      </>
    );
  }

  const { vacancy } = state;
  const open = vacancy.status === 'open';
  // The server's own rule, not the count beside it: a vacancy whose only applicants have
  // been deleted shows no candidates and is still not deletable, because their
  // applications and every assessment on them are still there (01 §03.11).
  const blocked = !vacancy.deletable;
  const listHref = `/org/${orgId}/hiring/vacancies`;

  /**
   * The link is built here rather than drawn on the page. It was a field with a Copy
   * button beside it and is now a button alone (01 §08.28) — a 60-character opaque slug
   * is not something anybody reads, and the board needs the room. That costs the one
   * fallback the field gave a refused clipboard, so the message carries the link instead.
   */
  /** The candidate's own view of this vacancy — the address `copyLink` copies. */
  const bookingUrl = (): string => `${window.location.origin}/book/${vacancy.publicSlug}`;

  async function copyLink(): Promise<void> {
    const url = bookingUrl();
    try {
      await navigator.clipboard.writeText(url);
      push({
        message: HIRING_MESSAGES.toast.linkCopied,
        testId: 'toast-link-copied',
      });
    } catch {
      push({
        message: clipboardUnavailableLink(url),
        tone: 'error',
        testId: 'toast-link-copy-failed',
      });
    }
  }

  return (
    <div data-testid="vacancy-detail" className="vacancy-screen">
      <div className="vacancy-screen-header">
        {/*
          A real anchor, so middle-click and copy-address work; an unmodified click is
          handed to the client router (§56, and §18's rule on `Table`'s rows).
        */}
        <BackTo
          label="Vacancies"
          href={listHref}
          data-testid="vacancy-back-link"
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey) return;
            event.preventDefault();
            router.push(listHref);
          }}
        />

        <div className="vacancy-screen-title">
          <div className="vacancy-screen-heading">
            <span>
              <PageTitle data-testid="page-title">{vacancy.title}</PageTitle>
            </span>
            <VacancyStatusBadge
              status={vacancy.status}
              testId={`vacancy-status-${vacancy.id}`}
            />
          </div>

          <div className="vacancy-screen-actions">
            {/*
              Disabled on a closed vacancy, exactly as the list's menu row is (01 §07.23):
              the link accepts nothing, and the note below says so in a sentence rather
              than leaving the button to be pressed and to appear to work.
            */}
            <Button
              variant="primary"
              disabled={!open}
              onClick={copyLink}
              data-testid="vacancy-copy-link-button"
            >
              {HIRING_MESSAGES.vacancy.actions.copyLink}
            </Button>
            <Popover
              label="Vacancy actions"
              data-testid="vacancy-actions-menu"
              items={[
                {
                  /*
                    The same row the list's menu carries, and the same reasoning: it is not
                    disabled on a closed vacancy, because the page still exists and explains
                    itself (02 §02.6). `Open board` is the one row this menu does not take —
                    the board is on this page, under this header.
                  */
                  key: 'booking-page',
                  label: HIRING_MESSAGES.vacancy.actions.openBookingPage,
                  testId: 'vacancy-action-open-booking',
                  onSelect: () => window.open(bookingUrl(), '_blank', 'noopener,noreferrer'),
                },
                {
                  key: 'edit',
                  label: HIRING_MESSAGES.vacancy.actions.edit,
                  testId: 'vacancy-action-edit',
                  onSelect: () => setEditing(true),
                },
                open
                  ? {
                      key: 'close',
                      label: HIRING_MESSAGES.vacancy.actions.close,
                      testId: 'vacancy-action-close',
                      onSelect: () => setPending('close'),
                    }
                  : {
                      key: 'reopen',
                      label: HIRING_MESSAGES.vacancy.actions.reopen,
                      testId: 'vacancy-action-reopen',
                      // Reopening confirms nothing: it takes nothing away, and the action
                      // that undoes it is one row up in the same menu.
                      onSelect: () => void setStatus('open'),
                    },
                {
                  key: 'delete',
                  label: HIRING_MESSAGES.vacancy.actions.delete,
                  testId: 'vacancy-action-delete',
                  danger: !blocked,
                  disabled: blocked,
                  // In a bubble beside the menu, not a third line inside a 160px panel —
                  // and never a native `title` (decisions §62).
                  tooltip: blocked ? HIRING_MESSAGES.vacancy.deleteBlocked : undefined,
                  tooltipTestId: 'vacancy-delete-guard-message',
                  onSelect: () => setPending('delete'),
                },
              ]}
            />
          </div>
        </div>

        <VacancyMeta
          vacancy={vacancy}
          viewerTimeZone={boardState.status === 'ready' ? boardState.board.viewerTimeZone : null}
        />

        {!open && (
          <p data-testid="vacancy-closed-link-note" className="vacancy-screen-note">
            {HIRING_MESSAGES.vacancy.closedBoardNote}
          </p>
        )}

        <VacancyDescription
          description={vacancy.description}
          onAdd={() => setEditing(true)}
        />
      </div>

      <div className="vacancy-screen-board">
        <VacancyBoard
          orgId={orgId}
          state={boardState}
          setState={setBoardState}
          reload={loadBoard}
          push={push}
        />
      </div>

      <VacancyDialog
        orgId={orgId}
        open={editing}
        vacancy={vacancy}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          void load();
          push({
            message: HIRING_MESSAGES.toast.vacancyUpdated,
            testId: 'toast-vacancy-updated',
          });
        }}
      />

      {/*
        The system's own `ConfirmDialog` with `closeOnAccept={false}` (decisions §41), the same pair
        the list raises. This screen had been holding a hand-built `Modal` because that
        prop did not exist when it was written; it does, and one confirmation is one
        component.
      */}
      <ConfirmDialog
        open={pending === 'close'}
        title={HIRING_MESSAGES.vacancy.closeTitle}
        description={vacancyCloseConfirmation(vacancy.scheduledCount)}
        acceptBtnText={HIRING_MESSAGES.vacancy.actions.close}
        declineBtnText="Cancel"
        busy={busy}
        closeOnAccept={false}
        onClose={() => setPending(null)}
        onAccept={() => void setStatus('closed')}
        data-testid="vacancy-close-confirm"
        acceptTestId="vacancy-close-confirm-button"
      />

      <ConfirmDialog
        open={pending === 'delete'}
        title={HIRING_MESSAGES.vacancy.deleteTitle}
        description={vacancyDeleteConfirmation(vacancy.title)}
        acceptBtnText={HIRING_MESSAGES.vacancy.actions.delete}
        declineBtnText="Cancel"
        busy={busy}
        closeOnAccept={false}
        onClose={() => setPending(null)}
        onAccept={() => void remove()}
        data-testid="vacancy-delete-confirm"
        acceptTestId="vacancy-delete-confirm-button"
      />

      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

/**
 * `React · Senior · Pat Owner · 60 min · times in Europe/Berlin` — the four cards this
 * header replaced, in one line (01 §08.28).
 *
 * The zone is last and arrives with the board, because the board is what needs it: 05 §05
 * says it is named once in the header and never on a card, and the header is here now.
 */
function VacancyMeta({
  vacancy,
  viewerTimeZone,
}: {
  vacancy: Vacancy;
  viewerTimeZone: string | null;
}) {
  return (
    <div className="vacancy-screen-meta">
      {vacancy.categories.length > 0 && (
        <>
          <span
            data-testid="vacancy-detail-categories"
            style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}
          >
            {vacancy.categories.map((category) => (
              <Badge
                key={category.id}
                status="neutral"
                data-testid={`vacancy-category-chip-${category.id}`}
              >
                {category.name}
              </Badge>
            ))}
          </span>
          <Separator />
        </>
      )}
      <span style={{ whiteSpace: 'nowrap' }}>{vacancy.interviewer.fullName}</span>
      <Separator />
      <span style={{ whiteSpace: 'nowrap' }}>{vacancy.durationMinutes} min</span>
      {viewerTimeZone && (
        <>
          <Separator />
          <span style={{ whiteSpace: 'nowrap' }}>
            times in <span data-testid="board-timezone">{viewerTimeZone}</span>
          </span>
        </>
      )}
    </div>
  );
}

const Separator = () => (
  <span aria-hidden="true" style={{ color: 'var(--text-secondary)' }}>
    ·
  </span>
);

/**
 * The description, clamped to three lines (01 §08.29).
 *
 * `View more` appears only when the clamp actually cuts something, which cannot be known
 * from the text — it depends on the width the header ended up with — so it is measured
 * from the laid-out element and re-measured on resize. Expanded, the block scrolls inside
 * a fifth of the screen rather than growing: the board keeps the rest, and a description
 * that could push it out of view would undo the reason the two are on one route.
 */
function VacancyDescription({
  description,
  onAdd,
}: {
  description: string | null;
  onAdd: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const [max, setMax] = useState(DESCRIPTION_MAX);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function measure(): void {
      setMax(
        Math.max(
          DESCRIPTION_MIN,
          Math.min(DESCRIPTION_MAX, Math.round(window.innerHeight * DESCRIPTION_SHARE)),
        ),
      );
      const node = ref.current;
      if (!node) {
        setClamped(false);
        return;
      }
      // Only meaningful while the clamp is on; expanded, the two heights are equal by
      // construction and the control has to stay to put it back.
      if (!expanded) setClamped(node.scrollHeight - node.clientHeight > 2);
    }
    measure();
    // Web fonts land after the first layout and change where the third line ends.
    const settle = setTimeout(measure, 120);
    window.addEventListener('resize', measure);
    return () => {
      clearTimeout(settle);
      window.removeEventListener('resize', measure);
    };
  }, [expanded, description]);

  if (!description) {
    return (
      <button
        type="button"
        onClick={onAdd}
        data-testid="vacancy-add-description"
        className="vacancy-screen-link-button"
        style={{ marginTop: 'var(--space-5)' }}
      >
        {HIRING_MESSAGES.vacancy.addDescription}
      </button>
    );
  }

  return (
    <div style={{ marginTop: 'var(--space-5)' }}>
      <div
        ref={ref}
        data-testid="vacancy-description"
        className="vacancy-screen-description"
        style={
          expanded
            ? { maxHeight: max, overflowY: 'auto' }
            : { WebkitLineClamp: DESCRIPTION_LINES, display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden' }
        }
      >
        {description}
      </div>
      {(clamped || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          data-testid="vacancy-description-toggle"
          aria-expanded={expanded}
          className="vacancy-screen-link-button"
        >
          {expanded ? HIRING_MESSAGES.vacancy.viewLess : HIRING_MESSAGES.vacancy.viewMore}
        </button>
      )}
    </div>
  );
}
