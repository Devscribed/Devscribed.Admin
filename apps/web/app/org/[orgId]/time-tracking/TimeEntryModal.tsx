'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Button, Input, Modal, Select } from '@/ds';
import { errorNode } from '@/field-error';
import { TaskSelector, type TaskSelectorValue } from '@/task-selector/TaskSelector';
import { useToast } from '@/toast';
import {
  TIME_TRACKING_MESSAGES,
  computeDurationFromRange,
  formatDurationHuman,
  formatWallClockInTz,
  validateTimeEntry,
} from '@devscribed/validation';
import { SegmentedControl } from './SegmentedControl';
import type { AssignableProject, TimeEntry } from './types';

const NO_PROJECT = '';
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

type EntryMode = 'timerange' | 'duration';

/**
 * Add/Edit Time Entry modal (spec 12 §Screens; TC-12-E2E-02/11). A DS `Modal` with a
 * project `Select`, task, date, a Time-range / Duration-only mode toggle, the mode's
 * inputs (start/end + a computed-duration readout, or hours/minutes), and a description.
 *
 * Fields validate client-side via `validateTimeEntry` for instant errors, but the server
 * is authoritative — its `errors` / `invalid_project` bodies are surfaced too. Time-range
 * inputs post as `"HH:MM"` `startTime`/`endTime` (server recomputes the duration);
 * duration-only posts `durationMinutes`. Admin/manager creating for another member pass the
 * member-filter's `membershipId` on create.
 */
