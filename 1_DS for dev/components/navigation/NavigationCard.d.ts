export interface NavigationCardProps {
  title: string;
  description: string;
  onClick?: () => void;
}

export function NavigationCard(props: NavigationCardProps): JSX.Element;
