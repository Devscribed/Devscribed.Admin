'use client';

/**
 * Spec 13 §Task type icon system + §Priority icon system. Maps the enums to icon
 * components and their ink colors. Meridian's house rule: no blue anywhere, so
 * `task` uses the same teal as spec 12's project-color palette (see design's DS gaps).
 */

import type { TaskPriority, TaskType } from '@devscribed/validation';
import type { ReactNode } from 'react';
import {
  BugIcon,
  EpicIcon,
  PriorityCriticalIcon,
  PriorityHighIcon,
  PriorityLowIcon,
  PriorityMediumIcon,
  StoryIcon,
  SubtaskIcon,
  TaskTypeIcon,
} from '@/layout/icons';

export const TASK_TYPE_COLOR: Record<TaskType, string> = {
  epic: 'var(--accent)',
  task: 'oklch(0.55 0.11 180)',
  bug: 'var(--error-500)',
  story: 'var(--success-500)',
  subtask: 'var(--text-muted)',
};

export const TASK_TYPE_LABEL: Record<TaskType, string> = {
  epic: 'Epic',
  task: 'Task',
  bug: 'Bug',
  story: 'Story',
  subtask: 'Subtask',
};

export function TaskTypeGlyph({ type, size = 16 }: { type: TaskType; size?: number }) {
  const Comp: (p: { size?: number }) => ReactNode =
    type === 'epic'
      ? EpicIcon
      : type === 'task'
        ? TaskTypeIcon
        : type === 'bug'
          ? BugIcon
          : type === 'story'
            ? StoryIcon
            : SubtaskIcon;
  return (
    <span
      aria-hidden
      style={{ color: TASK_TYPE_COLOR[type], display: 'inline-flex', lineHeight: 0 }}
    >
      <Comp size={size} />
    </span>
  );
}

export const PRIORITY_COLOR: Record<TaskPriority, string> = {
  low: 'var(--success-500)',
  medium: 'var(--amber-700)',
  high: 'var(--error-400)',
  critical: 'var(--error-500)',
};

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

export function PriorityGlyph({
  priority,
  size = 14,
}: {
  priority: TaskPriority | null;
  size?: number;
}) {
  if (priority === null) {
    return (
      <span aria-hidden style={{ color: 'var(--text-faint)', fontSize: 'var(--fs-13)' }}>
        —
      </span>
    );
  }
  const Comp: (p: { size?: number }) => ReactNode =
    priority === 'low'
      ? PriorityLowIcon
      : priority === 'medium'
        ? PriorityMediumIcon
        : priority === 'high'
          ? PriorityHighIcon
          : PriorityCriticalIcon;
  return (
    <span
      aria-hidden
      style={{ color: PRIORITY_COLOR[priority], display: 'inline-flex', lineHeight: 0 }}
    >
      <Comp size={size} />
    </span>
  );
}

/** Border color for a column header rule based on category. */
export function columnCategoryBorder(category: string): string {
  switch (category) {
    case 'in_progress':
      return 'var(--accent)';
    case 'done':
      return 'var(--success-500)';
    default:
      return 'var(--border-strong)';
  }
}

/** Formats a due date like "Sep 15" from an ISO date string. */
export function formatDueDateShort(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Formats a longer date like "Aug 25, 2026". */
export function formatDateLong(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Is an ISO 'YYYY-MM-DD' due date already past? */
export function isOverdueISO(iso: string): boolean {
  const today = new Date();
  const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return iso < todayISO;
}

export function initialsOfMember(a: { firstName: string; lastName: string }): string {
  return `${a.firstName[0] ?? ''}${a.lastName[0] ?? ''}`.toUpperCase();
}
