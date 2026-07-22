import * as React from 'react';

export interface SectionLabelProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
}

/** Uppercase Grotesk micro-label — used above form fields, in card headers, and as data-list captions. */
export declare function SectionLabel(props: SectionLabelProps): JSX.Element;
