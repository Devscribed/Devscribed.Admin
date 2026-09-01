'use client';

/**
 * Client boundary for the Teammerly bundle.
 *
 * `@ds`'s barrel re-exports components that use hooks (`TextInput`, `IconButton`, …), so
 * importing it straight into a server component fails. Everything in the design system
 * is interactive UI anyway, so the app imports it through this one client barrel
 * instead of sprinkling `'use client'` across pages — or editing the DS.
 *
 * This list is what the app actually consumes, not everything `@ds` exports: the design
 * system also carries Teamplay's timesheet, tracker and reporting components, which the
 * hiring module has no use for.
 */
export {
  AccountMenu,
  AppShell,
  AuthLayout,
  Badge,
  BoardCard,
  BoardColumn,
  BookingLayout,
  Button,
  Calendar,
  Card,
  Checkbox,
  Chip,
  CloseIcon,
  ConfirmDialog,
  EmptyState,
  Eye,
  EyeOff,
  FieldLabel,
  FileInput,
  FormActions,
  IconButton,
  InfoBanner,
  MenuDrawer,
  Modal,
  Navbar,
  PageTabs,
  PageTitle,
  Pagination,
  Popover,
  Preloader,
  SearchInput,
  Select,
  Sidebar,
  Table,
  TableToolbar,
  TextArea,
  TextInput,
  Toast,
  ToastHost,
  ToggleButton,
} from '@ds';

/** Type-only, so a screen can narrow what `Select`'s `onChange` hands back. */
export type { SelectOption } from '@ds';
