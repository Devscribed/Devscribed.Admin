'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Select } from '@/ds';
import { PlayIcon, StopIcon } from '@/layout/icons';
import { useRunningTimer, type StoppedTimeEntry } from '@/layout/running-timer-context';
import { TaskSelector, type TaskSelectorValue } from '@/task-selector/TaskSelector';
import { useToast } from '@/toast';
import {
  TIME_TRACKING_MESSAGES,
  formatDurationHuman,
  formatElapsed,
  timerStoppedToast,
} from '@devscribed/validation';
import { ConfirmDialog } from './ConfirmDialog';
import type { AssignableProject } from './types';

const NO_PROJECT = '';

/** Options for the project `Select`: a clearable "— No project —" plus the assignable list. */
function projectOptions(projects: AssignableProject[]): { value: string; label: string }[] {
  return [{ value: NO_PROJECT, label: '— No project —' }, ...projects.map((p) => ({ value: p.id, label: p.name }))];
}

/** Amber-primary treatment for "Start timer" — the DS ships no amber `Button` variant
 * (spec 12 DS gap), so this reuses the timer-amber tokens with high-contrast dark ink. */
const AMBER_BTN: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  height: 'var(--field-h)',
  padding: '0 20px',
  border: '1.5px solid var(--amber-500)',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--amber-500)',
  color: 'var(--ink-900)',
  fontFamily: 'var(--font-display)',
  fontWeight: 600,
  fontSize: 'var(--fs-15)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

/**
 * The quick-actions timer bar (spec 12 = `tt-timer-panel`), the mock's top placement. Two
 * states, both fed by the shared `RunningTimerProvider` so the topbar chip mirrors it:
 *  - **Idle:** project select + task + description + "+ Add entry" (opens the modal) +
 *    amber "▶ Start timer".
 *  - **Running:** a large ticking elapsed chip, the editable project/task/description
 *    (PUT on blur), "Discard" (confirm), and red "■ Stop & save".
 *
 * Spec 15 wires a task selector below the project select whenever the chosen project has
 * a board `key`. Selecting a task pins `taskId` on the request body and freezes the
 * task text input to the computed `{KEY}-{n}: {title}` label (FR-12); clearing (✕)
 * unlinks and leaves the free-text intact and editable (FR-6/FR-13).
 */
