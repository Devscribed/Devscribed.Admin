'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Chip, Preloader, TextInput } from '@devscribed/ds';
import { TASK_TYPE_COLOR, TaskTypeGlyph } from '../../app/org/[orgId]/projects/[projectId]/kanban/visual';
import {
  TIME_TRACKING_MESSAGES,
  TASK_SEARCH_LIMIT,
  taskSelectorPlaceholder,
  type TaskType,
} from '@devscribed/validation';

/**
 * A task the selector can hold, matching the `GET .../tasks/search` row shape and
 * the subset the timer / entry-modal need to render the chip + persist the link.
 */
export interface TaskSelectorValue {
  id: string;
  key: string;
  title: string;
  type: TaskType;
}

interface TaskSelectorProps {
  orgId: string;
  projectId: string;
  projectName: string;
  /** The project's board `key`, or null when it has none. When null the selector
   * renders nothing (spec 15 FR-15). */
  projectKey: string | null;
  /** Testid prefix per §Required data-testid Attributes (`tt-timer` / `tt-entry`). */
  testIdPrefix: string;
  value: TaskSelectorValue | null;
  onChange: (next: TaskSelectorValue | null) => void;
  disabled?: boolean;
}

interface SearchResponse {
  tasks: TaskSelectorValue[];
}

const DEBOUNCE_MS = 250;

/**
 * Spec 15 — a shared task-picker used inside the Timer panel and the Add/Edit
 * Time Entry modal. Hidden when the selected project has no board `key`
 * (FR-15); otherwise renders a debounced search input backed by
 * `GET .../projects/{projectId}/tasks/search`, then swaps to a compact chip
 * with a ✕ clear affordance once a task is chosen (FR-12/FR-13).
 *
 * The parent owns the paired `taskId` state on the request body — this
 * component only mediates the search UI and reports selection changes.
 *
 * **Not a `Select`, and the reason is mechanical rather than effort.** `Select` (§21) owns its
 * own query and filters the `options` it is handed against each option's *label*. These rows
 * arrive already filtered, by a server that matched a task's **key** or its **title**
 * separately and that answers an empty query with the recently-updated set — so handing them
 * to `Select` would filter them a second time against `{KEY}: {title}` and drop rows the
 * server had just chosen. The one behaviour that defines the control is the wrong one here,
 * which is the same shape of argument that kept `ColumnsPicker` out of `Select isMulti`.
 *
 * What is the system's is everything inside it: `Chip` (§20, §37) is the chosen state, the
 * search is a `TextInput` (§3), and `Preloader` (§23) is what waiting looks like. Only the
 * panel and its outside-click are local.
 */
export function TaskSelector({
  orgId,
  projectId,
  projectName,
  projectKey,
  testIdPrefix,
  value,
  onChange,
  disabled = false,
}: TaskSelectorProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TaskSelectorValue[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const placeholder = useMemo(
    () => taskSelectorPlaceholder(projectName),
    [projectName],
  );

  // Debounced fetch. Empty query returns recently-updated tasks (spec 15 §API
  // Contracts). Cancelled and re-fired on every keystroke.
  useEffect(() => {
    if (!open || value !== null || projectKey == null) return;
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const url = new URL(
          `/api/organizations/${orgId}/projects/${projectId}/tasks/search`,
          window.location.origin,
        );
        if (query.trim().length > 0) url.searchParams.set('q', query.trim());
        const response = await fetch(url.pathname + url.search, {
          credentials: 'same-origin',
        });
        if (cancelled) return;
        if (response.ok) {
          const data = (await response.json()) as SearchResponse;
          setResults((data.tasks ?? []).slice(0, TASK_SEARCH_LIMIT));
        } else {
          setResults([]);
        }
      } catch {
        if (!cancelled) setResults([]);
      }
      if (!cancelled) setLoading(false);
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [orgId, projectId, projectKey, query, open, value]);

  // Close the dropdown on outside click. The chip state has nothing to close.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Projects without a board key never render the selector (spec 15 FR-15).
  if (projectKey == null) return null;

  function selectTask(task: TaskSelectorValue): void {
    onChange(task);
    setOpen(false);
    setQuery('');
    setResults(null);
  }

  function clearTask(): void {
    onChange(null);
    // Refocus the search so keyboard users are not stranded (spec 15 §UI Description).
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  if (value) {
    return (
      /* One chosen thing with a way to drop it — which is `Chip`, word for word (§20). The
         key travels in `leading` beside the type glyph rather than inside the label, because
         §37's label span ellipsises to one line and the key is the half that must not be the
         half that disappears. */
      <Chip
        data-testid={`${testIdPrefix}-task-selector`}
        label={value.title}
        leading={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', paddingRight: 'var(--space-2)' }}>
            <TaskTypeGlyph type={value.type} size={14} />
            <span style={{ fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              {value.key}
            </span>
          </span>
        }
        onRemove={clearTask}
        removeDisabled={disabled}
        removeLabel="Clear task selection"
        removeTestId={`${testIdPrefix}-task-clear-btn`}
        style={{ margin: 0, maxWidth: '100%', minWidth: 0 }}
      />
    );
  }

  return (
    <div
      ref={rootRef}
      data-testid={`${testIdPrefix}-task-selector`}
      style={{ position: 'relative', width: '100%' }}
    >
      <TextInput
        ref={inputRef}
        value={query}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        data-testid={`${testIdPrefix}-task-search-input`}
      />
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 40,
            background: 'var(--surface-overlay)',
            border: 'var(--border-width-hairline) solid var(--border-default)',
            borderRadius: 'var(--radius-m)',
            boxShadow: 'var(--shadow-popover)',
            maxHeight: 280,
            overflowY: 'auto',
          }}
        >
          {loading && (results === null || results.length === 0) ? (
            <div
              role="status"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                padding: 'var(--space-3)',
                color: 'var(--text-secondary)',
                fontSize: 'var(--font-size-xs)',
              }}
            >
              <Preloader size={6} margin={2} />
              Loading…
            </div>
          ) : results !== null && results.length === 0 ? (
            <div
              style={{
                padding: 'var(--space-3)',
                color: 'var(--text-secondary)',
                fontSize: 'var(--font-size-xs)',
              }}
            >
              {TIME_TRACKING_MESSAGES.taskSelectorNoMatches}
            </div>
          ) : (
            (results ?? []).map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => selectTask(task)}
                data-testid={`${testIdPrefix}-task-option-${task.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  width: '100%',
                  padding: 'var(--space-2) var(--space-3)',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 8,
                    height: 8,
                    borderRadius: 'var(--radius-circle)',
                    background: TASK_TYPE_COLOR[task.type],
                    flexShrink: 0,
                  }}
                />
                <TaskTypeGlyph type={task.type} size={14} />
                <span
                  style={{
                    fontFamily: 'var(--font-family-mono)',
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--text-secondary)',
                    minWidth: 60,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {task.key}
                </span>
                <span
                  style={{
                    fontSize: 'var(--font-size-s)',
                    color: 'var(--text-primary)',
                    flex: 1,
                    minWidth: 0,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {task.title}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
