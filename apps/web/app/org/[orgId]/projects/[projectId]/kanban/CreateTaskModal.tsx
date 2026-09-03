'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Button,
  FormActions,
  Modal,
  Select,
  TextArea,
  TextInput,
  type SelectOption,
} from '@devscribed/ds';
import { focusByTestId } from '@/field-error';
import { optionFor, valueOf } from '@/select';
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

  /* Every list is hoisted so `value` can be given the **option** rather than the value
     behind it: `Select` renders `labelOf(value)`, and a bare string is a legal option whose
     label is itself — so binding these directly draws `task`, `high`, and a membership UUID
     where the lists say `Task`, `High` and a person's name. */
  const typeOptions: SelectOption[] = TASK_TYPES.map((t) => ({
    value: t,
    label: TASK_TYPE_LABEL[t],
  }));
  const parentSelectOptions: SelectOption[] = parentOptions.map((t) => ({
    value: t.id,
    label: `${t.key} — ${t.title}`,
  }));
  const priorityOptions: SelectOption[] = [
    { value: '', label: 'None' },
    ...TASK_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] })),
  ];
  const assigneeOptions: SelectOption[] = [
    { value: '', label: 'Unassigned' },
    ...members.map((m) => ({
      value: m.membershipId,
      label: `${m.firstName} ${m.lastName}`,
    })),
  ];
  const statusOptions: SelectOption[] = columns.map((c) => ({ value: c.id, label: c.name }));

  return (
    <Modal
      open={open}
      onClose={submitting ? () => {} : onClose}
      title="Create Task"
      data-testid="create-task-modal"
    >
      <form
        onSubmit={submit}
        noValidate
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-7)',
          maxHeight: '65vh',
          overflowY: 'auto',
        }}
      >
        {!fixedType && (
          <Select
            label="Type"
            value={optionFor(typeOptions, type)}
            options={typeOptions}
            onChange={(next) => setType(valueOf(next) as TaskType)}
            variant="formik"
            data-testid="create-task-type"
          />
        )}

        <TextInput
          label="Title"
          placeholder="Task title"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            if (titleError) setTitleError(null);
          }}
          onBlur={() => {
            const r = validateTaskTitle(title);
            setTitleError(r.valid ? null : r.error);
          }}
          autoFocus
          data-testid="create-task-title"
          error={titleError ?? undefined}
          errorId="field-error-create-task-title"
        />

        {/* §25's `TextArea`, not a hand-built `<textarea>` with its own label, ring and error
            node. The monospace face stays — this box holds Markdown, which is source text,
            and that is the half of §77 a real mono family is for. */}
        <TextArea
          label="Description"
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
          data-testid="create-task-description"
          error={descriptionError ?? undefined}
          errorId="field-error-create-task-description"
          style={{ fontFamily: 'var(--font-family-mono)', minHeight: 90 }}
        />

        {showParent && (
          <Select
            label={parentRequired ? 'Parent' : 'Parent (optional)'}
            value={optionFor(parentSelectOptions, parentId)}
            placeholder="None"
            options={parentSelectOptions}
            onChange={(next) => setParentId(valueOf(next))}
            variant="formik"
            data-testid="create-task-parent"
          />
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'var(--space-5)',
          }}
        >
          <Select
            label="Priority"
            value={optionFor(priorityOptions, priority)}
            placeholder="None"
            options={priorityOptions}
            onChange={(next) => setPriority(valueOf(next))}
            variant="formik"
            data-testid="create-task-priority"
          />
          <TextInput
            label="Story Points"
            type="number"
            min={0}
            max={999}
            step={1}
            value={storyPoints}
            onChange={(event) => {
              setStoryPoints(event.target.value);
              if (storyPointsError) setStoryPointsError(null);
            }}
            onBlur={() => {
              const r = validateStoryPoints(storyPoints);
              setStoryPointsError(r.valid ? null : r.error);
            }}
            data-testid="create-task-story-points"
            error={storyPointsError ?? undefined}
            errorId="field-error-create-task-story-points"
          />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'var(--space-5)',
          }}
        >
          <Select
            label="Assignee"
            value={optionFor(assigneeOptions, assigneeId)}
            placeholder="Unassigned"
            options={assigneeOptions}
            onChange={(next) => setAssigneeId(valueOf(next))}
            variant="formik"
            data-testid="create-task-assignee"
          />
          {/* §4 carries the field's whole treatment through `type`; the control under it is
              still the platform's date input. That is the shape Phase 5 settled when it
              refused `DateField`. */}
          <TextInput
            label="Due Date"
            type="date"
            value={dueDate}
            onChange={(event) => {
              setDueDate(event.target.value);
              if (dueDateError) setDueDateError(null);
            }}
            onBlur={() => {
              const r = validateDueDate(dueDate);
              setDueDateError(r.valid ? null : r.error);
            }}
            data-testid="create-task-due-date"
            error={dueDateError ?? undefined}
            errorId="field-error-create-task-due-date"
          />
        </div>

        <Select
          label="Status"
          value={optionFor(statusOptions, columnId)}
          options={statusOptions}
          onChange={(next) => setColumnId(valueOf(next))}
          variant="formik"
          data-testid="create-task-status"
        />

        <FormActions>
          <Button
            type="button"
            disabled={submitting}
            onClick={onClose}
            data-testid="create-task-cancel"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            preloader={submitting}
            data-testid="create-task-submit"
          >
            Create Task
          </Button>
        </FormActions>
      </form>
    </Modal>
  );
}

// Export helper to reuse the member type across screens.
export type { OrgMember };