export function TimerBar({
  projects,
  orgId,
  onAddEntry,
  onChanged,
}: {
  projects: AssignableProject[];
  /** Org id for the task-search endpoint (spec 15). */
  orgId: string;
  /** Open the Add-Entry modal. */
  onAddEntry: () => void;
  /** A timer was stopped (new entry created) — refetch the active view. */
  onChanged: () => void;
}) {
  const { showToast } = useToast();
  const { timer, elapsedSeconds, start, update, stop, discard } = useRunningTimer();

  const options = projectOptions(projects);

  // Idle draft (also the seed for a freshly started timer).
  const [projectId, setProjectId] = useState<string>(NO_PROJECT);
  const [task, setTask] = useState('');
  const [description, setDescription] = useState('');
  const [taskSelection, setTaskSelection] = useState<TaskSelectorValue | null>(null);
  const [starting, setStarting] = useState(false);

  // Running-state editable copy, seeded from the timer and re-seeded when it changes
  // identity (e.g. after a refresh, or a start from elsewhere).
  const [runProjectId, setRunProjectId] = useState<string>(NO_PROJECT);
  const [runTask, setRunTask] = useState('');
  const [runDescription, setRunDescription] = useState('');
  const [runTaskSelection, setRunTaskSelection] = useState<TaskSelectorValue | null>(null);

  const [discardOpen, setDiscardOpen] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [stopping, setStopping] = useState(false);

  useEffect(() => {
    if (!timer) return;
    setRunProjectId(timer.projectId ?? NO_PROJECT);
    setRunTask(timer.task ?? '');
    setRunDescription(timer.description ?? '');
    // Spec 15 — hydrate the task-selector chip from the server-returned taskId +
    // taskKey (title is not on the timer payload, so the label snapshot doubles as
    // the display source: it is already the `{KEY}: {title}` string the chip renders
    // via key + title).
    if (timer.taskId && timer.taskKey) {
      setRunTaskSelection({
        id: timer.taskId,
        key: timer.taskKey,
        title: extractTitleFromLabel(timer.task, timer.taskKey),
        type: 'task',
      });
    } else {
      setRunTaskSelection(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer?.id, timer?.taskId, timer?.taskKey]);

  const idleProject = useMemo(
    () => projects.find((p) => p.id === projectId) ?? null,
    [projects, projectId],
  );
  const runProject = useMemo(
    () => projects.find((p) => p.id === runProjectId) ?? null,
    [projects, runProjectId],
  );

  async function handleStart(): Promise<void> {
    if (starting) return;
    setStarting(true);
    const result = await start({
      projectId: projectId || null,
      taskId: taskSelection?.id ?? null,
      // Server ignores `task` when taskId is set — omit it there so the intent is clear.
      task: taskSelection ? null : task.trim() || null,
      description: description.trim() || null,
    });
    setStarting(false);
    if (result.ok) {
      showToast('toast-timer-started', TIME_TRACKING_MESSAGES.toastTimerStarted);
      setProjectId(NO_PROJECT);
      setTask('');
      setDescription('');
      setTaskSelection(null);
      onChanged();
    } else if (result.conflict) {
      showToast('toast-timer-started', result.message ?? TIME_TRACKING_MESSAGES.timerAlreadyRunning, 'error');
    } else {
      showToast(
        'toast-timer-started',
        mapTaskErrorMessage(result.errorCode, result.errors, result.message),
        'error',
      );
    }
  }

  /** Persist the running timer's current metadata (PUT on blur). */
  function pushUpdate(next: {
    projectId?: string;
    task?: string;
    description?: string;
    /** Pass `undefined` to leave the current selection unchanged; pass `null` to
     * clear it explicitly (spec 15 FR-6/FR-13). */
    taskSelection?: TaskSelectorValue | null | undefined;
  }): void {
    const nextSelection =
      next.taskSelection === undefined ? runTaskSelection : next.taskSelection;
    const effectiveProjectId = (next.projectId ?? runProjectId) || null;
    // Spec 15 FR-14/FR-16 — changing the project after a task was selected clears the
    // task selection, because a task belongs to exactly one project.
    const shouldClearTask =
      next.projectId !== undefined &&
      nextSelection !== null &&
      nextSelection.id !== null &&
      // The project changed to something other than the task's project.
      // We don't know the task's projectId locally, but the selection was made for
      // the old projectId — safest to clear whenever the project changes.
      true &&
      next.projectId !== runProjectId;
    const finalSelection = shouldClearTask ? null : nextSelection;
    if (shouldClearTask) setRunTaskSelection(null);
    void update({
      projectId: effectiveProjectId,
      taskId: finalSelection?.id ?? null,
      task: finalSelection ? null : (next.task ?? runTask).trim() || null,
      description: (next.description ?? runDescription).trim() || null,
    });
  }

  async function handleStop(): Promise<void> {
    if (stopping) return;
    setStopping(true);
    const result = await stop();
    setStopping(false);
    if (result.ok && result.timeEntry) {
      const entry: StoppedTimeEntry = result.timeEntry;
      showToast('toast-timer-stopped', timerStoppedToast(formatDurationHuman(entry.durationMinutes)));
      onChanged();
    } else {
      showToast('toast-timer-stopped', TIME_TRACKING_MESSAGES.genericError, 'error');
    }
  }

  async function handleDiscardConfirm(): Promise<void> {
    if (discarding) return;
    setDiscarding(true);
    const result = await discard();
    setDiscarding(false);
    setDiscardOpen(false);
    if (result.ok) {
      showToast('toast-timer-discarded', TIME_TRACKING_MESSAGES.toastTimerDiscarded);
      onChanged();
    } else {
      showToast('toast-timer-discarded', TIME_TRACKING_MESSAGES.genericError, 'error');
    }
  }

  const running = timer !== null;
  // Spec 15 — the label shown in the read-only task field when a task is linked.
  const idleTaskDisplay = taskSelection
    ? `${taskSelection.key}: ${taskSelection.title}`
    : task;
  const runTaskDisplay = runTaskSelection
    ? `${runTaskSelection.key}: ${runTaskSelection.title}`
    : runTask;

  return (
    <>
      <div
        data-testid="tt-timer-panel"
        style={{
          background: running ? 'var(--tracker-bg)' : 'var(--bg-panel)',
          border: `1px solid ${running ? 'var(--tracker-border)' : 'var(--border)'}`,
          borderRadius: 'var(--radius-2xl)',
          padding: '14px 16px',
          marginBottom: 18,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 12,
        }}
      >
        {running ? (
          <>
            {/* Elapsed chip */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span
                aria-hidden
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: '50%',
                  background: 'var(--tracker)',
                  animation: 'tt-pulse 1.6s ease-in-out infinite',
                }}
              />
              <span
                data-testid="tt-timer-elapsed"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--fs-18)',
                  fontWeight: 600,
                  color: 'var(--amber-700)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {formatElapsed(elapsedSeconds)}
              </span>
            </div>

            <div style={{ minWidth: 180, flex: '1 1 180px' }}>
              <Select
                value={runProjectId}
                options={options}
                placeholder="Select project…"
                onChange={(value: string) => {
                  setRunProjectId(value);
                  pushUpdate({ projectId: value });
                }}
                data-testid="tt-timer-project-select"
              />
            </div>
            {/* Spec 15 — task selector, only when the project has a board key. */}
            {runProject && runProject.key && (
              <div style={{ minWidth: 200, flex: '1 1 220px' }}>
                <TaskSelector
                  orgId={orgId}
                  projectId={runProject.id}
                  projectName={runProject.name}
                  projectKey={runProject.key}
                  testIdPrefix="tt-timer"
                  value={runTaskSelection}
                  onChange={(next) => {
                    // Spec 15 FR-6/FR-13 — clearing the link preserves the computed
                    // label as editable free-text in the `task` field.
                    if (next === null && runTaskSelection) {
                      setRunTask(`${runTaskSelection.key}: ${runTaskSelection.title}`);
                    }
                    setRunTaskSelection(next);
                    pushUpdate({ taskSelection: next });
                  }}
                />
              </div>
            )}
            <div style={{ minWidth: 160, flex: '1 1 160px' }}>
              <Input
                value={runTaskDisplay}
                placeholder="What are you working on?"
                onChange={(e: { target: { value: string } }) => {
                  if (runTaskSelection) return; // readOnly when a task is linked
                  setRunTask(e.target.value);
                }}
                onBlur={() => {
                  if (!runTaskSelection) pushUpdate({});
                }}
                readOnly={runTaskSelection !== null}
                data-testid="tt-timer-task-input"
                wrapperStyle={{ gap: 0 }}
              />
            </div>
            <div style={{ minWidth: 160, flex: '1 1 200px' }}>
              <Input
                value={runDescription}
                placeholder="Description"
                onChange={(e: { target: { value: string } }) => setRunDescription(e.target.value)}
                onBlur={() => pushUpdate({})}
                data-testid="tt-timer-description-input"
                wrapperStyle={{ gap: 0 }}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
              <Button
                variant="ghost"
                onClick={() => setDiscardOpen(true)}
                data-testid="tt-timer-discard-btn"
              >
                Discard
              </Button>
              <Button
                variant="danger"
                loading={stopping}
                onClick={() => void handleStop()}
                data-testid="tt-timer-stop-btn"
              >
                <StopIcon /> Stop &amp; save
              </Button>
            </div>
          </>
        ) : (
          <>
            <div style={{ minWidth: 180, flex: '1 1 180px' }}>
              <Select
                value={projectId}
                options={options}
                placeholder="Select project…"
                onChange={(value: string) => {
                  setProjectId(value);
                  // Spec 15 FR-14/FR-16 — clearing/changing the project clears the
                  // task selection (a task belongs to exactly one project); the
                  // free-text `task` retains its current value and stays editable.
                  setTaskSelection(null);
                }}
                data-testid="tt-timer-project-select"
              />
            </div>
            {/* Spec 15 — task selector, only when the project has a board key. */}
            {idleProject && idleProject.key && (
              <div style={{ minWidth: 200, flex: '1 1 220px' }}>
                <TaskSelector
                  orgId={orgId}
                  projectId={idleProject.id}
                  projectName={idleProject.name}
                  projectKey={idleProject.key}
                  testIdPrefix="tt-timer"
                  value={taskSelection}
                  onChange={(next) => {
                    // Spec 15 FR-6/FR-13 — clearing the link preserves the computed
                    // label as editable free-text in the `task` field.
                    if (next === null && taskSelection) {
                      setTask(`${taskSelection.key}: ${taskSelection.title}`);
                    }
                    setTaskSelection(next);
                  }}
                />
              </div>
            )}
            <div style={{ minWidth: 160, flex: '1 1 160px' }}>
              <Input
                value={idleTaskDisplay}
                placeholder="What are you working on?"
                onChange={(e: { target: { value: string } }) => {
                  if (taskSelection) return; // readOnly when a task is linked
                  setTask(e.target.value);
                }}
                readOnly={taskSelection !== null}
                data-testid="tt-timer-task-input"
                wrapperStyle={{ gap: 0 }}
              />
            </div>
            <div style={{ minWidth: 160, flex: '1 1 200px' }}>
              <Input
                value={description}
                placeholder="Description"
                onChange={(e: { target: { value: string } }) => setDescription(e.target.value)}
                data-testid="tt-timer-description-input"
                wrapperStyle={{ gap: 0 }}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
              <Button variant="ghost" onClick={onAddEntry} data-testid="tt-add-entry-btn">
                + Add entry
              </Button>
              <button
                type="button"
                onClick={() => void handleStart()}
                disabled={starting}
                data-testid="tt-timer-start-btn"
                style={{ ...AMBER_BTN, opacity: starting ? 0.55 : 1, cursor: starting ? 'progress' : 'pointer' }}
              >
                <PlayIcon /> Start timer
              </button>
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={discardOpen}
        title="Discard timer"
        message={TIME_TRACKING_MESSAGES.discardConfirm}
        confirmLabel="Discard"
        busy={discarding}
        onConfirm={() => void handleDiscardConfirm()}
        onClose={() => setDiscardOpen(false)}
      />
    </>
  );
}

/**
 * Server task-link error → translated toast text (spec 15 §Error Messages). Falls back
 * to whatever message the API returned, and finally to the generic error.
 */
function mapTaskErrorMessage(
  code: string | null | undefined,
  errors: Record<string, string> | null | undefined,
  message: string | null | undefined,
): string {
  if (errors && typeof errors.taskId === 'string' && errors.taskId.length > 0) {
    return errors.taskId;
  }
  switch (code) {
    case 'task_requires_project':
      return TIME_TRACKING_MESSAGES.taskRequiresProject;
    case 'task_wrong_project':
      return TIME_TRACKING_MESSAGES.taskWrongProject;
    case 'task_not_found':
      return TIME_TRACKING_MESSAGES.taskLinkNotFound;
    case 'task_project_not_assigned':
      return TIME_TRACKING_MESSAGES.taskProjectNotAssigned;
    default:
      return message ?? TIME_TRACKING_MESSAGES.genericError;
  }
}

/**
 * Given the server-snapshot `task` label ("MOB-5: Fix login bug") and the `taskKey`
 * ("MOB-5"), pull out the title portion for the chip's title slot. If the label
 * doesn't start with the key + ": ", fall back to the whole label.
 */
function extractTitleFromLabel(
  label: string | null,
  taskKey: string,
): string {
  if (!label) return '';
  const prefix = `${taskKey}: `;
  if (label.startsWith(prefix)) return label.slice(prefix.length);
  return label;
}