export function TimeEntryModal({
  open,
  orgId,
  projects,
  entry,
  defaultDate,
  today,
  tz,
  createMembershipId,
  onClose,
  onSaved,
}: {
  open: boolean;
  orgId: string;
  projects: AssignableProject[];
  /** Non-null → edit that entry; null → create. */
  entry: TimeEntry | null;
  /** Pre-selected date for a new entry (today, or the viewed day). */
  defaultDate: string;
  /** The member's "today" reference for `validateTimeEntry`. */
  today: string;
  /** The viewer's effective timezone — an edited entry's stored UTC instants are shown as
   * (and re-composed from) wall-clock in this zone, so the round-trip is exact. */
  tz: string;
  /** Membership to create the entry for (admin/manager member filter); omit on edit. */
  createMembershipId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const isEdit = entry !== null;

  const [projectId, setProjectId] = useState<string>(NO_PROJECT);
  const [task, setTask] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [mode, setMode] = useState<EntryMode>('timerange');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  // Spec 16 FR-1/FR-4 — the modal opens billable by default; the toggle carries
  // through to the POST/PATCH body and to the toast text on save.
  const [billable, setBillable] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  // Spec 15 — active task-link selection. Hydrated on edit from the entry's
  // `taskId` + `taskKey`; parsed title from the snapshot label (see FR-2).
  const [taskSelection, setTaskSelection] = useState<TaskSelectorValue | null>(null);

  // Seed on open. Editing an archived-project entry keeps that project selectable even
  // when it is absent from the active-projects list (spec FR-7 preservation).
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setSubmitting(false);
    if (entry) {
      setProjectId(entry.projectId ?? NO_PROJECT);
      setTask(entry.task ?? '');
      setDescription(entry.description ?? '');
      setDate(entry.date);
      // Spec 15 — hydrate the task chip when the entry was written with a link.
      if (entry.taskId && entry.taskKey) {
        setTaskSelection({
          id: entry.taskId,
          key: entry.taskKey,
          title: extractTitleFromLabel(entry.task, entry.taskKey),
          type: 'task',
        });
      } else {
        setTaskSelection(null);
      }
      if (entry.startTime) {
        setMode('timerange');
        setStartTime(formatWallClockInTz(entry.startTime, tz));
        setEndTime(entry.endTime ? formatWallClockInTz(entry.endTime, tz) : '');
        setHours('');
        setMinutes('');
      } else {
        setMode('duration');
        setHours(String(Math.floor(entry.durationMinutes / 60)));
        setMinutes(String(entry.durationMinutes % 60));
        setStartTime('');
        setEndTime('');
      }
      // Spec 16 — hydrate the toggle from the edited entry. Legacy rows loaded
      // by an older client may lack the field; treat missing as billable.
      setBillable(entry.billable !== false);
    } else {
      setProjectId(NO_PROJECT);
      setTask('');
      setDescription('');
      setDate(defaultDate);
      setMode('timerange');
      setStartTime('');
      setEndTime('');
      setHours('');
      setMinutes('');
      setTaskSelection(null);
      setBillable(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entry?.id]);

  const options = useMemo(() => {
    const base = [
      { value: NO_PROJECT, label: '— No project —' },
      ...projects.map((p) => ({ value: p.id, label: p.name })),
    ];
    // Preserve an edited entry's (possibly archived) project as a selectable option.
    if (entry?.projectId && !projects.some((p) => p.id === entry.projectId)) {
      base.push({ value: entry.projectId, label: entry.projectName ?? 'Project' });
    }
    return base;
  }, [projects, entry?.projectId, entry?.projectName]);

  /** The currently-selected project record, if it lives in the assignable set. Used
   * by the spec-15 task selector to decide whether to render (needs `key`). */
  const selectedProject = useMemo(
    () => (projectId ? projects.find((p) => p.id === projectId) ?? null : null),
    [projects, projectId],
  );

  const computed = useMemo(() => {
    if (HHMM.test(startTime) && HHMM.test(endTime)) {
      const dur = computeDurationFromRange(startTime, endTime);
      if (Number.isFinite(dur) && dur > 0) return formatDurationHuman(dur);
    }
    return '—';
  }, [startTime, endTime]);

  function clearError(field: string): void {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function buildInput() {
    if (mode === 'timerange') {
      return { date, startTime, endTime, task, description };
    }
    const h = hours.trim() === '' ? 0 : Number(hours);
    const m = minutes.trim() === '' ? 0 : Number(minutes);
    const durationMinutes =
      hours.trim() === '' && minutes.trim() === '' ? undefined : h * 60 + m;
    return { date, durationMinutes, task, description };
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (submitting) return;

    const result = validateTimeEntry(buildInput(), { today });
    if (!result.valid) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setSubmitting(true);

    const body: Record<string, unknown> = {
      projectId: projectId || null,
      // Spec 15 — `taskId: null` explicit so clearing a link on edit unsets it.
      taskId: taskSelection?.id ?? null,
      // Spec 15 FR-2 — server ignores `task` when taskId is present. Omitting is
      // the clearest signal; when unlinked, send whatever the user typed.
      ...(taskSelection ? {} : { task: result.value.task }),
      description: result.value.description,
      date: result.value.date,
    };
    if (mode === 'timerange') {
      body.startTime = result.value.startTime;
      body.endTime = result.value.endTime;
      body.durationMinutes = null;
    } else {
      body.startTime = null;
      body.endTime = null;
      body.durationMinutes = result.value.durationMinutes;
    }
    body.billable = billable;
    if (!isEdit && createMembershipId) body.membershipId = createMembershipId;

    const url = isEdit
      ? `/api/organizations/${orgId}/time-entries/${entry!.id}`
      : `/api/organizations/${orgId}/time-entries`;

    try {
      const response = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      });
      if (response.ok) {
        setSubmitting(false);
        onClose();
        // Spec 16 §Error Messages — differentiated toast text.
        const toastText = isEdit
          ? TIME_TRACKING_MESSAGES.toastEntryUpdated
          : billable
          ? TIME_TRACKING_MESSAGES.toastEntryBillableLogged
          : TIME_TRACKING_MESSAGES.toastEntryNonBillableLogged;
        showToast('toast-entry-saved', toastText);
        onSaved();
        return;
      }
      const errBody = await response.json().catch(() => null);
      if (errBody?.errors && typeof errBody.errors === 'object') {
        setErrors(errBody.errors as Record<string, string>);
      } else if (errBody?.error === 'invalid_project') {
        setErrors({ projectId: errBody.message ?? TIME_TRACKING_MESSAGES.projectInvalid });
      } else if (
        errBody?.error === 'task_requires_project' ||
        errBody?.error === 'task_wrong_project' ||
        errBody?.error === 'task_not_found' ||
        errBody?.error === 'task_project_not_assigned'
      ) {
        setErrors({ taskId: mapTaskLinkError(errBody.error) });
      } else if (response.status === 403) {
        // Spec 16 §Error Messages — a cross-member edit blocked by the server surfaces
        // its own toast, keyed on `toast-time-forbidden` so E2E can assert it distinctly.
        showToast('toast-time-forbidden', TIME_TRACKING_MESSAGES.toastEntryForbidden, 'error');
      } else {
        showToast('toast-entry-saved', errBody?.message ?? TIME_TRACKING_MESSAGES.genericError, 'error');
      }
    } catch {
      showToast('toast-entry-saved', TIME_TRACKING_MESSAGES.genericError, 'error');
    }
    setSubmitting(false);
  }

  function handleClose(): void {
    if (!submitting) onClose();
  }

  const twoCol: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };

  return (
    <Modal
      open={open}
      title={isEdit ? 'Edit Time Entry' : 'Add Time Entry'}
      onClose={handleClose}
      width={520}
      data-testid="tt-entry-modal"
      actions={
        <>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            onClick={handleClose}
            disabled={submitting}
            data-testid="tt-entry-cancel-btn"
            style={{ flex: 1 }}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="tt-entry-form"
            variant="primary"
            size="lg"
            loading={submitting}
            data-testid="tt-entry-save-btn"
            style={{ flex: 1 }}
          >
            {isEdit ? 'Save changes' : 'Save entry'}
          </Button>
        </>
      }
    >
      <form
        id="tt-entry-form"
        onSubmit={submit}
        noValidate
        style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        {/* Project */}
        <div>
          <Select
            label="Project"
            value={projectId}
            options={options}
            placeholder="Select project…"
            onChange={(value: string) => {
              setProjectId(value);
              // Spec 15 FR-14/FR-16 — project change clears the task selection
              // (a task belongs to exactly one project). Free-text `task` stays.
              setTaskSelection(null);
              clearError('projectId');
              clearError('taskId');
            }}
            error={errors.projectId}
            data-testid="tt-entry-project-select"
          />
          {errors.projectId && (
            <div
              data-testid="field-error-projectId"
              style={{ marginTop: 5, fontSize: 'var(--fs-12)', color: 'var(--error-500)' }}
            >
              {errors.projectId}
            </div>
          )}
        </div>

        {/* Spec 15 — Task selector, hidden when the project has no board key (FR-15). */}
        {selectedProject && selectedProject.key && (
          <div>
            <label
              style={{
                display: 'block',
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--fs-11)',
                letterSpacing: 1,
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                marginBottom: 6,
              }}
            >
              Task
            </label>
            <TaskSelector
              orgId={orgId}
              projectId={selectedProject.id}
              projectName={selectedProject.name}
              projectKey={selectedProject.key}
              testIdPrefix="tt-entry"
              value={taskSelection}
              onChange={(next) => {
                // Spec 15 FR-6/FR-13 — clearing the link preserves the computed
                // label as editable free-text in the `task` field.
                if (next === null && taskSelection) {
                  setTask(`${taskSelection.key}: ${taskSelection.title}`);
                }
                setTaskSelection(next);
                clearError('taskId');
              }}
              disabled={submitting}
            />
            {errors.taskId && (
              <div
                data-testid="field-error-taskId"
                style={{ marginTop: 5, fontSize: 'var(--fs-12)', color: 'var(--error-500)' }}
              >
                {errors.taskId}
              </div>
            )}
          </div>
        )}

        {/* Free-text task label. Hidden while a task is selected (spec 15 §UI). */}
        {!taskSelection && (
          <Input
            label={selectedProject && selectedProject.key ? 'Task label' : 'Task'}
            placeholder="e.g. API development"
            value={task}
            onChange={(e: { target: { value: string } }) => {
              setTask(e.target.value);
              clearError('task');
            }}
            readOnly={submitting}
            data-testid="tt-entry-task-input"
            error={errors.task ? errorNode('task', errors.task) : undefined}
            wrapperStyle={{ gap: 0 }}
          />
        )}

        {/* Date */}
        <Input
          label="Date"
          type="date"
          value={date}
          onChange={(e: { target: { value: string } }) => {
            setDate(e.target.value);
            clearError('date');
          }}
          readOnly={submitting}
          data-testid="tt-entry-date-input"
          error={errors.date ? errorNode('date', errors.date) : undefined}
          wrapperStyle={{ gap: 0 }}
        />

        {/* Mode toggle */}
        <SegmentedControl<EntryMode>
          ariaLabel="Entry mode"
          value={mode}
          onChange={(next) => {
            setMode(next);
            setErrors({});
          }}
          options={[
            { value: 'timerange', label: 'Time range', testId: 'tt-entry-mode-timerange' },
            { value: 'duration', label: 'Duration only', testId: 'tt-entry-mode-duration' },
          ]}
        />

        {mode === 'timerange' ? (
          <div>
            <div style={twoCol}>
              <Input
                label="Start time"
                type="time"
                value={startTime}
                onChange={(e: { target: { value: string } }) => {
                  setStartTime(e.target.value);
                  clearError('startTime');
                  clearError('durationMinutes');
                }}
                readOnly={submitting}
                data-testid="tt-entry-start-time"
                error={errors.startTime ? errorNode('startTime', errors.startTime) : undefined}
                wrapperStyle={{ gap: 0 }}
              />
              <Input
                label="End time"
                type="time"
                value={endTime}
                onChange={(e: { target: { value: string } }) => {
                  setEndTime(e.target.value);
                  clearError('endTime');
                }}
                readOnly={submitting}
                data-testid="tt-entry-end-time"
                error={errors.endTime ? errorNode('endTime', errors.endTime) : undefined}
                wrapperStyle={{ gap: 0 }}
              />
            </div>
            <div
              data-testid="tt-entry-duration-computed"
              style={{ marginTop: 8, fontSize: 'var(--fs-13)', color: 'var(--text-muted)' }}
            >
              Duration: {computed} (computed)
            </div>
            {/* A missing-time timerange collapses to the duration-required rule in the
                validator; surface it here so it is never hidden. */}
            {errors.durationMinutes && (
              <div
                data-testid="field-error-durationMinutes"
                style={{ marginTop: 5, fontSize: 'var(--fs-12)', color: 'var(--error-500)' }}
              >
                {errors.durationMinutes}
              </div>
            )}
          </div>
        ) : (
          <div>
            <div style={twoCol}>
              <Input
                label="Hours"
                type="number"
                min={0}
                value={hours}
                onChange={(e: { target: { value: string } }) => {
                  setHours(e.target.value);
                  clearError('durationMinutes');
                }}
                readOnly={submitting}
                data-testid="tt-entry-duration-hours"
                wrapperStyle={{ gap: 0 }}
              />
              <Input
                label="Minutes"
                type="number"
                min={0}
                max={59}
                value={minutes}
                onChange={(e: { target: { value: string } }) => {
                  setMinutes(e.target.value);
                  clearError('durationMinutes');
                }}
                readOnly={submitting}
                data-testid="tt-entry-duration-minutes"
                wrapperStyle={{ gap: 0 }}
              />
            </div>
            {errors.durationMinutes && (
              <div
                data-testid="field-error-durationMinutes"
                style={{ marginTop: 5, fontSize: 'var(--fs-12)', color: 'var(--error-500)' }}
              >
                {errors.durationMinutes}
              </div>
            )}
          </div>
        )}

        {/* Description */}
        <Input
          label="Description"
          placeholder="Optional notes…"
          value={description}
          onChange={(e: { target: { value: string } }) => {
            setDescription(e.target.value);
            clearError('description');
          }}
          readOnly={submitting}
          data-testid="tt-entry-description-input"
          error={errors.description ? errorNode('description', errors.description) : undefined}
          wrapperStyle={{ gap: 0 }}
        />

        {/* Spec 16 §UI — Billable toggle row. Bordered so it does not vanish in the
            flex column of inputs, two-column layout (label + description on the left,
            switch on the right), description text flips with the state. */}
        <div
          role="group"
          aria-labelledby="tt-billable-label"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: 12,
            alignItems: 'center',
            padding: '12px 14px',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--bg-panel-2)',
          }}
        >
          <div>
            <div
              id="tt-billable-label"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--fs-13)',
                color: 'var(--text)',
              }}
            >
              Billable
            </div>
            <div
              id="tt-billable-desc"
              data-testid="time-entry-billable-toggle-label"
              style={{ marginTop: 4, fontSize: 'var(--fs-12)', color: 'var(--text-muted)' }}
            >
              {billable
                ? "Counts toward the client's Billed Amount on reports. Turn off for internal work, training, or PTO."
                : "This entry will not appear in the client's Billed Amount total."}
            </div>
          </div>
          <BillableSwitch
            checked={billable}
            disabled={submitting}
            onChange={setBillable}
            testId="time-entry-billable-toggle"
            describedBy="tt-billable-desc"
          />
        </div>
      </form>
    </Modal>
  );
}

