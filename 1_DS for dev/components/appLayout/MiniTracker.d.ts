export interface MiniTrackerProps {
  /** Elapsed time shown in the pill. */
  counter?: string;
  onClick?: () => void;
}

export function MiniTracker(props: MiniTrackerProps): JSX.Element;
