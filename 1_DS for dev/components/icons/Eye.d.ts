import * as React from 'react';

export interface IconProps extends React.SVGAttributes<SVGSVGElement> {
  /** Edge in px. 18 is the house glyph size. */
  size?: number;
}

/** Filled eye glyph — "password is masked, click to reveal". */
export declare function Eye(props: IconProps): JSX.Element;

/** Filled struck-through eye — "password is visible, click to mask". */
export declare function EyeOff(props: IconProps): JSX.Element;
