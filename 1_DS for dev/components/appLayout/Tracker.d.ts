export interface TrackerProps {
  project?: string | { label: string; value?: string } | null;
  setProject?: (project: any) => void;
  onClose?: () => void;
  options?: Array<string | { label: string; value?: string }>;
}

export function Tracker(props: TrackerProps): JSX.Element;
