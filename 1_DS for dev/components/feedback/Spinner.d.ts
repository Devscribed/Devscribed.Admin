import * as React from 'react';

export interface SpinnerProps extends React.SVGAttributes<SVGSVGElement> {
  /** Square edge in px. 15 is the in-button size; 28 stands alone on a card. */
  size?: number;
}

/**
 * The Meridian spinner: a 3/4 arc rotating once every 0.7s, drawn in
 * `currentColor` so it inherits from whatever it sits in. The rotation is an
 * SVG `animateTransform` rather than a CSS keyframe — the design system ships
 * no keyframes. Always `aria-hidden`; the surrounding copy carries the meaning.
 * @startingPoint section="Feedback" subtitle="In-flight indicator" viewport="700x140"
 */
export declare function Spinner(props: SpinnerProps): JSX.Element;
