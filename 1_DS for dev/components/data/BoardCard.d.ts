import { HTMLAttributes, ReactNode } from 'react';

/**
 * §42 — **designed, not measured.** Teamplay has no kanban, so nothing here was reproduced
 * from production; the surface is `Card`'s treatment (§12) and the hover is
 * `NavigationCard`'s, which §12 declined precisely because a static container is not a
 * control. This one is.
 */
export interface BoardCardProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'onDragStart' | 'onDragEnd' | 'onKeyDown'> {
  /** The application id. Every `data-testid` on the card is suffixed with it. */
  cardId: string;
  name: ReactNode;
  /** The interview's date and time, already formatted in the viewer's zone. */
  when: ReactNode;
  /** Recedes the date by one level. The card does not move and nothing else changes. */
  past?: boolean;
  cancelled?: boolean;
  /** What the badge paints — a first name, because a board card is a glance. */
  cancelledLabel?: ReactNode;
  /**
   * The whole fact — who, when, why — which becomes the badge's accessible **name**. Not a
   * native `title`: on an element that already has text content `title` is a *description*,
   * and the text content still wins the name computation.
   */
  cancelledTooltip?: string | null;
  /**
   * The missing-conclusion marker's reason. Absent means no marker. It is drawn in
   * `--status-warning`, given to the pointer as the glyph's own `title`, and wired as the
   * card's `aria-describedby` — the colour is never the only signal.
   */
  flag?: string | null;
  hasCv?: boolean;
  cvLabel?: ReactNode;
  /** Accessible name — "{name}, {column}, {date}". Built by the caller, which knows the column. */
  label?: string;
  draggable?: boolean;
  /** Held by the keyboard: the card is lifted rather than replaced by its gap. */
  lifted?: boolean;
  onOpen?: () => void;
  onDragStart?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: (event: React.DragEvent<HTMLDivElement>) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
}

export function BoardCard(props: BoardCardProps): JSX.Element;
