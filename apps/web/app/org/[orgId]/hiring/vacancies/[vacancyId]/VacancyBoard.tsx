'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  APPLICATION_STATUS_LABELS,
  BOARD_COLUMNS,
  CONCLUSION_PROMPTING_STATUSES,
  HIRING_MESSAGES,
  MESSAGES,
  cancelledBadgeLabel,
  cancelledTooltip,
  formatShortWhen,
  type ApplicationStatus,
} from '@devscribed/validation';
import { BoardCard, BoardColumn, Button, EmptyState, InfoBanner, PageTabs, Preloader } from '@/ds';
import type { Board, BoardCardData } from '@/hiring/types';
import { useMediaQuery } from '@/hiring/useMediaQuery';
import type { QueuedToast } from '@/hiring/useToasts';
import { columnWithout, useBoardDrag, withMove, type Placement } from './useBoardDrag';

/** Below this the columns become a tab strip and drag is not attempted at all. */
const NARROW = '(max-width: 767px)';

export type BoardState =
  | { status: 'loading' }
  | { status: 'ready'; board: Board }
  | { status: 'error' }
  | { status: 'gone' };

/**
 * The board — one vacancy, five columns, every card movable to any of them.
 *
 * Two rules shape everything here. The server computes position from the cards a drop
 * landed between, so the screen sends **ids, never numbers** — the position it can see is
 * the one it last fetched, and a stale board must not be able to write a number that has
 * since been reused. And a move is applied optimistically and reverted on failure, because
 * a drag that visibly waits for a round trip stops feeling like a drag.
 *
 * It stopped being a page in the desktop design (01 §08.27): the vacancy header sits above
 * it on one route, so what used to be this screen's `PageHeader` and its own announcement
 * slot belong to the screen around it now. What is left is the board itself — which is
 * every rule 05 states, unchanged, and the reason this is a component rather than a
 * rewrite. The drag machine, the keyboard model and the live region moved as they were.
 *
 * The state is the caller's for one reason: the header wants the same fetch. Column counts
 * and a refetch after a move are the screen's business, and a board that owned its own
 * request would be the second thing on the page asking the server about this vacancy.
 */
