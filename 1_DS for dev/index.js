// Public entry point for the Teammerly design system.
// Import from here, never from component internals — see _adherence.oxlintrc.json.
//
// The export list is kept in step with `_ds_manifest.json`; `npm run ds:drift` fails when the
// two disagree, and every disagreement must carry a number in specs/design-system/ledger.md.

export { AccountMenu } from './components/appLayout/AccountMenu.jsx';
export { AuthLayout } from './components/appLayout/AuthLayout.jsx';
export { AppShell } from './components/appLayout/AppShell.jsx';
export { BookingLayout } from './components/appLayout/BookingLayout.jsx';
export { MiniTracker } from './components/appLayout/MiniTracker.jsx';
export { Navbar } from './components/appLayout/Navbar.jsx';
export { Tracker } from './components/appLayout/Tracker.jsx';

export { Badge } from './components/core/Badge.jsx';
export { Button } from './components/core/Button.jsx';
export { Card } from './components/core/Card.jsx';
export { Chip } from './components/core/Chip.jsx';
export { IconButton } from './components/core/IconButton.jsx';
export { PageTitle } from './components/core/PageTitle.jsx';
export { ToggleButton } from './components/core/ToggleButton.jsx';

export { BoardCard } from './components/data/BoardCard.jsx';
export { BoardColumn } from './components/data/BoardColumn.jsx';
export { Calendar } from './components/data/Calendar.jsx';
export { CircleList } from './components/data/CircleList.jsx';
export { CircleSelect } from './components/data/CircleSelect.jsx';
export { MembersCell } from './components/data/MembersCell.jsx';
export { Table } from './components/data/Table.jsx';
export { TableToolbar } from './components/data/TableToolbar.jsx';

export { EmptyState } from './components/feedback/EmptyState.jsx';
export { InfoBanner } from './components/feedback/InfoBanner.jsx';
export { Preloader } from './components/feedback/Preloader.jsx';
export { Toast, ToastHost } from './components/feedback/Toast.jsx';

export { Checkbox } from './components/forms/Checkbox.jsx';
export { CheckboxRow } from './components/forms/CheckboxRow.jsx';
export { DateField } from './components/forms/DateField.jsx';
export { DateRangePicker } from './components/forms/DateRangePicker.jsx';
export { FileInput } from './components/forms/FileInput.jsx';
export { FormActions } from './components/forms/FormActions.jsx';
export { FieldLabel, FormField } from './components/forms/FormField.jsx';
export { MembersMultiField } from './components/forms/MembersMultiField.jsx';
export { SearchInput } from './components/forms/SearchInput.jsx';
export { Select } from './components/forms/Select.jsx';
export { TextArea } from './components/forms/TextArea.jsx';
export { TextInput } from './components/forms/TextInput.jsx';
export { TimeField } from './components/forms/TimeField.jsx';

export {
  ArrowIcon,
  CloseIcon,
  CrossIcon,
  MagnifyIcon,
  TrashIcon,
  ThreeDotsIcon,
  UserIcon,
  PersonCircleIcon,
  MailOutlineIcon,
  TimeOutlineIcon,
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
} from './components/icons/Icon.jsx';

export { BackTo } from './components/navigation/BackTo.jsx';
export { NavigationCard } from './components/navigation/NavigationCard.jsx';
export { Pagination } from './components/navigation/Pagination.jsx';
export { PageTabs } from './components/navigation/PageTabs.jsx';
export { Sidebar } from './components/navigation/Sidebar.jsx';

export { ConfirmDialog } from './components/overlays/ConfirmDialog.jsx';
export { MenuDrawer } from './components/overlays/MenuDrawer.jsx';
export { Modal } from './components/overlays/Modal.jsx';
export { Popover } from './components/overlays/Popover.jsx';

export { ReportControls } from './components/reports/ReportControls.jsx';
export { REPORT_COLUMNS, ReportGroupBody, ReportTableHead } from './components/reports/ReportGroupBody.jsx';
export { ReportSummaryBanner } from './components/reports/ReportSummaryBanner.jsx';
export { ReportTableTitle } from './components/reports/ReportTableTitle.jsx';
