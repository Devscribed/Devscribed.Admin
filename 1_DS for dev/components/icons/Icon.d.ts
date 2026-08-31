export interface IconProps extends React.SVGProps<SVGSVGElement> {
  /** Export name of the glyph, e.g. "TrashIcon". Unknown names render nothing. */
  name: string;
}

export function Icon(props: IconProps): JSX.Element | null;
export const iconNames: string[];
