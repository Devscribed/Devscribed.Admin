'use client';

import { notFound, useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useRef, useState } from 'react';
import {
  APPLICATION_STATUS_LABELS,
  BOARD_COLUMNS,
  CONCLUSION_PROMPTING_STATUSES,
  HIRING_MESSAGES,
  MESSAGES,
  formatShortWhen,
  type ApplicationStatus,
} from '@devscribed/validation';
import { BoardCard, BoardColumn, Button, Card, InfoBanner, Skeleton, Tabs, Toast } from '@/ds';
import { PageHeader } from '@/layout/PageHeader';
import type { Board, BoardCardData } from '@/hiring/types';
import { columnWithout, useBoardDrag, withMove, type Placement } from './useBoardDrag';

type State =
  | { status: 'loading' }
  | { status: 'ready'; board: Board }
  | { status: 'error' }
  | { status: 'gone' };

/** Below this the columns become a tab strip and drag is not attempted at all. */
const NARROW = '(max-width: 767px)';

/**
 * The board — one vacancy, five columns, every card movable to any of them.
 *
 * Two rules shape everything here. The server computes position from the cards a drop
 * landed between, so the screen sends **ids, never numbers** — the position it can see is
 * the one it last fetched, and a stale board must not be able to write a number that has
 * since been reused. And a move is applied optimistically and reverted on failure, because
 * a drag that visibly waits for a round trip stops feeling like a drag.
 */
export default function BoardPage({
  params,
}: {
  params: Promise<{ orgId: string; vacancyId: string }>;
}) {
  const { orgId, vacancyId } = use(params);
  const router = useRouter();

  const [state, setState] = useState<State>({ status: 'loading' });
  const [notice, setNotice] = useState<string | null>(null);
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

  const load = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/hiring/vacancies/${vacancyId}/board`,
        { credentials: 'same-origin' },
      );
      // 403 for a role with no board access, 404 for a vacancy this caller may not see.
      // Both are the same dead end from here, and which of the two it is, is precisely
      // what the API declines to say (05 §API).
      if (response.status === 403 || response.status === 404) {
        setState({ status: 'gone' });
        return;
      }
      if (!response.ok) {
        setState({ status: 'error' });
        return;
      }
      setState({ status: 'ready', board: await response.json() });
    } catch {
      setState({ status: 'error' });
    }
  }, [orgId, vacancyId]);

  useEffect(() => {
    void load();
  }, [load]);

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
      setNotice(HIRING_MESSAGES.board.staleBoard);
      await load();
      return;
    }
    if (outcome === 'failed') {
      setState({ status: 'ready', board: before });
      setNotice(HIRING_MESSAGES.board.moveFailed);
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
    await load();
  }, [board, drag, drop, placementFor, orgId, load, router, cardHref]);

  const cancel = useCallback((): void => {
    if (!drag) return;
    setLive(`Cancelled. ${drag.name} returned to ${APPLICATION_STATUS_LABELS[drag.from.status]}.`);
    drop();
  }, [drag, drop]);

  if (state.status === 'gone') notFound();

  if (state.status === 'loading') {
    return (
      <Card>
        <Skeleton rows={5} height={64} data-testid="board-loading-skeleton" />
      </Card>
    );
  }

  if (state.status === 'error') {
    // A board that could not be read is not a move that failed, and must not borrow that
    // sentence — nothing has been dragged yet.
    return (
      <Card data-testid="board-load-error">
        <InfoBanner tone="error">
          <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
            {MESSAGES.generic}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void load()}
              data-testid="board-load-retry"
            >
              {HIRING_MESSAGES.card.retry}
            </Button>
          </span>
        </InfoBanner>
      </Card>
    );
  }

  const { vacancy, viewerTimeZone, columns } = state.board;
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

  const renderColumn = (status: ApplicationStatus) => {
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
              cancelledLabel={HIRING_MESSAGES.board.cancelled}
              flag={flagged ? HIRING_MESSAGES.board.noConclusion : null}
              hasCv={card.hasCv}
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
    <div data-testid="board">
      <PageHeader
        title={vacancy.title}
        subtitle={
          <>
            Board · times in <span data-testid="board-timezone">{viewerTimeZone}</span>
          </>
        }
        action={
          <Button
            variant="secondary"
            onClick={() => router.push(`/org/${orgId}/hiring/vacancies/${vacancyId}`)}
            data-testid="board-details-link"
          >
            Details
          </Button>
        }
      />

      {total === 0 ? (
        <Card>
          <p
            data-testid="board-empty-state"
            style={{ margin: 0, fontSize: 'var(--fs-15)', color: 'var(--text-muted)' }}
          >
            {HIRING_MESSAGES.board.emptyBoard}
          </p>
        </Card>
      ) : narrow ? (
        <>
          <Tabs
            label="Board columns"
            value={visibleColumn}
            onChange={(value) => setVisibleColumn(value as ApplicationStatus)}
            items={BOARD_COLUMNS.map((status) => ({
              value: status,
              testId: `board-tab-${status}`,
              controls: `board-panel-${status}`,
              // The count rides in the label rather than in a prop of its own — a tab
              // strip that grew a `count` would then need a badge, and an icon.
              label: (
                <>
                  {APPLICATION_STATUS_LABELS[status]}{' '}
                  <span style={{ color: 'var(--text-muted)' }}>
                    {columns.find((entry) => entry.status === status)!.cards.length}
                  </span>
                </>
              ),
            }))}
          />
          <div className="board-single">{renderColumn(visibleColumn)}</div>
        </>
      ) : (
        <div className="board-scroll">
          <div className="board-columns">{BOARD_COLUMNS.map(renderColumn)}</div>
        </div>
      )}

      {/* Present to a screen reader, absent to everything else. */}
      <p style={VISUALLY_HIDDEN}>{HIRING_MESSAGES.board.keyboardHint}</p>
      <p aria-live="polite" data-testid="board-live-region" style={VISUALLY_HIDDEN}>
        {live}
      </p>

      {notice && (
        <Toast
          tone="error"
          onDismiss={() => setNotice(null)}
          data-testid={
            notice === HIRING_MESSAGES.board.staleBoard ? 'toast-board-stale' : 'toast-move-failed'
          }
        >
          {notice}
        </Toast>
      )}
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

/**
 * The board's one structural breakpoint, which a media query in CSS cannot express on its
 * own: below it the five columns become a tab strip and drag is not attempted.
 */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const media = window.matchMedia(query);
    setMatches(media.matches);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
} as const;
