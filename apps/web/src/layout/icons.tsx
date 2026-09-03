'use client';

/**
 * This product's own glyphs — the marks the design system has no export for.
 *
 * They follow the system's icon rules exactly (`packages/ds/README.md` → Iconography):
 * hand-authored inline SVG, geometric, filled with `currentColor`, no strokes, a `viewBox`
 * matching the intrinsic size. A glyph belongs in the package when a second screen would
 * reach for it; until then it belongs to the screen that draws it.
 *
 * Six left with the shell when it moved onto the system's `Sidebar` — `PeopleIcon`,
 * `ReportsIcon`, `InboxIcon`, `FolderIcon`, `BriefcaseIcon` and `ClockIcon` — because the
 * system exports the section marks it named the sections with, and nothing else drew them.
 */

/**
 * Pencil glyph for the "rename project" action (spec 11 — list-row edit + detail rename).
 * A simple filled pencil drawn with `currentColor` to match the other shell glyphs.
 */
export function PencilIcon() {
  return (
    <svg viewBox="0 0 20 20" width={16} height={16} fill="currentColor" aria-hidden>
      <path d="M13.94 2.5a1.75 1.75 0 0 1 1.24.51l1.81 1.81a1.75 1.75 0 0 1 0 2.47l-8.3 8.3a1.75 1.75 0 0 1-.83.46l-4.02.98a.75.75 0 0 1-.91-.9l.98-4.03c.08-.31.24-.6.46-.83l8.3-8.3a1.75 1.75 0 0 1 1.24-.51Zm0 1.5a.25.25 0 0 0-.18.07l-1.06 1.06 2.42 2.42 1.06-1.06a.25.25 0 0 0 0-.36l-1.81-1.81a.25.25 0 0 0-.18-.07l-.25-.25.25.25Zm.12 4.61-2.42-2.42-6.18 6.18a.25.25 0 0 0-.06.12l-.62 2.54 2.54-.62a.25.25 0 0 0 .12-.06l6.18-6.18Z" />
    </svg>
  );
}

/**
 * The row-actions ("⋮") trigger glyph — three stacked dots, lifted verbatim from the
 * `icDots` entry in `MeridianApp.dc.html`'s members-list section (spec 04).
 */
export function DotsIcon() {
  return (
    <svg viewBox="0 0 4 16" width={4} height={16} fill="currentColor" aria-hidden>
      <circle cx="2" cy="2" r="1.6" />
      <circle cx="2" cy="8" r="1.6" />
      <circle cx="2" cy="14" r="1.6" />
    </svg>
  );
}

/** Play (▶) triangle — the "Start timer" button glyph (spec 12 timer bar). */
export function PlayIcon({ size = 13 }: { size?: number }) {
  return (
    <svg viewBox="0 0 12 12" width={size} height={size} fill="currentColor" aria-hidden>
      <path d="M2.5 1.6c0-.5.54-.82.98-.57l7 4.4a.67.67 0 0 1 0 1.14l-7 4.4A.67.67 0 0 1 2.5 10.4V1.6Z" />
    </svg>
  );
}

/** Filled square — the "Stop" glyph shared by the timer bar and the topbar indicator. */
export function StopIcon({ size = 11 }: { size?: number }) {
  return (
    <svg viewBox="0 0 12 12" width={size} height={size} fill="currentColor" aria-hidden>
      <rect x="1.5" y="1.5" width="9" height="9" rx="1.5" />
    </svg>
  );
}

/** Trash glyph for the "delete entry" action (spec 12 daily list). */
export function TrashIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="currentColor" aria-hidden>
      <path d="M8 2.5a1 1 0 0 0-1 1V4H4.25a.75.75 0 0 0 0 1.5H4.8l.5 9.06A2 2 0 0 0 7.3 16.5h5.4a2 2 0 0 0 2-1.94L15.2 5.5h.55a.75.75 0 0 0 0-1.5H13v-.5a1 1 0 0 0-1-1H8Zm4.5 3H6.3l.49 8.98a.5.5 0 0 0 .5.52h5.42a.5.5 0 0 0 .5-.52L13.7 5.5H12.5Zm-4 1.75a.75.75 0 0 1 1.5 0v5a.75.75 0 0 1-1.5 0v-5Zm3 0a.75.75 0 0 1 1.5 0v5a.75.75 0 0 1-1.5 0v-5Z" />
    </svg>
  );
}

