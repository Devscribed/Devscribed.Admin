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
  AuthLayout,
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  Eye,
  EyeOff,
  IconButton,
  InfoBanner,
  Modal,
  PageTabs,
  Popover,
  Preloader,
  SearchInput,
  Select,
  Table,
  TextArea,
  TextInput,
  ToggleButton,
} from '@ds';