/**
 * Spec 16 §Accessibility — a boolean pill switch. DS ships a segmented `Toggle` (three
 * values, no true/false semantics), not a switch, so we roll a local one that uses
 * `role="switch"` + `aria-checked` and paints accent-filled ↔ muted-grey from tokens.
 * Kept local to this modal because the RunningTimer bar uses a smaller variant of the
 * same idea — inline duplication is cheaper than lifting a shared component just for two
 * call sites (spec 16 is the only spec that needs a boolean pill today).
 */
function BillableSwitch({
  checked,
  disabled,
  onChange,
  testId,
  describedBy,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  testId: string;
  describedBy?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={describedBy}
      data-testid={testId}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      style={{
        width: 42,
        height: 24,
        padding: 2,
        borderRadius: 999,
        border: '1px solid var(--border)',
        background: checked ? 'var(--accent)' : 'var(--bg-sunken)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: checked ? 'flex-end' : 'flex-start',
        transition: 'background 120ms ease',
      }}
    >
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: 999,
          background: 'var(--bg-panel)',
          boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
          display: 'block',
        }}
      />
    </button>
  );
}

/**
 * Given a snapshot task label ("MOB-5: Fix login bug") and its key ("MOB-5"), pull
 * out the title portion for the chip. Falls back to the whole label when the prefix
 * doesn't match (older entries, or a stale key rename).
 */
function extractTitleFromLabel(label: string | null, taskKey: string): string {
  if (!label) return '';
  const prefix = `${taskKey}: `;
  if (label.startsWith(prefix)) return label.slice(prefix.length);
  return label;
}

/** Server task-link error code → user-facing message (spec 15 §Error Messages). */
function mapTaskLinkError(code: string): string {
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
      return TIME_TRACKING_MESSAGES.genericError;
  }
}