/** Left chevron — the "previous period" control (spec 12 period navigation). */
export function ChevronLeftIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="currentColor" aria-hidden>
      <path d="M10.35 3.15c.3.3.3.77 0 1.06L6.56 8l3.79 3.79a.75.75 0 1 1-1.06 1.06L4.97 8.53a.75.75 0 0 1 0-1.06l4.32-4.32c.3-.3.77-.3 1.06 0Z" />
    </svg>
  );
}

/** Right chevron — the "next period" control (spec 12 period navigation). */
export function ChevronRightIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="currentColor" aria-hidden>
      <path d="M5.65 3.15c-.3.3-.3.77 0 1.06L9.44 8l-3.79 3.79a.75.75 0 1 0 1.06 1.06l4.32-4.32a.75.75 0 0 0 0-1.06L6.71 3.15c-.3-.3-.77-.3-1.06 0Z" />
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * Spec 13 — Kanban Board & Tasks
 * Icons for task types, priorities, and the misc kanban controls
 * (gear, plus, drag handle, back arrow). All inline SVG, `currentColor`,
 * sizes settable via a prop so the same glyph works in a 16px card row
 * and a 22px board button.
 * ------------------------------------------------------------------ */

/** Task type — Epic. Filled lightning-bolt glyph, violet accent ink. */
export function EpicIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="currentColor" aria-hidden>
      <path d="M9.2 1.2 3 9h4l-1.2 5.6L12 6h-4l1.2-4.8Z" />
    </svg>
  );
}

/** Task type — Task. Rounded checkmark-square glyph. */
export function TaskTypeIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="currentColor" aria-hidden>
      <path d="M3.75 2h8.5A1.75 1.75 0 0 1 14 3.75v8.5A1.75 1.75 0 0 1 12.25 14h-8.5A1.75 1.75 0 0 1 2 12.25v-8.5A1.75 1.75 0 0 1 3.75 2Zm7.53 3.72a.75.75 0 0 0-1.06-1.06L7 7.88 5.78 6.66a.75.75 0 0 0-1.06 1.06l1.75 1.75c.3.3.77.3 1.06 0l3.75-3.75Z" />
    </svg>
  );
}

/** Task type — Bug. Six-legged bug body glyph. */
export function BugIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="currentColor" aria-hidden>
      <path d="M8 2.2a2.5 2.5 0 0 1 2.4 1.8H5.6A2.5 2.5 0 0 1 8 2.2Zm-4.6 3.3H2a.7.7 0 0 0 0 1.4h1.2v.6a4.8 4.8 0 0 0 .3 1.7H2a.7.7 0 0 0 0 1.4h1.9c.5.9 1.3 1.6 2.3 1.9v-4a.75.75 0 0 1 1.5 0v4.1a3.9 3.9 0 0 0 .6.05c.2 0 .4-.02.6-.05V9.5a.75.75 0 0 1 1.5 0v4c1-.3 1.8-1 2.3-1.9H14a.7.7 0 0 0 0-1.4h-1.5a4.8 4.8 0 0 0 .3-1.7v-.6H14a.7.7 0 0 0 0-1.4h-1.4a4.8 4.8 0 0 0-.6-1.3H4a4.8 4.8 0 0 0-.6 1.3Z" />
    </svg>
  );
}

/** Task type — Story. Bookmark/flag glyph. */
export function StoryIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="currentColor" aria-hidden>
      <path d="M4 2.5A1.5 1.5 0 0 0 2.5 4v10.25a.75.75 0 0 0 1.2.6L8 11.7l4.3 3.15a.75.75 0 0 0 1.2-.6V4A1.5 1.5 0 0 0 12 2.5H4Z" />
    </svg>
  );
}

