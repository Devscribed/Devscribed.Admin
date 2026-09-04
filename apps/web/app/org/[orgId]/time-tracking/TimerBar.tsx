'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, ConfirmDialog, Select, Switch, TextInput } from '@devscribed/ds';
import { PlayIcon, StopIcon } from '@/layout/icons';
import { useRunningTimer, type StoppedTimeEntry } from '@/layout/running-timer-context';
import { useSession } from '@/layout/session-context';
import { TaskSelector, type TaskSelectorValue } from '@/task-selector/TaskSelector';
import { optionFor, valueOf } from '@/select';
import { useToast } from '@/toast';
import {
  TIME_TRACKING_MESSAGES,
  formatDurationHuman,
  formatElapsed,
  formatWallClockInTz,
  timerStoppedToast,
} from '@devscribed/validation';
import type { AssignableProject } from './types';

const NO_PROJECT = '';

/** Options for the project `Select`: a clearable "— No project —" plus the assignable list. */
function projectOptions(projects: AssignableProject[]): { value: string; label: string }[] {
  return [{ value: NO_PROJECT, label: '— No project —' }, ...projects.map((p) => ({ value: p.id, label: p.name }))];
}

/**
 * The quick-actions timer bar (spec 12 = `tt-timer-panel`). Two states, both fed by the shared
 * `RunningTimerProvider` so the bar's pill and the floating tracker mirror it:
 *  - **Idle:** project select + task + description + "+ Add entry" (opens the modal) +
 *    "▶ Start timer".
 *  - **Running:** a ticking elapsed readout, the editable project/task/description
 *    (PUT on blur), "Discard" (confirm), and "■ Stop & save".
 *
 * **"Start timer" is the primary action, not an amber one.** It was amber because the mock's
 * accent was violet and the timer had to stand apart from it; here the accent *is* the action
 * colour, and the bar's one committing control is what `variant="primary"` names.
 *
 * `--color-tracker-blue` is spent on the *running readout* rather than on any button: the
 * clock, the dot beside it, and the panel's own edge while a timer is running. That is the
 * colour `MiniTracker` already paints its counter with, so the clock in this bar and the clock
 * in the bar above it are the same number in the same ink — which is the whole claim the two
 * of them make about being one timer.
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
  const session = useSession();
  const tz =
    session.account.timezone && session.account.timezone.trim().length > 0
      ? session.account.timezone
      : 'UTC';
  const { timer, elapsedSeconds, start, update, stop, discard } = useRunningTimer();

  const options = projectOptions(projects);

  // Idle draft (also the seed for a freshly started timer).
  const [projectId, setProjectId] = useState<string>(NO_PROJECT);
  const [task, setTask] = useState('');
  const [description, setDescription] = useState('');
  const [taskSelection, setTaskSelection] = useState<TaskSelectorValue | null>(null);
  // Spec 16 FR-4 — the running-timer bar defaults to billable=true on start.
  const [idleBillable, setIdleBillable] = useState(true);
  const [starting, setStarting] = useState(false);

  // Running-state editable copy, seeded from the timer and re-seeded when it changes
  // identity (e.g. after a refresh, or a start from elsewhere).
  const [runProjectId, setRunProjectId] = useState<string>(NO_PROJECT);
  const [runTask, setRunTask] = useState('');
  const [runDescription, setRunDescription] = useState('');
  const [runTaskSelection, setRunTaskSelection] = useState<TaskSelectorValue | null>(null);
  // Spec 16 FR-3/FR-13 — the running-state toggle mirrors the server; a click PATCHes.
  const [runBillable, setRunBillable] = useState(true);

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
    // Spec 16 — hydrate the running-state toggle from the server response. Missing
    // (from a legacy server) counts as billable.
    setRunBillable(timer.billable !== false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer?.id, timer?.taskId, timer?.taskKey, timer?.billable]);

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
      billable: idleBillable,
    });
    setStarting(false);
    if (result.ok) {
      showToast('toast-timer-started', TIME_TRACKING_MESSAGES.toastTimerStarted);
      setProjectId(NO_PROJECT);
      setTask('');
      setDescription('');
      setTaskSelection(null);
      setIdleBillable(true);
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
      billable: runBillable,
    });
  }

  /** Spec 16 FR-3/FR-13 — flip the running timer's billable state and PATCH. Optimistic
   * update: the local switch flips immediately; a failed server write is reconciled by
   * the next timer refresh (the shared context is the source of truth for the timer). */
  function toggleRunningBillable(next: boolean): void {
    setRunBillable(next);
    void update({
      projectId: runProjectId || null,
      taskId: runTaskSelection?.id ?? null,
      task: runTaskSelection ? null : runTask.trim() || null,
      description: runDescription.trim() || null,
      billable: next,
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
          background: 'var(--surface-card)',
          // The edge is what says the bar is live: `--border-width-control` in the tracker's
          // own blue while a timer runs, the hairline every card takes when it does not.
          border: running
            ? 'var(--border-width-control) solid var(--color-tracker-blue)'
            : 'var(--border-width-hairline) solid var(--border-default)',
          borderRadius: 'var(--radius-l)',
          padding: 'var(--space-5) var(--space-6)',
          marginBottom: 'var(--space-6)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 'var(--space-5)',
        }}
      >
        {running ? (
          <>
            {/* Elapsed chip */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-3)', flexShrink: 0 }}>
              <span
                aria-hidden
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 'var(--radius-circle)',
                  background: 'var(--color-tracker-blue)',
                  // The keyframes are in `globals.css`, not appended to `<head>` from here —
                  // §69's rule, and the reason this dot was static: `tt-pulse` was named at
                  // this call site and defined nowhere, so it has never once pulsed.
                  animation: 'tt-pulse 1.6s var(--ease-standard) infinite',
                }}
              />
              <span
                data-testid="tt-timer-elapsed"
                style={{
                  // §77 — a clock is a number, and a number that has to line up takes
                  // tabular figures on the base family rather than a second, monospace one.
                  fontSize: 'var(--font-size-l)',
                  fontWeight: 'var(--font-weight-semibold)',
                  color: 'var(--color-tracker-blue)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {formatElapsed(elapsedSeconds)}
              </span>
              {/* Spec 16 §Layout — a status line next to the elapsed chip. Reads
                  "Non-billable · started HH:MM" when off, "started HH:MM" when on. */}
              <span
                data-testid="running-timer-status-line"
                style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}
              >
                {runBillable ? '' : 'Non-billable · '}started{' '}
                {timer ? formatWallClockInTz(timer.startedAt, tz) : ''}
              </span>
            </div>

            <div style={{ minWidth: 180, flex: '1 1 180px' }}>
              <Select
                value={optionFor(options, runProjectId)}
                options={options}
                placeholder="Select project…"
                onChange={(option) => {
                  const value = valueOf(option);
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
              <TextInput
                value={runTaskDisplay}
                placeholder="What are you working on?"
                aria-label="Task"
                onChange={(e) => {
                  if (runTaskSelection) return; // readOnly when a task is linked
                  setRunTask(e.target.value);
                }}
                onBlur={() => {
                  if (!runTaskSelection) pushUpdate({});
                }}
                readOnly={runTaskSelection !== null}
                data-testid="tt-timer-task-input"
              />
            </div>
            <div style={{ minWidth: 160, flex: '1 1 200px' }}>
              <TextInput
                value={runDescription}
                placeholder="Description"
                aria-label="Description"
                onChange={(e) => setRunDescription(e.target.value)}
                onBlur={() => pushUpdate({})}
                data-testid="tt-timer-description-input"
              />
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-3)', marginLeft: 'auto', alignItems: 'center' }}>
              {/* Spec 16 §Layout — inline billable toggle before Stop. */}
              <Switch
                checked={runBillable}
                onChange={toggleRunningBillable}
                label="Billable"
                data-testid="running-timer-billable-toggle"
              />
              <Button onClick={() => setDiscardOpen(true)} data-testid="tt-timer-discard-btn">
                Discard
              </Button>
              <Button
                variant="delete"
                icon={<StopIcon />}
                preloader={stopping}
                onClick={() => void handleStop()}
                data-testid="tt-timer-stop-btn"
              >
                Stop &amp; save
              </Button>
            </div>
          </>
        ) : (
          <>
            <div style={{ minWidth: 180, flex: '1 1 180px' }}>
              <Select
                value={optionFor(options, projectId)}
                options={options}
                placeholder="Select project…"
                onChange={(option) => {
                  setProjectId(valueOf(option));
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
              <TextInput
                value={idleTaskDisplay}
                placeholder="What are you working on?"
                aria-label="Task"
                onChange={(e) => {
                  if (taskSelection) return; // readOnly when a task is linked
                  setTask(e.target.value);
                }}
                readOnly={taskSelection !== null}
                data-testid="tt-timer-task-input"
              />
            </div>
            <div style={{ minWidth: 160, flex: '1 1 200px' }}>
              <TextInput
                value={description}
                placeholder="Description"
                aria-label="Description"
                onChange={(e) => setDescription(e.target.value)}
                data-testid="tt-timer-description-input"
              />
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-3)', marginLeft: 'auto', alignItems: 'center' }}>
              {/* Spec 16 — the idle state's billable toggle seeds the start body. */}
              <Switch
                checked={idleBillable}
                onChange={setIdleBillable}
                label="Billable"
                data-testid="tt-timer-idle-billable-toggle"
              />
              <Button onClick={onAddEntry} data-testid="tt-add-entry-btn">
                + Add entry
              </Button>
              <Button
                variant="primary"
                icon={<PlayIcon />}
                preloader={starting}
                disabled={starting}
                onClick={() => void handleStart()}
                data-testid="tt-timer-start-btn"
              >
                Start timer
              </Button>
            </div>
          </>
        )}
      </div>

      {/* §41 — the timer is gone only when the server says so, so this one awaits its result:
          `busy` blocks both controls and `closeOnAccept={false}` leaves the dialog standing
          until `handleDiscardConfirm` closes it. */}
      <ConfirmDialog
        open={discardOpen}
        title="Discard timer"
        description={TIME_TRACKING_MESSAGES.discardConfirm}
        acceptBtnText="Discard"
        declineBtnText="Cancel"
        acceptTestId="tt-timer-discard-confirm"
        declineTestId="tt-timer-discard-cancel"
        busy={discarding}
        closeOnAccept={false}
        onAccept={() => void handleDiscardConfirm()}
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
