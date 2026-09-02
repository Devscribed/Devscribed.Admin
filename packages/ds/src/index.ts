'use client';

/**
 * The design system's public entry point. Import from here, never from a component file —
 * everything below is the surface, and everything not below is an internal.
 *
 * **One client boundary.** Every component in this toolkit is interactive UI that uses hooks,
 * so the directive sits here once rather than being sprinkled across the screens that consume
 * it. A server component importing from this module gets a client component, which is what it
 * wanted; nothing in the system is renderable on the server, and nothing pretends to be.
 *
 * The scope rule, for anything added later: **reachable from the app, or named by a written
 * spec.** A component nobody renders and no spec asks for pays lint, documentation and review
 * cost forever and repays none of it — see `README.md`.
 */

export { AccountMenu } from './components/appLayout/AccountMenu';
export { AppShell } from './components/appLayout/AppShell';
export { AuthLayout } from './components/appLayout/AuthLayout';
export { BookingLayout } from './components/appLayout/BookingLayout';
export { MiniTracker } from './components/appLayout/MiniTracker';
export { Navbar } from './components/appLayout/Navbar';

export { Badge } from './components/core/Badge';
export { Button } from './components/core/Button';
export { Card } from './components/core/Card';
export { Chip } from './components/core/Chip';
export { IconButton } from './components/core/IconButton';
export { PageTitle } from './components/core/PageTitle';
export { ToggleButton } from './components/core/ToggleButton';

export { BoardCard } from './components/data/BoardCard';
export { BoardColumn } from './components/data/BoardColumn';
export { Calendar } from './components/data/Calendar';
export { Table } from './components/data/Table';
export { TableToolbar } from './components/data/TableToolbar';

export { EmptyState } from './components/feedback/EmptyState';
export { InfoBanner } from './components/feedback/InfoBanner';
export { Preloader } from './components/feedback/Preloader';
export { Toast, ToastHost } from './components/feedback/Toast';
export { Tooltip } from './components/feedback/Tooltip';

export { Checkbox } from './components/forms/Checkbox';
export { FileInput } from './components/forms/FileInput';
export { FormActions } from './components/forms/FormActions';
/* §74 — `fieldLabelStyle` is exported beside the components it belongs to. Every system input
   already renders it; what was missing was a way for a screen to put a *caption* on the same
   line as the field labels beside it without copying four numbers into app code. */
export { FieldLabel, fieldLabelStyle, FormField, RequiredMark } from './components/forms/FormField';
export { SearchInput } from './components/forms/SearchInput';
export { Select } from './components/forms/Select';
export { TextArea } from './components/forms/TextArea';
export { TextInput } from './components/forms/TextInput';

export {
  ArrowIcon,
  CloseIcon,
  CrossIcon,
  CopyIcon,
  MagnifyIcon,
  TrashIcon,
  ThreeDotsIcon,
  UserIcon,
  PersonCircleIcon,
  MailOutlineIcon,
  TimeOutlineIcon,
  CalendarIcon,
  PersonOutlineIcon,
  InfoCircleIcon,
  CloudDownloadOutlineIcon,
  SettingsIcon,
  CheckIcon,
  MenuIcon,
  TimesheetsIcon,
  ProjectManagementIcon,
  PeopleIcon,
  ReportsIcon,
  TimeOffIcon,
  OrgIcon,
  Eye,
  EyeOff,
  FlagIcon,
  Icon,
} from './components/icons/Icon';

export { BackTo } from './components/navigation/BackTo';
export { PageTabs } from './components/navigation/PageTabs';
export { Pagination } from './components/navigation/Pagination';
export { Sidebar } from './components/navigation/Sidebar';

export { ConfirmDialog } from './components/overlays/ConfirmDialog';
export { MenuDrawer } from './components/overlays/MenuDrawer';
export { Modal } from './components/overlays/Modal';
export { Popover } from './components/overlays/Popover';

/**
 * The types are part of the surface, not a sidecar. Every one of these lives beside the
 * component it describes, in the same file, so a prop and its documentation cannot drift.
 */
export type { AccountMenuItem, AccountMenuProps } from './components/appLayout/AccountMenu';
export type { AppShellProps } from './components/appLayout/AppShell';
export type { AuthLayoutProps } from './components/appLayout/AuthLayout';
export type { BookingLayoutProps } from './components/appLayout/BookingLayout';
export type { MiniTrackerProps } from './components/appLayout/MiniTracker';
export type { NavbarProps } from './components/appLayout/Navbar';

export type { BadgeProps } from './components/core/Badge';
export type { ButtonProps } from './components/core/Button';
export type { CardProps } from './components/core/Card';
export type { ChipProps } from './components/core/Chip';
export type { IconButtonProps } from './components/core/IconButton';
export type { PageTitleProps } from './components/core/PageTitle';
export type { ToggleButtonProps } from './components/core/ToggleButton';

export type { BoardCardProps } from './components/data/BoardCard';
export type { BoardColumnProps } from './components/data/BoardColumn';
export type { CalendarDate, CalendarMonth, CalendarProps } from './components/data/Calendar';
export type { TableColumn, TableProps } from './components/data/Table';
export type { TableToolbarProps } from './components/data/TableToolbar';

export type { EmptyStateProps } from './components/feedback/EmptyState';
export type { InfoBannerProps } from './components/feedback/InfoBanner';
export type { PreloaderProps } from './components/feedback/Preloader';
export type { ToastEntry, ToastHostProps, ToastProps } from './components/feedback/Toast';
export type { TooltipProps } from './components/feedback/Tooltip';

export type { CheckboxProps } from './components/forms/Checkbox';
export type { FileInputProps } from './components/forms/FileInput';
export type { FormActionsProps } from './components/forms/FormActions';
export type { FieldLabelProps, FormFieldProps } from './components/forms/FormField';
export type { SearchInputProps } from './components/forms/SearchInput';
export type { SelectOption, SelectOptionLike, SelectProps } from './components/forms/Select';
export type { TextAreaProps } from './components/forms/TextArea';
export type { TextInputProps } from './components/forms/TextInput';

export type { GlyphProps, IconProps } from './components/icons/Icon';

export type { BackToProps } from './components/navigation/BackTo';
export type { PageTabsProps, TabItem } from './components/navigation/PageTabs';
export type { PaginationProps } from './components/navigation/Pagination';
export type { SidebarItem, SidebarNavigate, SidebarProps, SidebarSubItem } from './components/navigation/Sidebar';

export type { ConfirmDialogProps } from './components/overlays/ConfirmDialog';
export type { MenuDrawerProps } from './components/overlays/MenuDrawer';
export type { ModalProps } from './components/overlays/Modal';
export type { PopoverItem, PopoverProps } from './components/overlays/Popover';
