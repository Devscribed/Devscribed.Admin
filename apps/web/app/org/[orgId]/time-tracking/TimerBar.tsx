'use client';

import { useEffect, useState } from 'react';
import { Button, Input, Select } from '@/ds';
import { PlayIcon, StopIcon } from '@/layout/icons';
import { useRunningTimer, type StoppedTimeEntry } from '@/layout/running-timer-context';
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
 */
export function TimerBar({
  projects,
  onAddEntry,
  onChanged,
}: {
  projects: AssignableProject[];
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
  const [starting, setStarting] = useState(false);

  // Running-state editable copy, seeded from the timer and re-seeded when it changes
  // identity (e.g. after a refresh, or a start from elsewhere).
  const [runProjectId, setRunProjectId] = useState<string>(NO_PROJECT);
  const [runTask, setRunTask] = useState('');
  const [runDescription, setRunDescription] = useState('');

  const [discardOpen, setDiscardOpen] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [stopping, setStopping] = useState(false);

  useEffect(() => {
    if (!timer) return;
    setRunProjectId(timer.projectId ?? NO_PROJECT);
    setRunTask(timer.task ?? '');
    setRunDescription(timer.description ?? '');
  }, [timer?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleStart(): Promise<void> {
    if (starting) return;
    setStarting(true);
    const result = await start({
      projectId: projectId || null,
      task: task.trim() || null,
      description: description.trim() || null,
    });
    setStarting(false);
    if (result.ok) {
      showToast('toast-timer-started', TIME_TRACKING_MESSAGES.toastTimerStarted);
      setProjectId(NO_PROJECT);
      setTask('');
      setDescription('');
      onChanged();
    } else if (result.conflict) {
      showToast('toast-timer-started', result.message ?? TIME_TRACKING_MESSAGES.timerAlreadyRunning, 'error');
    } else {
      showToast('toast-timer-started', result.message ?? TIME_TRACKING_MESSAGES.genericError, 'error');
    }
  }

  /** Persist the running timer's current metadata (PUT on blur). */
  function pushUpdate(next: { projectId?: string; task?: string; description?: string }): void {
    void update({
      projectId: (next.projectId ?? runProjectId) || null,
      task: (next.task ?? runTask).trim() || null,
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
            <div style={{ minWidth: 160, flex: '1 1 160px' }}>
              <Input
                value={runTask}
                placeholder="What are you working on?"
                onChange={(e: { target: { value: string } }) => setRunTask(e.target.value)}
                onBlur={() => pushUpdate({})}
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
                onChange={(value: string) => setProjectId(value)}
                data-testid="tt-timer-project-select"
              />
            </div>
            <div style={{ minWidth: 160, flex: '1 1 160px' }}>
              <Input
                value={task}
                placeholder="What are you working on?"
                onChange={(e: { target: { value: string } }) => setTask(e.target.value)}
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
