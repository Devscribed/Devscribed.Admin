'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Button, Input, Modal, Select } from '@/ds';
import { errorNode, focusByTestId } from '@/field-error';
import { useToast } from '@/toast';
import {
  KANBAN_MESSAGES,
  TASK_PRIORITIES,
  TASK_TYPES,
  checkTaskHierarchy,
  validateDueDate,
  validateStoryPoints,
  validateTaskDescription,
  validateTaskTitle,
  validateTaskType,
  type TaskPriority,
  type TaskType,
} from '@devscribed/validation';
import type { KanbanAssignee, KanbanColumn, KanbanTaskSummary } from './types';
import { PRIORITY_LABEL, TASK_TYPE_LABEL } from './visual';

const NONE = '';
const UNASSIGNED = '';

type OrgMember = { membershipId: string; firstName: string; lastName: string };

/**
 * Create Task modal (spec 13 §Create Task modal). Reused on Board / List and on
 * the Task detail page's "+ Add subtask" (which pre-fills `type=subtask` +
 * `parentId` and hides the Type field). Blur + submit validation using the shared
 * validators; server-side hierarchy errors surface as a toast and keep the modal
 * open with values intact.
 */
export function CreateTaskModal({
  open,
  orgId,
  projectId,
  columns,
  tasks,
  members,
  fixedType,
  fixedParentId,
  onClose,
  onCreated,
}: {
  open: boolean;
  orgId: string;
  projectId: string;
  columns: KanbanColumn[];
  /** Every task on the board (used to build the Parent select). */
  tasks: Array<Pick<KanbanTaskSummary, 'id' | 'key' | 'title' | 'type'>>;
  members: OrgMember[];
  /** When set, the Type field is hidden and locked to this value. */
  fixedType?: TaskType;
  /** When set, the Parent field is hidden and the id passed through as-is. */
  fixedParentId?: string;
  onClose: () => void;
  onCreated: (task: KanbanTaskSummary) => void;
}) {
  const { showToast } = useToast();

  const firstColumnId = columns[0]?.id ?? '';

  const [type, setType] = useState<TaskType>(fixedType ?? 'task');
  const [title, setTitle] = useState('');
  const [titleError, setTitleError] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [parentId, setParentId] = useState<string>(fixedParentId ?? NONE);
  const [priority, setPriority] = useState<string>('');
  const [storyPoints, setStoryPoints] = useState('');
  const [storyPointsError, setStoryPointsError] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState<string>(UNASSIGNED);
  const [dueDate, setDueDate] = useState('');
  const [dueDateError, setDueDateError] = useState<string | null>(null);
  const [columnId, setColumnId] = useState(firstColumnId);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setType(fixedType ?? 'task');
    setTitle('');
    setTitleError(null);
    setDescription('');
    setDescriptionError(null);
    setParentId(fixedParentId ?? NONE);
    setPriority('');
    setStoryPoints('');
    setStoryPointsError(null);
    setAssigneeId(UNASSIGNED);
    setDueDate('');
    setDueDateError(null);
    setColumnId(firstColumnId);
    setSubmitting(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fixedType, fixedParentId, firstColumnId]);

  // The Parent select's options depend on the picked type (FR-10).
  const parentOptions = useMemo(() => {
    if (fixedParentId) return [];
    if (type === 'epic') return [];
    if (type === 'subtask') {
      return tasks.filter(
        (t) => t.type === 'task' || t.type === 'bug' || t.type === 'story',
      );
    }
    // task / bug / story → epic parents.
    return tasks.filter((t) => t.type === 'epic');
  }, [tasks, type, fixedParentId]);

  // Clear parent when it becomes invalid for the new type.
  useEffect(() => {
    if (!open) return;
    if (fixedParentId) return;
    if (type === 'epic') {
      if (parentId !== NONE) setParentId(NONE);
      return;
    }
    if (parentId !== NONE && !parentOptions.some((t) => t.id === parentId)) {
      setParentId(NONE);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, parentOptions.length]);

  const showParent = !fixedParentId && type !== 'epic';
  const parentRequired = type === 'subtask' && !fixedParentId;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;

    // Validate all fields; keep going to collect every error, focus first.
    const typeResult = validateTaskType(type);
    const titleResult = validateTaskTitle(title);
    const descResult = validateTaskDescription(description);
    const spResult = validateStoryPoints(storyPoints);
    const dueResult = validateDueDate(dueDate);

    setTitleError(titleResult.valid ? null : titleResult.error);
    setDescriptionError(descResult.valid ? null : descResult.error);
    setStoryPointsError(spResult.valid ? null : spResult.error);
    setDueDateError(dueResult.valid ? null : dueResult.error);

    // Hierarchy is checked client-side against the picked parent's type.
    const parentTaskType = parentId
      ? (tasks.find((t) => t.id === parentId)?.type ?? null)
      : null;
    let hierarchyError: string | null = null;
    if (!fixedParentId) {
      hierarchyError = checkTaskHierarchy(type, parentTaskType);
    }

    if (!typeResult.valid) {
      showToast('toast-task-created', KANBAN_MESSAGES.typeRequired, 'error');
      return;
    }
    if (!titleResult.valid) {
      focusByTestId('create-task-title');
      return;
    }
    if (!descResult.valid) {
      focusByTestId('create-task-description');
      return;
    }
    if (parentRequired && !parentId) {
      showToast('toast-task-created', KANBAN_MESSAGES.subtaskRequiresParent, 'error');
      return;
    }
    if (hierarchyError) {
      showToast('toast-task-created', hierarchyError, 'error');
      return;
    }
    if (!spResult.valid) {
      focusByTestId('create-task-story-points');
      return;
    }
    if (!dueResult.valid) {
      focusByTestId('create-task-due-date');
      return;
    }

    setSubmitting(true);

    const body: Record<string, unknown> = {
      type,
      title: titleResult.value,
    };
    if (descResult.value !== null) body.description = descResult.value;
    if (parentId) body.parentId = parentId;
    if (priority) body.priority = priority as TaskPriority;
    if (spResult.value !== null) body.storyPoints = spResult.value;
    if (assigneeId) body.assigneeId = assigneeId;
    if (dueResult.value !== null) body.dueDate = dueResult.value;
    if (columnId) body.columnId = columnId;

    try {
      const response = await fetch(
        `/api/organizations/${orgId}/projects/${projectId}/tasks`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(body),
        },
      );
      if (response.ok) {
        const task = (await response.json()) as KanbanTaskSummary;
        setSubmitting(false);
        onClose();
        showToast('toast-task-created', KANBAN_MESSAGES.toastTaskCreated);
        onCreated(task);
        return;
      }
      const responseBody = await response.json().catch(() => null);
      const message = responseBody?.message ?? KANBAN_MESSAGES.genericError;
      showToast('toast-task-created', message, 'error');
    } catch {
      showToast('toast-task-created', KANBAN_MESSAGES.genericError, 'error');
    }
    setSubmitting(false);
  }

  return (
    <Modal
      open={open}
      onClose={submitting ? () => {} : onClose}
      title="Create Task"
      width={520}
      data-testid="create-task-modal"
      actions={
        <>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            disabled={submitting}
            onClick={onClose}
            data-testid="create-task-cancel"
            style={{ flex: 1 }}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="create-task-form"
            variant="primary"
            size="lg"
            loading={submitting}
            data-testid="create-task-submit"
            style={{ flex: 1 }}
          >
            Create Task
          </Button>
        </>
      }
    >
      <form
        id="create-task-form"
        onSubmit={submit}
        noValidate
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--sp-5)',
          maxHeight: '65vh',
          overflowY: 'auto',
        }}
      >
        {!fixedType && (
          <Select
            label="Type"
            value={type}
            options={TASK_TYPES.map((t) => ({ value: t, label: TASK_TYPE_LABEL[t] }))}
            onChange={(v) => setType(v as TaskType)}
            data-testid="create-task-type"
          />
        )}

        <Input
          label="Title"
          placeholder="Task title"
          value={title}
          onChange={(event: { target: { value: string } }) => {
            setTitle(event.target.value);
            if (titleError) setTitleError(null);
          }}
          onBlur={() => {
            const r = validateTaskTitle(title);
            setTitleError(r.valid ? null : r.error);
          }}
          autoFocus
          data-testid="create-task-title"
          aria-invalid={titleError ? true : undefined}
          aria-describedby={titleError ? 'field-error-create-task-title' : undefined}
          error={titleError ? errorNode('create-task-title', titleError) : undefined}
          wrapperStyle={{ gap: 0 }}
        />

        <label
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--fs-11)',
              letterSpacing: 1,
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
            }}
          >
            Description
          </span>
          <textarea
            data-testid="create-task-description"
            placeholder="Markdown supported…"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              if (descriptionError) setDescriptionError(null);
            }}
            onBlur={() => {
              const r = validateTaskDescription(description);
              setDescriptionError(r.valid ? null : r.error);
            }}
            rows={4}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--fs-13)',
              color: 'var(--text)',
              background: 'var(--bg-input)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '10px 12px',
              resize: 'vertical',
              minHeight: 90,
            }}
          />
          {descriptionError && (
            <span
              id="field-error-create-task-description"
              style={{ color: 'var(--error-500)', fontSize: 'var(--fs-12)' }}
            >
              {descriptionError}
            </span>
          )}
        </label>

        {showParent && (
          <Select
            label={parentRequired ? 'Parent' : 'Parent (optional)'}
            value={parentId}
            placeholder="None"
            options={parentOptions.map((t) => ({
              value: t.id,
              label: `${t.key} — ${t.title}`,
            }))}
            onChange={(v) => setParentId(v)}
            data-testid="create-task-parent"
          />
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'var(--sp-4)',
          }}
        >
          <Select
            label="Priority"
            value={priority}
            placeholder="None"
            options={[
              { value: '', label: 'None' },
              ...TASK_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] })),
            ]}
            onChange={(v) => setPriority(v)}
            data-testid="create-task-priority"
          />
          <Input
            label="Story Points"
            type="number"
            min={0}
            max={999}
            step={1}
            value={storyPoints}
            onChange={(event: { target: { value: string } }) => {
              setStoryPoints(event.target.value);
              if (storyPointsError) setStoryPointsError(null);
            }}
            onBlur={() => {
              const r = validateStoryPoints(storyPoints);
              setStoryPointsError(r.valid ? null : r.error);
            }}
            data-testid="create-task-story-points"
            aria-invalid={storyPointsError ? true : undefined}
            error={
              storyPointsError
                ? errorNode('create-task-story-points', storyPointsError)
                : undefined
            }
            wrapperStyle={{ gap: 0 }}
          />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'var(--sp-4)',
          }}
        >
          <Select
            label="Assignee"
            value={assigneeId}
            placeholder="Unassigned"
            options={[
              { value: '', label: 'Unassigned' },
              ...members.map((m) => ({
                value: m.membershipId,
                label: `${m.firstName} ${m.lastName}`,
              })),
            ]}
            onChange={(v) => setAssigneeId(v)}
            data-testid="create-task-assignee"
          />
          <Input
            label="Due Date"
            type="date"
            value={dueDate}
            onChange={(event: { target: { value: string } }) => {
              setDueDate(event.target.value);
              if (dueDateError) setDueDateError(null);
            }}
            onBlur={() => {
              const r = validateDueDate(dueDate);
              setDueDateError(r.valid ? null : r.error);
            }}
            data-testid="create-task-due-date"
            aria-invalid={dueDateError ? true : undefined}
            error={
              dueDateError ? errorNode('create-task-due-date', dueDateError) : undefined
            }
            wrapperStyle={{ gap: 0 }}
          />
        </div>

        <Select
          label="Status"
          value={columnId}
          options={columns.map((c) => ({ value: c.id, label: c.name }))}
          onChange={(v) => setColumnId(v)}
          data-testid="create-task-status"
        />
      </form>
    </Modal>
  );
}

// Export helper to reuse the member type across screens.
export type { OrgMember };
