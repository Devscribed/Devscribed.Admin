import { ReactNode } from 'react';
export interface InfoBannerProps {
  variant?: 'info' | 'warning';
  children: ReactNode;
}

export function InfoBanner(props: InfoBannerProps): JSX.Element;