export function VacancyBoard({
  orgId,
  state,
  setState,
  reload,
  push,
}: {
  orgId: string;
  state: BoardState;
  setState: (state: BoardState) => void;
  reload: () => Promise<void>;
  push: (toast: Omit<QueuedToast, 'id'>) => void;
}) {
  const router = useRouter();
  const [live, setLive] = useState('');
  const narrow = useMediaQuery(NARROW);
  const [visibleColumn, setVisibleColumn] = useState<ApplicationStatus>('scheduled');

  const board = state.status === 'ready' ? state.board : null;
  const { drag, pickUp, aimAt, drop, nudge, placementFor, announcement } = useBoardDrag(board);

  /** The card focus returns to once a move has settled, so a keyboard drag keeps its place. */
  const refocus = useRef<string | null>(null);
  /** Guards the deferred pick-up below against a drag that is already over. */
  const dragEnded = useRef(false);

  /**
   * A pointer pick-up, deferred by one frame.
   *
   * The browser rasterizes the drag image at the end of the `dragstart` handler, and
   * React flushes a state update from a discrete event before that handler returns. So
   * swapping the card for its placeholder here — the obvious thing to do — replaces the
   * element the browser is about to photograph, and the pointer drags nothing at all:
   * the card appears to vanish, leaving only a grey box and an insertion line.
   *
   * `requestAnimationFrame` runs after the snapshot and before the next paint, so the
   * placeholder still appears immediately to the eye.
   */
  const startPointerDrag = useCallback(
    (applicationId: string, node: HTMLElement): void => {
      dragEnded.current = false;
      // Measured while the card is still on screen, so its gap is exactly its size.
      const height = node.offsetHeight;
      /*
       * The source element is unmounted for the length of the drag, and `dragend` is
       * then delivered to a node that is no longer in the document — where it bubbles to
       * nothing. A native listener on the node itself is the only one certain to hear
       * it, and it is what ends a drag released over no column at all.
       */
      node.addEventListener(
        'dragend',
        () => {
          dragEnded.current = true;
          drop();
        },
        { once: true },
      );
      requestAnimationFrame(() => {
        if (dragEnded.current) return;
        pickUp('pointer', applicationId, height);
      });
    },
    [pickUp, drop],
  );

  // Pick-up and every target change, spoken from the one place that builds them.
  useEffect(() => {
    if (announcement) setLive(announcement);
  }, [announcement]);

  /**
   * `dragend` always fires on the drag source, including when the pointer was released
   * over nothing at all — which is the only signal a drag that dropped outside every
   * column ever produces.
   *
   * It is listened for here rather than only on the card because the guarantee has to
   * hold whatever the source happens to be rendering as at the time. Without it a
   * release outside a column leaves the placeholder and the insertion line on screen
   * for good, and the next drag finds a board still holding the last one.
   */
  useEffect(() => {
    function onDragEnd(): void {
      dragEnded.current = true;
      drop();
    }
    window.addEventListener('dragend', onDragEnd);
    return () => window.removeEventListener('dragend', onDragEnd);
  }, [drop]);

  useEffect(() => {
    if (!refocus.current || state.status !== 'ready') return;
    const card = document.querySelector<HTMLElement>(
      `[data-testid="board-card-${refocus.current}"]`,
    );
    refocus.current = null;
    card?.focus();
  }, [state]);

  const cardHref = useCallback(
    (card: BoardCardData, focusConclusion = false): string =>
      `/org/${orgId}/hiring/candidates/${card.candidateId}?application=${card.applicationId}` +
      (focusConclusion ? '&focus=conclusion' : ''),
    [orgId],
  );

  /**
   * The drop: optimistic first, then the request, then whichever of the two endings the
   * target column calls for.
   */
  const commit = useCallback(async (): Promise<void> => {
    if (!board || !drag) return;
    const placement = placementFor();
    const moved = drag.applicationId;
    const target = drag.to.status;
    const name = drag.name;
    drop();

    // A drop back where the card started asks for nothing at all (05 §02.6).
    if (!placement) {
      setLive(`Cancelled. ${name} returned to ${APPLICATION_STATUS_LABELS[drag.from.status]}.`);
      return;
    }

    const before = board;
    setState({ status: 'ready', board: withMove(board, moved, placement) });
    setLive(`Dropped ${name} in ${APPLICATION_STATUS_LABELS[target]}.`);
    refocus.current = moved;

    const outcome = await patchPlacement(orgId, moved, placement);

    if (outcome === 'stale') {
      // The board the drop was aimed at is not the board that exists. Say so, and get
      // the real one — retrying the move on the member's behalf would be guessing at
      // where they meant to put it on a board they have not seen.
      setState({ status: 'ready', board: before });
      push({ message: HIRING_MESSAGES.board.staleBoard, tone: 'error', testId: 'toast-board-stale' });
      await reload();
      return;
    }
    if (outcome === 'failed') {
      setState({ status: 'ready', board: before });
      push({ message: HIRING_MESSAGES.board.moveFailed, tone: 'error', testId: 'toast-move-failed' });
      return;
    }

    /**
     * Didn't pass and Offer open the card with Conclusion focused — after the move is
     * confirmed, never before, so a failed move never navigates (05 §06.20).
     *
     * The board is not refetched on this path: the card is a full navigation, and coming
     * back rebuilds this page from a fresh request anyway.
     */
    const card = before.columns
      .flatMap((column) => column.cards)
      .find((entry) => entry.applicationId === moved);
    if (card && CONCLUSION_PROMPTING_STATUSES.includes(target)) {
      router.push(cardHref(card, true));
      return;
    }
    await reload();
  }, [board, drag, drop, placementFor, orgId, reload, router, cardHref, setState, push]);

  const cancel = useCallback((): void => {
    if (!drag) return;
    setLive(`Cancelled. ${drag.name} returned to ${APPLICATION_STATUS_LABELS[drag.from.status]}.`);
    drop();
  }, [drag, drop]);

  // The screen owns `notFound()`; there is nothing for this to draw in the meantime.
  if (state.status === 'gone') return null;

  if (state.status === 'loading') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-7)' }}>
        <Preloader data-testid="board-loading" aria-hidden />
        <span aria-live="polite" style={VISUALLY_HIDDEN}>
          Loading board
        </span>
      </div>
    );
  }

  if (state.status === 'error') {
    // A board that could not be read is not a move that failed, and must not borrow that
    // sentence — nothing has been dragged yet. It is also the one message on this screen
    // that is not transient: a toast that timed out would leave an empty region with
    // nothing saying why, so this one keeps its place in the flow.
    return (
      <InfoBanner variant="error" role="alert" data-testid="board-load-error">
        <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          {MESSAGES.generic}
          <Button onClick={() => void reload()} data-testid="board-load-retry">
            {HIRING_MESSAGES.card.retry}
          </Button>
        </span>
      </InfoBanner>
    );
  }

  const { viewerTimeZone, columns } = state.board;
  const total = columns.reduce((sum, column) => sum + column.cards.length, 0);
  const now = Date.now();

  /**
   * A keyboard drag is one key doing two jobs, which is why `Space` cannot also activate
   * the card: `Enter` opens it instead. `Escape` puts it back.
   */
  function onCardKeyDown(event: React.KeyboardEvent, card: BoardCardData): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      router.push(cardHref(card));
      return;
    }
    if (event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      if (!drag) pickUp('keyboard', card.applicationId);
      else if (drag.applicationId === card.applicationId) void commit();
      return;
    }
    if (!drag || drag.applicationId !== card.applicationId) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
      return;
    }
    if (nudge(event.key)) event.preventDefault();
  }

  const renderColumn = (status: ApplicationStatus, asPanel = false) => {
    const column = columns.find((entry) => entry.status === status)!;
    const aimedHere = drag !== null && drag.to.status === status;

    /*
     * A card dragged with a **pointer** is not rendered at all: its gap is the column's
     * placeholder, which travels to wherever the drop would land.
     *
     * A card held by the **keyboard** stays exactly where it is, lifted, and the
     * placeholder alone travels. Moving it would re-parent the element between columns,
     * and a focused node that is moved to a new parent is blurred — which would take the
     * arrow keys, `Escape` and the drop itself with it, one keystroke into the drag.
     */
    const byKeyboard = drag?.mode === 'keyboard';
    const cards =
      drag && !byKeyboard ? columnWithout(state.board, status, drag.applicationId) : column.cards;

    /*
     * In the column the held card is still rendered in, the slot index has to step over
     * the card itself: every index is into the column *without* it, and this one list is
     * the exception that still has it.
     */
    const placeholderIndex = !drag || !aimedHere
      ? null
      : byKeyboard && drag.from.status === status
        ? drag.to.index + (drag.to.index >= drag.from.index ? 1 : 0)
        : drag.to.index;

    return (
      <BoardColumn
        key={status}
        id={`board-panel-${status}`}
        // Below 768px the column *is* the panel the tab strip chose, and that strip points
        // `aria-controls` at this id. Above it there is no strip and no panel to be.
        {...(asPanel ? { role: 'tabpanel' } : null)}
        // The tab that chose this panel already carries its name and its count, 8px above.
        hideHeader={asPanel}
        status={status}
        name={APPLICATION_STATUS_LABELS[status]}
        count={column.cards.length}
        emptyLabel={HIRING_MESSAGES.board.emptyColumn}
        placeholderIndex={placeholderIndex}
        placeholderHeight={drag?.height ?? undefined}
        // Always wired: a column that only became a drop target on the render after a
        // pick-up would refuse the first dragover events of every drag.
        onDragOverIndex={(index) => aimAt(status, index)}
        onDrop={() => void commit()}
      >
        {cards.map((card) => {
          const start = new Date(card.startUtc);
          const flagged =
            CONCLUSION_PROMPTING_STATUSES.includes(status) && !card.hasConclusion;
          return (
            <BoardCard
              key={card.applicationId}
              cardId={card.applicationId}
              name={card.name}
              when={formatShortWhen(start, viewerTimeZone)}
              past={start.getTime() < now}
              cancelled={card.isCancelled}
              // "The candidate withdrew" and "we called it off" are different facts to
              // somebody scanning a column, and the record now distinguishes them
              // (05 §07.26). The badge is a glance; the tooltip carries the whole of it.
              cancelledLabel={cancelledBadgeLabel(card.cancellation)}
              cancelledTooltip={
                card.isCancelled ? cancelledTooltip(card.cancellation, viewerTimeZone) : null
              }
              flag={flagged ? HIRING_MESSAGES.board.noConclusion : null}
              label={`${card.name}, ${APPLICATION_STATUS_LABELS[status]}, ${formatShortWhen(
                start,
                viewerTimeZone,
              )}`}
              // Below 768px a touch drag across a horizontally scrolling container is
              // unreliable, and the card page's own status control does the same job.
              draggable={!narrow}
              lifted={drag?.mode === 'keyboard' && drag.applicationId === card.applicationId}
              onDragStart={(event) => {
                // Some browsers refuse to begin a drag at all without a payload, and
                // `move` is what makes the cursor say what the drop will do.
                event.dataTransfer?.setData('text/plain', card.applicationId);
                if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
                // Deferred: this card has to survive its own dragstart, or there is no
                // drag image. See `startPointerDrag`.
                startPointerDrag(card.applicationId, event.currentTarget as HTMLElement);
              }}
              onDragEnd={() => {
                dragEnded.current = true;
                drop();
              }}
              onKeyDown={(event) => onCardKeyDown(event, card)}
              onOpen={() => router.push(cardHref(card))}
            />
          );
        })}
      </BoardColumn>
    );
  };

  return (
    <div data-testid="board" className="vacancy-board">
      {total === 0 ? (
        // The booking link is a button in the header one line above, so this says what is
        // missing and leaves the action where it already is.
        <EmptyState data-testid="board-empty-state">{HIRING_MESSAGES.board.emptyBoard}</EmptyState>
      ) : narrow ? (
        <>
          <PageTabs
            label="Board columns"
            active={visibleColumn}
            onChange={(value) => setVisibleColumn(value as ApplicationStatus)}
            tabs={BOARD_COLUMNS.map((status) => ({
              value: status,
              testId: `board-tab-${status}`,
              controls: `board-panel-${status}`,
              // The count rides in the label rather than in a prop of its own — a tab
              // strip that grew a `count` would then need a badge, and an icon.
              label: (
                <>
                  {APPLICATION_STATUS_LABELS[status]}{' '}
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {columns.find((entry) => entry.status === status)!.cards.length}
                  </span>
                </>
              ),
            }))}
          />
          <div className="board-single">{renderColumn(visibleColumn, true)}</div>
        </>
      ) : (
        <div className="board-scroll">
          <div className="board-columns">
            {BOARD_COLUMNS.map((status) => renderColumn(status))}
          </div>
        </div>
      )}

      {/* Present to a screen reader, absent to everything else. */}
      <p style={VISUALLY_HIDDEN}>{HIRING_MESSAGES.board.keyboardHint}</p>
      <p aria-live="polite" data-testid="board-live-region" style={VISUALLY_HIDDEN}>
        {live}
      </p>
    </div>
  );
}

type MoveOutcome = 'moved' | 'stale' | 'failed';

/**
 * The move. Ids, never a position — the server derives that from the cards named, which
 * is what makes a board fetched a minute ago safe to drag on (05 §API PATCH).
 */
async function patchPlacement(
  orgId: string,
  applicationId: string,
  placement: Placement,
): Promise<MoveOutcome> {
  try {
    const response = await fetch(
      `/api/organizations/${orgId}/hiring/applications/${applicationId}/placement`,
      {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: placement.status,
          afterApplicationId: placement.afterApplicationId,
          beforeApplicationId: placement.beforeApplicationId,
        }),
      },
    );
    if (response.ok) return 'moved';
    return response.status === 409 ? 'stale' : 'failed';
  } catch {
    return 'failed';
  }
}

const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
} as const;