/** Task type — Subtask. Small nested-checkbox glyph. */
export function SubtaskIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="currentColor" aria-hidden>
      <path d="M2 3.25a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-.75.75h-4.5A.75.75 0 0 1 2 6.75v-3.5Zm6.5 6a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-.75.75h-4.5A.75.75 0 0 1 8.5 12.75v-3.5Zm-1-.5V11a.75.75 0 0 0 .75.75H10a.75.75 0 0 0 0-1.5H9V8.75a.75.75 0 0 0-1.5 0Z" />
    </svg>
  );
}

/** Priority — Low. Single down chevron. */
export function PriorityLowIcon({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="currentColor" aria-hidden>
      <path d="M3.72 6.22a.75.75 0 0 1 1.06 0L8 9.44l3.22-3.22a.75.75 0 1 1 1.06 1.06l-3.75 3.75a.75.75 0 0 1-1.06 0L3.72 7.28a.75.75 0 0 1 0-1.06Z" />
    </svg>
  );
}

/** Priority — Medium. Equals/level dash glyph. */
export function PriorityMediumIcon({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="currentColor" aria-hidden>
      <rect x="3" y="6" width="10" height="1.6" rx="0.8" />
      <rect x="3" y="9.4" width="10" height="1.6" rx="0.8" />
    </svg>
  );
}

/** Priority — High. Single up chevron. */
export function PriorityHighIcon({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="currentColor" aria-hidden>
      <path d="M3.72 9.78a.75.75 0 0 0 1.06 0L8 6.56l3.22 3.22a.75.75 0 0 0 1.06-1.06L8.53 4.97a.75.75 0 0 0-1.06 0L3.72 8.72a.75.75 0 0 0 0 1.06Z" />
    </svg>
  );
}

/** Priority — Critical. Double up chevron. */
export function PriorityCriticalIcon({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="currentColor" aria-hidden>
      <path d="M3.72 7.78a.75.75 0 0 0 1.06 0L8 4.56l3.22 3.22a.75.75 0 0 0 1.06-1.06L8.53 2.97a.75.75 0 0 0-1.06 0L3.72 6.72a.75.75 0 0 0 0 1.06Zm0 4.5a.75.75 0 0 0 1.06 0L8 9.06l3.22 3.22a.75.75 0 0 0 1.06-1.06L8.53 7.47a.75.75 0 0 0-1.06 0l-3.75 3.75a.75.75 0 0 0 0 1.06Z" />
    </svg>
  );
}

/** Gear glyph — the "Board Settings" trigger. */
export function GearIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="currentColor" aria-hidden>
      <path d="M9.05 1.5a.9.9 0 0 0-.9.75l-.28 1.75a6.5 6.5 0 0 0-1.5.87L4.7 4.28a.9.9 0 0 0-1.11.4l-.95 1.65a.9.9 0 0 0 .21 1.15l1.36 1.13a6.6 6.6 0 0 0 0 1.78L2.85 11.5a.9.9 0 0 0-.21 1.15l.95 1.65a.9.9 0 0 0 1.11.4l1.68-.6a6.5 6.5 0 0 0 1.5.88l.28 1.76a.9.9 0 0 0 .9.76h1.9a.9.9 0 0 0 .9-.76l.28-1.76a6.5 6.5 0 0 0 1.5-.88l1.68.6a.9.9 0 0 0 1.11-.4l.95-1.65a.9.9 0 0 0-.21-1.15l-1.36-1.13a6.6 6.6 0 0 0 0-1.78l1.36-1.13a.9.9 0 0 0 .21-1.15l-.95-1.65a.9.9 0 0 0-1.11-.4l-1.68.59a6.5 6.5 0 0 0-1.5-.87l-.28-1.75a.9.9 0 0 0-.9-.75h-1.9ZM10 7.25a2.75 2.75 0 1 1 0 5.5 2.75 2.75 0 0 1 0-5.5Z" />
    </svg>
  );
}

