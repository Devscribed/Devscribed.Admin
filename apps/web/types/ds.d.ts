/**
 * The Meridian bundle ships per-component `.d.ts` files but no `index.d.ts`.
 * This maps the `@ds` entry point onto them so the app gets full typing without
 * touching the design system itself.
 */
declare module '@ds' {
  export * from '@ds/components/actions/Button';
  export * from '@ds/components/actions/IconButton';
  export * from '@ds/components/data/BoardCard';
  export * from '@ds/components/data/BoardColumn';
  export * from '@ds/components/data/Calendar';
  export * from '@ds/components/data/Table';
  export * from '@ds/components/feedback/Badge';
  export * from '@ds/components/feedback/InfoBanner';
  export * from '@ds/components/feedback/Skeleton';
  export * from '@ds/components/feedback/Spinner';
  export * from '@ds/components/feedback/Toast';
  export * from '@ds/components/feedback/Tooltip';
  export * from '@ds/components/forms/Checkbox';
  export * from '@ds/components/forms/Combobox';
  export * from '@ds/components/forms/FileInput';
  export * from '@ds/components/forms/Input';
  export * from '@ds/components/forms/Radio';
  export * from '@ds/components/forms/SearchField';
  export * from '@ds/components/forms/Select';
  export * from '@ds/components/forms/Textarea';
  export * from '@ds/components/icons/Eye';
  export * from '@ds/components/navigation/Menu';
  export * from '@ds/components/navigation/NavItem';
  export * from '@ds/components/navigation/Pagination';
  export * from '@ds/components/navigation/Tabs';
  export * from '@ds/components/navigation/Toggle';
  export * from '@ds/components/surfaces/AuthLayout';
  export * from '@ds/components/surfaces/BookingLayout';
  export * from '@ds/components/surfaces/Card';
  export * from '@ds/components/surfaces/Modal';
  export * from '@ds/components/typography/SectionLabel';
}

declare module '@ds/styles.css';
