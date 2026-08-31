export interface PreloaderProps {
  /** Dot diameter: 12 for the page/overlay loader, 8 for the in-table load-more row. */
  size?: number;
  /** Margin around each dot: 7 for the overlay, 5 in tables. */
  margin?: number;
  /** Centres the loader absolutely with `z-index: 1002`, as Preloader's own `.overlay` does. */
  overlay?: boolean;
  /** Divides the 0.75s duration and the 0.12s-per-dot stagger, as in react-spinners. */
  speedMultiplier?: number;
}

export function Preloader(props: PreloaderProps): JSX.Element;
