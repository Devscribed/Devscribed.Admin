'use client';

/**
 * Spec 13 §Task type icon system + §Priority icon system. Maps the enums to icon
 * components and their ink colors.
 *
 * The house rule this file used to state — *no blue anywhere* — was the previous design's, and
 * it is the opposite of this one's: blue is the action colour here, and `task`, the default
 * type, is the one that should wear it.
 *
 * Two of these maps are **status** and one is **category**, and they are painted differently on
 * purpose. Priority runs low → critical, which is a scale of how badly something is going, so
 * it takes the status palette. A task's *type* is a label on an object (§59) — a bug is not
 * worse than a story — so those hues say only "not the one next to it", except `bug`, which
 * genuinely is the one thing on a board that reports something wrong.
 *
 * This module is Phase 6's, and it is repainted here because Phase 4 renders two of its
 * exports: the task selector draws `TaskTypeGlyph` and `TASK_TYPE_COLOR` inside the timer bar
 * and the entry modal. Leaving the other half in the previous design's tokens would be a file
 * half-repainted, which is worse than either state.
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
  epic: 'oklch(0.5 0.2 300)',
  task: 'var(--color-blue)',
  bug: 'var(--status-error)',
  story: 'oklch(0.58 0.11 160)',
  subtask: 'var(--text-secondary)',
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
  low: 'var(--status-success)',
  medium: 'var(--status-warning)',
  high: 'var(--status-error)',
  critical: 'var(--status-error)',
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
      <span aria-hidden style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)' }}>
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
      return 'var(--color-blue)';
    case 'done':
      return 'var(--status-success)';
    default:
      return 'var(--border-default)';
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
