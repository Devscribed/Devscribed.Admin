'use client';

/**
 * Meridian ships no icon library — the app template carries its glyphs as raw paths in
 * one `P` dictionary. These are lifted verbatim from
 * `1_DS for dev/templates/meridian-app/MeridianApp.dc.html` so the shell stays on-brand:
 * geometric, filled with `currentColor`, no strokes.
 */

export function PeopleIcon() {
  return (
    <svg viewBox="0 0 24 16" width={19} height={19} fill="currentColor" aria-hidden>
      <path d="M1.69995 16C1.48328 16 1.30412 15.9291 1.16245 15.7875C1.02078 15.6458 0.949951 15.4666 0.949951 15.25V13.65C0.949951 13.0666 1.09995 12.5375 1.39995 12.0625C1.69995 11.5875 2.11662 11.2333 2.64995 11C3.86662 10.4666 4.96245 10.0833 5.93745 9.84998C6.91245 9.61664 7.91662 9.49998 8.94995 9.49998C9.98328 9.49998 10.9833 9.61664 11.95 9.84998C12.9166 10.0833 14.0083 10.4666 15.225 11C15.7583 11.2333 16.1791 11.5875 16.4875 12.0625C16.7958 12.5375 16.95 13.0666 16.95 13.65V15.25C16.95 15.4666 16.8791 15.6458 16.7375 15.7875C16.5958 15.9291 16.4166 16 16.2 16H1.69995ZM17.9 16C18.0666 15.9666 18.1999 15.8791 18.2999 15.7375C18.4 15.5958 18.45 15.4166 18.45 15.2V13.65C18.45 12.6 18.1833 11.7375 17.65 11.0625C17.1166 10.3875 16.4166 9.84164 15.55 9.42498C16.7 9.55831 17.7833 9.75414 18.7999 10.0125C19.8166 10.2708 20.6416 10.5666 21.275 10.9C21.8249 11.2166 22.2583 11.6083 22.575 12.075C22.8916 12.5416 23.0499 13.0666 23.0499 13.65V15.25C23.0499 15.4666 22.9791 15.6458 22.8375 15.7875C22.6958 15.9291 22.5166 16 22.2999 16H17.9ZM8.94995 7.97498C7.84995 7.97498 6.94995 7.62498 6.24995 6.92498C5.54995 6.22498 5.19995 5.32498 5.19995 4.22498C5.19995 3.12498 5.54995 2.22498 6.24995 1.52498C6.94995 0.824976 7.84995 0.474976 8.94995 0.474976C10.05 0.474976 10.95 0.824976 11.65 1.52498C12.35 2.22498 12.7 3.12498 12.7 4.22498C12.7 5.32498 12.35 6.22498 11.65 6.92498C10.95 7.62498 10.05 7.97498 8.94995 7.97498ZM17.95 4.22498C17.95 5.32498 17.6 6.22498 16.9 6.92498C16.2 7.62498 15.3 7.97498 14.2 7.97498C14.0166 7.97498 13.8125 7.96248 13.5875 7.93748C13.3625 7.91248 13.1583 7.86664 12.975 7.79998C13.375 7.38331 13.6791 6.87081 13.8875 6.26248C14.0958 5.65414 14.2 4.97498 14.2 4.22498C14.2 3.47498 14.0958 2.81248 13.8875 2.23748C13.6791 1.66248 13.375 1.13331 12.975 0.649976C13.1583 0.599976 13.3625 0.558309 13.5875 0.524976C13.8125 0.491642 14.0166 0.474976 14.2 0.474976C15.3 0.474976 16.2 0.824976 16.9 1.52498C17.6 2.22498 17.95 3.12498 17.95 4.22498Z" />
    </svg>
  );
}

/**
 * Inbox/tray glyph for the sidebar "Requests" row (spec 10). Meridian ships no icon
 * export beyond the members glyph, so this is a simple geometric tray — an open box with
 * a downward notch — drawn with `currentColor` fills to sit alongside `PeopleIcon`.
 */
export function InboxIcon() {
  return (
    <svg viewBox="0 0 20 20" width={19} height={19} fill="currentColor" aria-hidden>
      <path d="M4 2.5a1.75 1.75 0 0 0-1.62 1.09L.6 8.02A2 2 0 0 0 .45 8.77V15A2.5 2.5 0 0 0 2.95 17.5H17.05A2.5 2.5 0 0 0 19.55 15V8.77a2 2 0 0 0-.15-.75L17.62 3.59A1.75 1.75 0 0 0 16 2.5H4Zm0 1.5H16a.25.25 0 0 1 .23.16L17.8 8H13.5a1 1 0 0 0-1 1 2.5 2.5 0 0 1-5 0 1 1 0 0 0-1-1H2.2l1.57-3.84A.25.25 0 0 1 4 4Z" />
    </svg>
  );
}

/**
 * Folder/tray glyph for the sidebar "Projects" row (spec 11). Meridian ships no folder
 * icon, so this is a simple filled folder-with-tab drawn with `currentColor` to sit
 * alongside `PeopleIcon`/`InboxIcon` — geometric, no strokes.
 */
export function FolderIcon() {
  return (
    <svg viewBox="0 0 20 20" width={19} height={19} fill="currentColor" aria-hidden>
      <path d="M2.5 5.5A1.75 1.75 0 0 1 4.25 3.75h2.84c.46 0 .9.18 1.24.51l1.06 1.06c.05.05.11.07.18.07h6.18A1.75 1.75 0 0 1 17.5 7.22V14.5A1.75 1.75 0 0 1 15.75 16.25H4.25A1.75 1.75 0 0 1 2.5 14.5V5.5Zm1.75-.25a.25.25 0 0 0-.25.25V7.5h12.5v-.28A.25.25 0 0 0 15.75 6.97H9.57c-.46 0-.9-.18-1.24-.51L7.27 5.4a.25.25 0 0 0-.18-.07H4.25Z" />
    </svg>
  );
}

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

/**
 * Clock glyph for the sidebar "Time Tracking" row (spec 12). The design's carried icon
 * gap — Meridian ships no clock — so this is the mock's stroked circle-with-hands
 * (`<circle r=7>` + `M10 6v4l3 2`), drawn with `currentColor` strokes to sit beside the
 * other shell glyphs.
 */
export function ClockIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width={19}
      height={19}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4l3 2" />
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
