'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Spinner } from '@/ds';
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
      <div
        ref={rootRef}
        data-testid={`${testIdPrefix}-task-selector`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 'var(--sp-2)',
          padding: '0 var(--sp-3)',
          height: 'var(--field-h)',
          border: '1.5px solid var(--border-strong)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-panel)',
          maxWidth: '100%',
          minWidth: 0,
          width: '100%',
        }}
      >
        <TaskTypeGlyph type={value.type} size={14} />
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--fs-13)',
            color: 'var(--text-muted)',
            whiteSpace: 'nowrap',
          }}
        >
          {value.key}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-text)',
            fontSize: 'var(--fs-14)',
            color: 'var(--text)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            flex: 1,
            minWidth: 0,
          }}
        >
          {value.title}
        </span>
        <button
          type="button"
          onClick={clearTask}
          disabled={disabled}
          data-testid={`${testIdPrefix}-task-clear-btn`}
          aria-label="Clear task selection"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 22,
            height: 22,
            border: 'none',
            background: 'transparent',
            color: 'var(--text-muted)',
            cursor: disabled ? 'not-allowed' : 'pointer',
            padding: 0,
            fontSize: 'var(--fs-14)',
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      data-testid={`${testIdPrefix}-task-selector`}
      style={{ position: 'relative', width: '100%' }}
    >
      <input
        ref={inputRef}
        type="text"
        value={query}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        data-testid={`${testIdPrefix}-task-search-input`}
        style={{
          height: 'var(--field-h)',
          width: '100%',
          border: '1.5px solid var(--border-strong)',
          borderRadius: 'var(--radius-lg)',
          padding: '0 var(--sp-3)',
          fontFamily: 'var(--font-text)',
          fontSize: 'var(--fs-14)',
          color: 'var(--text)',
          background: 'var(--bg-field)',
          outline: 'none',
          opacity: disabled ? 0.55 : 1,
          cursor: disabled ? 'not-allowed' : 'text',
        }}
      />
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 40,
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-pop)',
            maxHeight: 280,
            overflowY: 'auto',
          }}
        >
          {loading && (results === null || results.length === 0) ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--sp-2)',
                padding: 'var(--sp-3)',
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-text)',
                fontSize: 'var(--fs-13)',
              }}
            >
              <Spinner size={14} />
              Loading…
            </div>
          ) : results !== null && results.length === 0 ? (
            <div
              style={{
                padding: 'var(--sp-3)',
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-text)',
                fontSize: 'var(--fs-13)',
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
                  gap: 'var(--sp-2)',
                  width: '100%',
                  padding: '6px var(--sp-3)',
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
                    borderRadius: '50%',
                    background: TASK_TYPE_COLOR[task.type],
                    flexShrink: 0,
                  }}
                />
                <TaskTypeGlyph type={task.type} size={14} />
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--fs-12)',
                    color: 'var(--text-muted)',
                    minWidth: 60,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {task.key}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-text)',
                    fontSize: 'var(--fs-14)',
                    color: 'var(--text)',
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