/** Plus glyph — inline "add" affordances (columns, subtasks). */
export function PlusIcon({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="currentColor" aria-hidden>
      <path d="M8 2.5a.75.75 0 0 1 .75.75v4h4a.75.75 0 0 1 0 1.5h-4v4a.75.75 0 0 1-1.5 0v-4h-4a.75.75 0 0 1 0-1.5h4v-4A.75.75 0 0 1 8 2.5Z" />
    </svg>
  );
}

/** Drag handle (≡) — board settings row grip. */
export function DragHandleIcon({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="currentColor" aria-hidden>
      <circle cx="6" cy="4" r="1.2" />
      <circle cx="10" cy="4" r="1.2" />
      <circle cx="6" cy="8" r="1.2" />
      <circle cx="10" cy="8" r="1.2" />
      <circle cx="6" cy="12" r="1.2" />
      <circle cx="10" cy="12" r="1.2" />
    </svg>
  );
}

/** Back arrow glyph — the top-left "← Back" link on nested surfaces. */
export function BackArrowIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="currentColor" aria-hidden>
      <path d="M6.78 3.22a.75.75 0 0 1 0 1.06L3.81 7.25H13a.75.75 0 0 1 0 1.5H3.81l2.97 2.97a.75.75 0 0 1-1.06 1.06L1.47 8.53a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" />
    </svg>
  );
}

/** Check glyph — the "done" indicator on task children rows. */
export function CheckIcon({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="currentColor" aria-hidden>
      <path d="M13.28 4.22a.75.75 0 0 1 0 1.06l-6.5 6.5a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 1 1 1.06-1.06l2.47 2.47 5.97-5.97a.75.75 0 0 1 1.06 0Z" />
    </svg>
  );
}

/** Close glyph — the small ✕ used on removable chips (spec 14 label chip remove). */
export function CloseIcon({ size = 10 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="currentColor" aria-hidden>
      <path d="M4.28 3.22a.75.75 0 0 0-1.06 1.06L6.94 8l-3.72 3.72a.75.75 0 1 0 1.06 1.06L8 9.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L9.06 8l3.72-3.72a.75.75 0 0 0-1.06-1.06L8 6.94 4.28 3.22Z" />
    </svg>
  );
}

/** Eye glyph — the "Watch / Watching" toggle icon (spec 14 §Watchers Section). */
export function EyeIcon({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="currentColor" aria-hidden>
      <path d="M10 4C5.5 4 1.73 6.61.46 10 1.73 13.39 5.5 16 10 16s8.27-2.61 9.54-6C18.27 6.61 14.5 4 10 4Zm0 10.5c-3.31 0-6.19-1.85-7.32-4.5C3.81 7.35 6.69 5.5 10 5.5s6.19 1.85 7.32 4.5c-1.13 2.65-4.01 4.5-7.32 4.5Zm0-7.5A3 3 0 1 0 10 13a3 3 0 0 0 0-6Z" />
    </svg>
  );
}

/**
 * Star glyph — the read-only holiday marker on the Time Tracking calendar
 * (spec organization/03 requirement 10). A filled five-point star in
 * `currentColor`, so a cell tints it with `--holiday-ink`.
 */
export function StarIcon({ size = 12 }: { size?: number }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="currentColor" aria-hidden>
      <path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.5L10 14.11 5.06 16.71l.94-5.5-4-3.9 5.53-.8L10 1.5Z" />
    </svg>
  );
}

/**
 * Calendar glyph — the Holidays sidebar row and the Holidays empty state
 * (spec organization/03 §Screens). Line-drawn, not the mock's emoji: the design
 * system forbids emoji outright and the app ships none.
 */
