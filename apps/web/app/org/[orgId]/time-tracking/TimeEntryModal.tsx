'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Button, FieldLabel, FormActions, Modal, Select, Switch, TextInput, ToggleButton } from '@devscribed/ds';
import { optionFor, valueOf } from '@/select';
import { TaskSelector, type TaskSelectorValue } from '@/task-selector/TaskSelector';
import { useToast } from '@/toast';
import {
  TIME_TRACKING_MESSAGES,
  computeDurationFromRange,
  formatDurationHuman,
  formatWallClockInTz,
  validateTimeEntry,
} from '@devscribed/validation';
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

  const twoCol: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-5)' };

  return (
    <Modal
      open={open}
      title={isEdit ? 'Edit Time Entry' : 'Add Time Entry'}
      onClose={handleClose}
      data-testid="tt-entry-modal"
      style={{ width: 520 }}
    >
      {/* The buttons sit inside the form rather than in a shell slot, which is what lets the
          save button be a real `type="submit"` instead of an `<button form=…>` pointing at a
          form somewhere else in the tree. §63 owns the row's alignment. */}
      <form
        onSubmit={submit}
        noValidate
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}
      >
        {/* Project */}
        <Select
          label="Project"
          variant="formik"
          value={optionFor(options, projectId)}
          options={options}
          placeholder="Select project…"
          onChange={(option) => {
            setProjectId(valueOf(option));
            // Spec 15 FR-14/FR-16 — project change clears the task selection
            // (a task belongs to exactly one project). Free-text `task` stays.
            setTaskSelection(null);
            clearError('projectId');
            clearError('taskId');
          }}
          error={Boolean(errors.projectId)}
          errorMessage={errors.projectId}
          errorId="field-error-projectId"
          aria-describedby={errors.projectId ? 'field-error-projectId' : undefined}
          data-testid="tt-entry-project-select"
        />

        {/* Spec 15 — Task selector, hidden when the project has no board key (FR-15). */}
        {selectedProject && selectedProject.key && (
          <div>
            {/* §74 — the system's own field-label treatment, so this caption sits on the same
                line as the labels of the fields above and below it. */}
            <FieldLabel>Task</FieldLabel>
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
                id="field-error-taskId"
                data-testid="field-error-taskId"
                style={{ marginTop: 'var(--space-1)', fontSize: 'var(--font-size-xs)', color: 'var(--status-error)' }}
              >
                {errors.taskId}
              </div>
            )}
          </div>
        )}

        {/* Free-text task label. Hidden while a task is selected (spec 15 §UI). */}
        {!taskSelection && (
          <TextInput
            label={selectedProject && selectedProject.key ? 'Task label' : 'Task'}
            placeholder="e.g. API development"
            value={task}
            onChange={(e) => {
              setTask(e.target.value);
              clearError('task');
            }}
            readOnly={submitting}
            data-testid="tt-entry-task-input"
            error={errors.task}
            errorId="field-error-task"
            aria-describedby={errors.task ? 'field-error-task' : undefined}
          />
        )}

        {/* Date */}
        <TextInput
          label="Date"
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            clearError('date');
          }}
          readOnly={submitting}
          data-testid="tt-entry-date-input"
          error={errors.date}
          errorId="field-error-date"
          aria-describedby={errors.date ? 'field-error-date' : undefined}
        />

        {/* Mode toggle */}
        {/* Two answers, so it is written as two — `value1` / `value2` is the spelling §87 kept
            beside the list form for exactly this case. */}
        <ToggleButton
          aria-label="Entry mode"
          selectedValue={mode}
          value1="Time range"
          value2="Duration only"
          value1TestId="tt-entry-mode-timerange"
          value2TestId="tt-entry-mode-duration"
          onValue1Click={() => { setMode('timerange'); setErrors({}); }}
          onValue2Click={() => { setMode('duration'); setErrors({}); }}
          style={{ marginBottom: 0 }}
        />

        {mode === 'timerange' ? (
          <div>
            <div style={twoCol}>
              <TextInput
                label="Start time"
                type="time"
                value={startTime}
                onChange={(e) => {
                  setStartTime(e.target.value);
                  clearError('startTime');
                  clearError('durationMinutes');
                }}
                readOnly={submitting}
                data-testid="tt-entry-start-time"
                error={errors.startTime}
                errorId="field-error-startTime"
                aria-describedby={errors.startTime ? 'field-error-startTime' : undefined}
              />
              <TextInput
                label="End time"
                type="time"
                value={endTime}
                onChange={(e) => {
                  setEndTime(e.target.value);
                  clearError('endTime');
                }}
                readOnly={submitting}
                data-testid="tt-entry-end-time"
                error={errors.endTime}
                errorId="field-error-endTime"
                aria-describedby={errors.endTime ? 'field-error-endTime' : undefined}
              />
            </div>
            <div
              data-testid="tt-entry-duration-computed"
              style={{ marginTop: 'var(--space-3)', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}
            >
              Duration: {computed} (computed)
            </div>
            {/* A missing-time timerange collapses to the duration-required rule in the
                validator; surface it here so it is never hidden. */}
            {errors.durationMinutes && (
              <div
                id="field-error-durationMinutes"
                data-testid="field-error-durationMinutes"
                style={{ marginTop: 'var(--space-1)', fontSize: 'var(--font-size-xs)', color: 'var(--status-error)' }}
              >
                {errors.durationMinutes}
              </div>
            )}
          </div>
        ) : (
          <div>
            <div style={twoCol}>
              <TextInput
                label="Hours"
                type="number"
                min={0}
                value={hours}
                onChange={(e) => {
                  setHours(e.target.value);
                  clearError('durationMinutes');
                }}
                readOnly={submitting}
                data-testid="tt-entry-duration-hours"
              />
              <TextInput
                label="Minutes"
                type="number"
                min={0}
                max={59}
                value={minutes}
                onChange={(e) => {
                  setMinutes(e.target.value);
                  clearError('durationMinutes');
                }}
                readOnly={submitting}
                data-testid="tt-entry-duration-minutes"
              />
            </div>
            {errors.durationMinutes && (
              <div
                id="field-error-durationMinutes"
                data-testid="field-error-durationMinutes"
                style={{ marginTop: 'var(--space-1)', fontSize: 'var(--font-size-xs)', color: 'var(--status-error)' }}
              >
                {errors.durationMinutes}
              </div>
            )}
          </div>
        )}

        {/* Description */}
        <TextInput
          label="Description"
          placeholder="Optional notes…"
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            clearError('description');
          }}
          readOnly={submitting}
          data-testid="tt-entry-description-input"
          error={errors.description}
          errorId="field-error-description"
          aria-describedby={errors.description ? 'field-error-description' : undefined}
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
            gap: 'var(--space-5)',
            alignItems: 'center',
            padding: 'var(--space-5) var(--space-6)',
            border: 'var(--border-width-hairline) solid var(--border-default)',
            borderRadius: 'var(--radius-l)',
            background: 'var(--surface-sunken)',
          }}
        >
          <div>
            <div id="tt-billable-label" style={{ fontSize: 'var(--font-size-s)', color: 'var(--text-primary)' }}>
              Billable
            </div>
            <div
              id="tt-billable-desc"
              data-testid="time-entry-billable-toggle-label"
              style={{ marginTop: 'var(--space-1)', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}
            >
              {billable
                ? "Counts toward the client's Billed Amount on reports. Turn off for internal work, training, or PTO."
                : "This entry will not appear in the client's Billed Amount total."}
            </div>
          </div>
          {/* §88 — the switch draws no label of its own: the row already carries the name and
              the sentence explaining it, and a third copy inside the control would be read
              back twice. `aria-label` is what names it instead. */}
          <Switch
            checked={billable}
            disabled={submitting}
            onChange={setBillable}
            aria-label="Billable"
            aria-describedby="tt-billable-desc"
            data-testid="time-entry-billable-toggle"
          />
        </div>

        {/* 280 rather than §63's 240: split two ways with the button's own chrome, 240 leaves
            79px of label and `Save changes` wraps onto a second line inside the button. */}
        <FormActions maxWidth={280}>
          <Button
            onClick={handleClose}
            disabled={submitting}
            data-testid="tt-entry-cancel-btn"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            preloader={submitting}
            data-testid="tt-entry-save-btn"
          >
            {isEdit ? 'Save changes' : 'Save entry'}
          </Button>
        </FormActions>
      </form>
    </Modal>
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
