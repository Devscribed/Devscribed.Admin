/**
 * The Teammerly bundle ships per-component `.d.ts` files but no `index.d.ts`.
 * This maps the `@ds` entry point onto them so the app gets full typing without
 * touching the design system itself.
 *
 * The list mirrors `1_DS for dev/index.js` exactly. When the two drift, `npm run ds:drift`
 * is the check that says so; anything this app added to the vendored copy carries a number
 * in `specs/design-system/ledger.md`.
 */
declare module '@ds' {
  export * from '@ds/components/appLayout/AccountMenu';
  export * from '@ds/components/appLayout/AppShell';
  export * from '@ds/components/appLayout/AuthLayout';
  export * from '@ds/components/appLayout/MiniTracker';
  export * from '@ds/components/appLayout/Navbar';
  export * from '@ds/components/appLayout/Tracker';

  export * from '@ds/components/core/Badge';
  export * from '@ds/components/core/Button';
  export * from '@ds/components/core/Card';
  export * from '@ds/components/core/IconButton';
  export * from '@ds/components/core/PageTitle';
  export * from '@ds/components/core/ToggleButton';

  export * from '@ds/components/data/CircleList';
  export * from '@ds/components/data/CircleSelect';
  export * from '@ds/components/data/MembersCell';
  export * from '@ds/components/data/Table';
  export * from '@ds/components/data/TableToolbar';

  export * from '@ds/components/feedback/EmptyState';
  export * from '@ds/components/feedback/InfoBanner';
  export * from '@ds/components/feedback/Preloader';

  export * from '@ds/components/forms/Checkbox';
  export * from '@ds/components/forms/CheckboxRow';
  export * from '@ds/components/forms/DateField';
  export * from '@ds/components/forms/DateRangePicker';
  export * from '@ds/components/forms/FormActions';
  export * from '@ds/components/forms/FormField';
  export * from '@ds/components/forms/MembersMultiField';
  export * from '@ds/components/forms/SearchInput';
  export * from '@ds/components/forms/Select';
  export * from '@ds/components/forms/TextArea';
  export * from '@ds/components/forms/TextInput';
  export * from '@ds/components/forms/TimeField';

  export * from '@ds/components/icons/Icon';

  export * from '@ds/components/navigation/BackTo';
  export * from '@ds/components/navigation/NavigationCard';
  export * from '@ds/components/navigation/PageTabs';
  export * from '@ds/components/navigation/Sidebar';

  export * from '@ds/components/overlays/ConfirmDialog';
  export * from '@ds/components/overlays/MenuDrawer';
  export * from '@ds/components/overlays/Modal';
  export * from '@ds/components/overlays/Popover';

  export * from '@ds/components/reports/ReportControls';
  export * from '@ds/components/reports/ReportGroupBody';
  export * from '@ds/components/reports/ReportSummaryBanner';
  export * from '@ds/components/reports/ReportTableTitle';
}

declare module '@ds/styles.css';
