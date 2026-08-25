'use client';

/**
 * Client boundary for the Meridian bundle.
 *
 * `@ds`'s barrel re-exports components that use hooks (`Input`, `IconButton`, …), so
 * importing it straight into a server component fails. Everything in the design system
 * is interactive UI anyway, so the app imports it through this one client barrel
 * instead of sprinkling `'use client'` across pages — or editing the DS.
 */
export {
  AuthLayout,
  Badge,
  BookingLayout,
  Button,
  Card,
  Checkbox,
  Eye,
  EyeOff,
  FileInput,
  IconButton,
  InfoBanner,
  Input,
  Modal,
  NavItem,
  Radio,
  RadioGroup,
  SearchField,
  SectionLabel,
  Select,
  Skeleton,
  Spinner,
  Table,
  Tabs,
  Textarea,
  Toast,
  Toggle,
} from '@ds';