export function CalendarIcon({ size = 19 }: { size?: number }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="currentColor" aria-hidden>
      <path d="M6.25 1.5a.75.75 0 0 1 .75.75v1h6v-1a.75.75 0 0 1 1.5 0v1h.75A2.25 2.25 0 0 1 17.5 5.5v10a2.25 2.25 0 0 1-2.25 2.25H4.75A2.25 2.25 0 0 1 2.5 15.5v-10A2.25 2.25 0 0 1 4.75 3.25h.75v-1a.75.75 0 0 1 .75-.75ZM4 8v7.5c0 .41.34.75.75.75h10.5c.41 0 .75-.34.75-.75V8H4Zm12-1.5v-1a.75.75 0 0 0-.75-.75H4.75a.75.75 0 0 0-.75.75v1h12ZM6 10h2.5v2H6v-2Zm4.75 0h2.5v2h-2.5v-2ZM6 13.25h2.5v2H6v-2Zm4.75 0h2.5v2h-2.5v-2Z" />
    </svg>
  );
}

/**
 * Money glyph — the Amounts Owed sidebar sub-row. A filled coin with a `$`
 * cutout, drawn from `currentColor` so the row's accent color tints it.
 */
export function MoneyIcon({ size = 19 }: { size?: number }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="currentColor" aria-hidden>
      <path d="M10 1.75a8.25 8.25 0 1 0 0 16.5 8.25 8.25 0 0 0 0-16.5Zm.75 3.5v.9c1.28.18 2.25.98 2.25 2.1a.75.75 0 0 1-1.5 0c0-.28-.42-.75-1.5-.75s-1.5.47-1.5.75c0 .28.42.75 1.5.75 1.6 0 3 .93 3 2.25 0 1.12-.97 1.92-2.25 2.1v.9a.75.75 0 0 1-1.5 0v-.9c-1.28-.18-2.25-.98-2.25-2.1a.75.75 0 0 1 1.5 0c0 .28.42.75 1.5.75s1.5-.47 1.5-.75c0-.28-.42-.75-1.5-.75-1.6 0-3-.93-3-2.25 0-1.12.97-1.92 2.25-2.1v-.9a.75.75 0 0 1 1.5 0Z" />
    </svg>
  );
}

/**
 * Chart / trendline glyph — the Time & Activity sidebar sub-row. Stroked
 * upward line + points, in `currentColor` for parity with the other stroked
 * icons in the shell.
 */
export function ChartIcon({ size = 19 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 15l4-4 3 3 6-7" />
      <path d="M14 7h3v3" />
    </svg>
  );
}

/**
 * The Documents section mark on the rail. The system exports a glyph for every section it
 * named itself and none for this one, because it never saw the area — so it is ours, drawn
 * in the same idiom as the marks it sits beside.
 */
export function DocumentsIcon() {
  return (
    <svg viewBox="0 0 18 22" width={19} height={19} fill="currentColor" aria-hidden>
      <path d="M2.25 22C1.6425 22 1.125 21.7838 0.695 21.3513C0.265 20.9188 0.05 20.3988 0.05 19.7913V2.20875C0.05 1.60125 0.265 1.08125 0.695 0.64875C1.125 0.21625 1.6425 0 2.25 0H11.05L17.95 6.9V19.7913C17.95 20.3988 17.735 20.9188 17.305 21.3513C16.875 21.7838 16.3575 22 15.75 22H2.25ZM10.3 7.7V1.65H2.25C2.1075 1.65 1.98 1.70938 1.8675 1.82813C1.755 1.94688 1.7 2.07437 1.7 2.21063V19.7894C1.7 19.9256 1.755 20.0531 1.8675 20.1719C1.98 20.2906 2.1075 20.35 2.25 20.35H15.75C15.8925 20.35 16.02 20.2906 16.1325 20.1719C16.245 20.0531 16.3 19.9256 16.3 19.7894V7.7H10.3ZM4.4 17.05H13.6V15.4H4.4V17.05ZM4.4 10.45H8.65V8.8H4.4V10.45ZM4.4 13.75H13.6V12.1H4.4V13.75Z" />
    </svg>
  );
}
