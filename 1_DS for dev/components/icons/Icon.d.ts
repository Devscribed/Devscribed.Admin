import * as React from 'react';

export type GlyphProps = React.SVGProps<SVGSVGElement>;

export function ArrowIcon(props: GlyphProps): JSX.Element;
export function CloseIcon(props: GlyphProps): JSX.Element;
export function MagnifyIcon(props: GlyphProps): JSX.Element;
export function TrashIcon(props: GlyphProps): JSX.Element;
export function ThreeDotsIcon(props: GlyphProps): JSX.Element;
export function UserIcon(props: GlyphProps): JSX.Element;
export function PersonCircleIcon(props: GlyphProps): JSX.Element;
export function MailOutlineIcon(props: GlyphProps): JSX.Element;
export function TimeOutlineIcon(props: GlyphProps): JSX.Element;
export function InfoCircleIcon(props: GlyphProps): JSX.Element;
export function CloudDownloadOutlineIcon(props: GlyphProps): JSX.Element;
export function SettingsIcon(props: GlyphProps): JSX.Element;
export function CheckIcon(props: GlyphProps): JSX.Element;
export function MenuIcon(props: GlyphProps): JSX.Element;
export function TimesheetsIcon(props: GlyphProps): JSX.Element;
export function ProjectManagementIcon(props: GlyphProps): JSX.Element;
export function PeopleIcon(props: GlyphProps): JSX.Element;
export function ReportsIcon(props: GlyphProps): JSX.Element;
export function TimeOffIcon(props: GlyphProps): JSX.Element;
export function OrgIcon(props: GlyphProps): JSX.Element;

/** §20 — react-select's clear/remove cross, moved out of `Select.jsx` when `Chip` was promoted. */
export function CrossIcon(props: GlyphProps): JSX.Element;

/** §9 — drawn to blue's icon rules; prod has no password field to measure one from. */
export function EyeIcon(props: GlyphProps): JSX.Element;
export function EyeOffIcon(props: GlyphProps): JSX.Element;
export { EyeIcon as Eye, EyeOffIcon as EyeOff };

/** §44 — the board's missing-conclusion mark, drawn rather than typed. Prod flags nothing. */
export function FlagIcon(props: GlyphProps): JSX.Element;

export interface IconProps extends GlyphProps {
  /** Export name of the glyph, e.g. "TrashIcon". Unknown names render nothing. */
  name: string;
}

export function Icon(props: IconProps): JSX.Element | null;
export const iconNames: string[];
