import * as React from 'react';

export interface BoardCardProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onDragStart' | 'onDragEnd' | 'onKeyDown'> {
  /** Identifies the card in every `data-testid` it renders. */
  cardId: string;
  name: React.ReactNode;
  when: React.ReactNode;
  /** Renders the date faint. The card does not move and nothing else changes. */
  past?: boolean;
  cancelled?: boolean;
  cancelledLabel?: string;
  /**
   * The whole cancellation — who, when, and why — shown on hover and focus. It also
   * becomes the badge's accessible name, because the badge itself is deliberately
   * truncated to a first name.
   */
  cancelledTooltip?: string | null;
  /** The marker's reason. Absent means no marker; the text is what `aria-describedby` resolves to. */
  flag?: string | null;
  hasCv?: boolean;
  cvLabel?: string;
  /** Accessible name — "{name}, {column}, {date}", built by the caller. */
  label?: string;
  draggable?: boolean;
  /** Held by the keyboard: the card travels with the target rather than leaving a gap. */
  lifted?: boolean;
  onOpen?: () => void;
  onDragStart?: React.DragEventHandler<HTMLDivElement>;
  onDragEnd?: React.DragEventHandler<HTMLDivElement>;
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
}

/**
 * A draggable board card. `Space` picks it up and `Enter` opens it — the one place a
 * `role="button"` in Meridian does not activate on `Space`, because a board whose cards
 * activated on it could not be dragged with a keyboard at all.
 */
export declare function BoardCard(props: BoardCardProps): JSX.Element;
