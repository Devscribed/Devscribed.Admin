import * as React from 'react';

export interface InfoBannerProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: 'info' | 'warning' | 'error' | 'success';
  /** Custom leading icon. Falls back to the built-in info glyph. */
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

/** Soft-tinted horizontal notice with a leading glyph — the Meridian inline-alert. */
export declare function InfoBanner(props: InfoBannerProps): JSX.Element;
