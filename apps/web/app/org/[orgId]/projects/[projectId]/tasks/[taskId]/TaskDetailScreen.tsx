'use client';

import DOMPurify from 'dompurify';
import Link from 'next/link';
import { notFound, useRouter } from 'next/navigation';
import { marked } from 'marked';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, InfoBanner, Input, Modal, Select, Spinner } from '@/ds';
import { BackArrowIcon, CheckIcon, PencilIcon, PlusIcon } from '@/layout/icons';
import { useSession } from '@/layout/session-context';
import { useToast } from '@/toast';
import {
  KANBAN_MESSAGES,
  TASK_PRIORITIES,
  TASK_TYPES,
  can,
  formatTaskKey,
  validateDueDate,
  validateStoryPoints,
  validateTaskDescription,
  validateTaskTitle,
  type Role,
  type TaskPriority,
  type TaskType,
} from '@devscribed/validation';
import { AvatarInitials } from '../../../../members/[memberId]/AvatarInitials';
import type { MemberListResponse } from '../../../../members/types';
import { CreateTaskModal, type OrgMember } from '../../kanban/CreateTaskModal';
import type {
  BoardResponse,
  KanbanColumn,
  KanbanProject,
  KanbanTaskChild,
  KanbanTaskDetail,
} from '../../kanban/types';
import {
  PRIORITY_LABEL,
  PriorityGlyph,
  TASK_TYPE_LABEL,
  TaskTypeGlyph,
  formatDateLong,
  initialsOfMember,
} from '../../kanban/visual';

/**
 * Spec 13 — Task detail page. Two-column layout: left holds title, description
 * (markdown, sanitized), children; right is a sticky side panel of editable
 * fields (status/assignee/priority/type/story points/due date). Every side-panel
 * change triggers a debounced PUT. Delete opens a nested confirm modal.
 *
 * Debounce: 500ms for text/number inputs, immediate for selects/dates (design).
 */
export function TaskDetailScreen({
  orgId,
  projectId,
  taskId,
}: {
  orgId: string;
  projectId: string;
  taskId: string;
}) {
  const router = useRouter();
  const session = useSession();
  const { showToast } = useToast();
  const role = session.role as Role;

  const canManageTasks = can(role, 'manage-tasks');

  const [task, setTask] = useState<KanbanTaskDetail | null>(null);
  const [project, setProject] = useState<KanbanProject | null>(null);
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [notFoundState, setNotFoundState] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inline edit state.
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [titleError, setTitleError] = useState<string | null>(null);

  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [descriptionError, setDescriptionError] = useState<string | null>(null);

  // Local drafts for inputs that PUT on debounce.
  const [storyPointsDraft, setStoryPointsDraft] = useState('');
  const [storyPointsError, setStoryPointsError] = useState<string | null>(null);
  const [dueDateDraft, setDueDateDraft] = useState('');
  const [dueDateError, setDueDateError] = useState<string | null>(null);
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({});

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addSubtaskOpen, setAddSubtaskOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [taskRes, boardRes] = await Promise.all([
        fetch(`/api/organizations/${orgId}/projects/${projectId}/tasks/${taskId}`, {
          credentials: 'same-origin',
        }),
        fetch(`/api/organizations/${orgId}/projects/${projectId}/board`, {
          credentials: 'same-origin',
        }),
      ]);
      if (taskRes.status === 404) {
        setNotFoundState(true);
        return;
      }
      if (!taskRes.ok) {
        const body = await taskRes.json().catch(() => null);
        setError(body?.message ?? KANBAN_MESSAGES.genericError);
        return;
      }
      const detail = (await taskRes.json()) as KanbanTaskDetail;
      setTask(detail);
      setTitleDraft(detail.title);
      setDescriptionDraft(detail.description ?? '');
      setStoryPointsDraft(detail.storyPoints != null ? String(detail.storyPoints) : '');
      setDueDateDraft(detail.dueDate ?? '');
      if (boardRes.ok) {
        const boardData = (await boardRes.json()) as BoardResponse;
        setProject(boardData.project);
        setColumns(boardData.columns);
      }
    } catch {
      setError(KANBAN_MESSAGES.genericError);
    }
  }, [orgId, projectId, taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/organizations/${orgId}/members`, {
          credentials: 'same-origin',
        });
        if (!response.ok) return;
        const data = (await response.json()) as MemberListResponse;
        if (cancelled) return;
        const mapped: OrgMember[] = data.members
          .filter((m) => m.status === 'active')
          .map((m) => {
            const parts = m.fullName.trim().split(/\s+/);
            const first = parts[0] ?? '';
            const last = parts.length > 1 ? parts[parts.length - 1] : '';
            return { membershipId: m.id, firstName: first, lastName: last };
          });
        setMembers(mapped);
      } catch {
        // non-blocking
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  if (notFoundState) notFound();

  const archived = project?.status === 'archived';
  const readOnly = archived || !canManageTasks;

  async function patchTask(body: Record<string, unknown>, toastKey = 'toast-task-updated') {
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/projects/${projectId}/tasks/${taskId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(body),
        },
      );
      if (response.ok) {
        const detail = (await response.json()) as KanbanTaskDetail;
        setTask(detail);
        setStoryPointsDraft(detail.storyPoints != null ? String(detail.storyPoints) : '');
        setDueDateDraft(detail.dueDate ?? '');
        showToast(toastKey, KANBAN_MESSAGES.toastTaskUpdated);
        return true;
      }
      const responseBody = await response.json().catch(() => null);
      showToast(toastKey, responseBody?.message ?? KANBAN_MESSAGES.genericError, 'error');
      return false;
    } catch {
      showToast(toastKey, KANBAN_MESSAGES.genericError, 'error');
      return false;
    }
  }

  function saveTitle() {
    if (!task) return;
    const result = validateTaskTitle(titleDraft);
    if (!result.valid) {
      setTitleError(result.error);
      return;
    }
    setTitleError(null);
    setEditingTitle(false);
    if (result.value === task.title) return;
    void patchTask({ title: result.value });
  }

  function cancelTitle() {
    setEditingTitle(false);
    setTitleDraft(task?.title ?? '');
    setTitleError(null);
  }

  function saveDescription() {
    const result = validateTaskDescription(descriptionDraft);
    if (!result.valid) {
      setDescriptionError(result.error);
      return;
    }
    setDescriptionError(null);
    setEditingDescription(false);
    void patchTask({ description: result.value });
  }

  function debouncedSave(key: string, run: () => void, ms = 500) {
    const timer = debounceRef.current[key];
    if (timer) clearTimeout(timer);
    debounceRef.current[key] = setTimeout(run, ms);
  }

  function handleStoryPointsChange(value: string) {
    setStoryPointsDraft(value);
    if (storyPointsError) setStoryPointsError(null);
    debouncedSave('storyPoints', () => {
      const result = validateStoryPoints(value);
      if (!result.valid) {
        setStoryPointsError(result.error);
        return;
      }
      void patchTask({ storyPoints: result.value });
    });
  }

  function handleDueDateChange(value: string) {
    setDueDateDraft(value);
    if (dueDateError) setDueDateError(null);
    const result = validateDueDate(value);
    if (!result.valid) {
      setDueDateError(result.error);
      return;
    }
    void patchTask({ dueDate: result.value });
  }

  async function confirmDelete() {
    if (!task || deleting) return;
    setDeleting(true);
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/projects/${projectId}/tasks/${taskId}`,
        { method: 'DELETE', credentials: 'same-origin' },
      );
      if (response.ok) {
        showToast('toast-task-deleted', KANBAN_MESSAGES.toastTaskDeleted);
        router.push(`/org/${orgId}/projects/${projectId}/board`);
        return;
      }
      const body = await response.json().catch(() => null);
      showToast(
        'toast-task-deleted',
        body?.message ?? KANBAN_MESSAGES.genericError,
        'error',
      );
    } catch {
      showToast('toast-task-deleted', KANBAN_MESSAGES.genericError, 'error');
    }
    setDeleting(false);
  }

  const descriptionHtml = useMemo(() => {
    const src = task?.description ?? '';
    if (!src) return '';
    const raw = marked.parse(src, { async: false }) as string;
    return DOMPurify.sanitize(raw);
  }, [task?.description]);

  if (error && !task) {
    return (
      <div data-testid="task-detail" style={{ padding: 'var(--sp-8)' }}>
        <InfoBanner tone="error">{error}</InfoBanner>
      </div>
    );
  }

  if (!task) {
    return (
      <div data-testid="task-detail" style={{ display: 'flex', justifyContent: 'center', padding: 'var(--sp-12)' }}>
        <Spinner />
      </div>
    );
  }

  const displayKey = project ? formatTaskKey(project.key, task.taskNumber) : task.key;

  return (
    <div data-testid="task-detail" style={{ maxWidth: 1200, margin: '0 auto' }}>
      <Link
        href={`/org/${orgId}/projects/${projectId}/board`}
        data-testid="task-back-link"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          fontFamily: 'var(--font-display)',
          fontWeight: 500,
          fontSize: 'var(--fs-14)',
          color: 'var(--accent)',
          textDecoration: 'none',
          marginBottom: 'var(--sp-6)',
        }}
      >
        <BackArrowIcon />
        Back to board
      </Link>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 3fr) minmax(280px, 2fr)',
          gap: 'var(--sp-8)',
        }}
      >
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
            <span
              data-testid="task-key"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--fs-14)',
                color: 'var(--text-muted)',
              }}
            >
              {displayKey}
            </span>
            <span
              data-testid="task-type-badge"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: 'var(--bg-sunken)',
                borderRadius: 999,
                padding: '2px 10px',
                fontSize: 'var(--fs-12)',
                fontFamily: 'var(--font-display)',
                fontWeight: 500,
                color: 'var(--text-muted)',
              }}
            >
              <TaskTypeGlyph type={task.type} size={14} />
              {TASK_TYPE_LABEL[task.type]}
            </span>
          </div>

          {/* Title */}
          {editingTitle && !readOnly ? (
            <Input
              autoFocus
              value={titleDraft}
              onChange={(event: { target: { value: string } }) => {
                setTitleDraft(event.target.value);
                if (titleError) setTitleError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  saveTitle();
                } else if (e.key === 'Escape') {
                  cancelTitle();
                }
              }}
              onBlur={() => saveTitle()}
              data-testid="task-title-input"
              aria-invalid={titleError ? true : undefined}
              error={titleError ?? undefined}
              style={{ fontSize: 'var(--fs-22)' }}
              wrapperStyle={{ gap: 0 }}
            />
          ) : (
            <h1
              data-testid="task-title"
              onClick={() => !readOnly && setEditingTitle(true)}
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 600,
                fontSize: 'var(--fs-27)',
                letterSpacing: '-.6px',
                color: 'var(--text)',
                margin: 0,
                cursor: readOnly ? 'default' : 'pointer',
              }}
            >
              {task.title}
            </h1>
          )}

          {/* Description */}
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 'var(--sp-3)',
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
              {!editingDescription && !readOnly && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingDescription(true);
                    setDescriptionDraft(task.description ?? '');
                    setDescriptionError(null);
                  }}
                  data-testid="task-description-edit-btn"
                  aria-label="Edit description"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    padding: 4,
                  }}
                >
                  <PencilIcon />
                </button>
              )}
            </div>
            {editingDescription ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
                <textarea
                  data-testid="task-description-input"
                  value={descriptionDraft}
                  onChange={(e) => {
                    setDescriptionDraft(e.target.value);
                    if (descriptionError) setDescriptionError(null);
                  }}
                  rows={10}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--fs-13)',
                    color: 'var(--text)',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    padding: '12px',
                    resize: 'vertical',
                  }}
                />
                {descriptionError && (
                  <span style={{ color: 'var(--error-500)', fontSize: 'var(--fs-12)' }}>
                    {descriptionError}
                  </span>
                )}
                <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={saveDescription}
                    data-testid="task-description-save-btn"
                  >
                    Save
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditingDescription(false);
                      setDescriptionDraft(task.description ?? '');
                      setDescriptionError(null);
                    }}
                    data-testid="task-description-cancel-btn"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div
                data-testid="task-description"
                style={{
                  padding: task.description ? 'var(--sp-4)' : 0,
                  background: task.description ? 'var(--bg-panel-2)' : 'transparent',
                  border: task.description ? '1px solid var(--divider)' : 'none',
                  borderRadius: 'var(--radius-lg)',
                  fontSize: 'var(--fs-14)',
                  color: task.description ? 'var(--text)' : 'var(--text-faint)',
                  fontStyle: task.description ? 'normal' : 'italic',
                  lineHeight: 1.55,
                }}
              >
                {task.description ? (
                  <div dangerouslySetInnerHTML={{ __html: descriptionHtml }} />
                ) : (
                  'No description'
                )}
              </div>
            )}
          </div>

          {/* Children */}
          <div data-testid="task-children-section">
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--fs-11)',
                letterSpacing: 1,
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                marginBottom: 'var(--sp-3)',
              }}
            >
              Children ({task.children.length})
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                border: task.children.length ? '1px solid var(--divider)' : 'none',
                borderRadius: 'var(--radius-lg)',
                overflow: 'hidden',
                marginBottom: 'var(--sp-3)',
              }}
            >
              {task.children.map((child, i) => (
                <ChildRow
                  key={child.id}
                  child={child}
                  first={i === 0}
                  onOpen={() =>
                    router.push(
                      `/org/${orgId}/projects/${projectId}/tasks/${child.id}`,
                    )
                  }
                />
              ))}
            </div>
            {!readOnly && task.type !== 'epic' && task.type !== 'subtask' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAddSubtaskOpen(true)}
                data-testid="task-add-subtask-btn"
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <PlusIcon />
                  Add subtask
                </span>
              </Button>
            )}
          </div>

          {/* Reserved slots for spec 14 / 15. */}
          <div
            style={{
              padding: 'var(--sp-4)',
              border: '1px dashed var(--border)',
              borderRadius: 'var(--radius-lg)',
              color: 'var(--text-faint)',
              fontSize: 'var(--fs-12)',
            }}
          >
            Comments and activity — spec 14
          </div>
          <div
            style={{
              padding: 'var(--sp-4)',
              border: '1px dashed var(--border)',
              borderRadius: 'var(--radius-lg)',
              color: 'var(--text-faint)',
              fontSize: 'var(--fs-12)',
            }}
          >
            Time logged — spec 15
          </div>
        </div>

        {/* Right column — side panel */}
        <aside
          style={{
            position: 'sticky',
            top: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--sp-5)',
            alignSelf: 'flex-start',
          }}
        >
          <SidePanelField label="Status">
            <Select
              value={task.columnId}
              options={columns.map((c) => ({ value: c.id, label: c.name }))}
              onChange={(v) => void patchTask({ columnId: v })}
              disabled={readOnly}
              data-testid="task-status-select"
            />
          </SidePanelField>

          <SidePanelField label="Assignee">
            <Select
              value={task.assignee?.membershipId ?? ''}
              placeholder="Unassigned"
              options={[
                { value: '', label: 'Unassigned' },
                ...members.map((m) => ({
                  value: m.membershipId,
                  label: `${m.firstName} ${m.lastName}`,
                })),
              ]}
              onChange={(v) => void patchTask({ assigneeId: v || null })}
              disabled={readOnly}
              data-testid="task-assignee-select"
            />
          </SidePanelField>

          <SidePanelField label="Priority">
            <Select
              value={task.priority ?? ''}
              placeholder="None"
              options={[
                { value: '', label: 'None' },
                ...TASK_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] })),
              ]}
              onChange={(v) => void patchTask({ priority: v || null })}
              disabled={readOnly}
              data-testid="task-priority-select"
            />
          </SidePanelField>

          <SidePanelField label="Type">
            <Select
              value={task.type}
              options={TASK_TYPES.map((t) => ({ value: t, label: TASK_TYPE_LABEL[t] }))}
              onChange={(v) => void patchTask({ type: v as TaskType })}
              disabled={readOnly}
              data-testid="task-type-select"
            />
          </SidePanelField>

          <SidePanelField label="Story Points">
            <Input
              type="number"
              min={0}
              max={999}
              step={1}
              value={storyPointsDraft}
              onChange={(event: { target: { value: string } }) =>
                handleStoryPointsChange(event.target.value)
              }
              readOnly={readOnly}
              disabled={readOnly}
              data-testid="task-story-points-input"
              aria-invalid={storyPointsError ? true : undefined}
              error={storyPointsError ?? undefined}
              wrapperStyle={{ gap: 0 }}
            />
          </SidePanelField>

          <SidePanelField label="Due Date">
            <Input
              type="date"
              value={dueDateDraft}
              onChange={(event: { target: { value: string } }) =>
                handleDueDateChange(event.target.value)
              }
              readOnly={readOnly}
              disabled={readOnly}
              data-testid="task-due-date-input"
              aria-invalid={dueDateError ? true : undefined}
              error={dueDateError ?? undefined}
              wrapperStyle={{ gap: 0 }}
            />
          </SidePanelField>

          <SidePanelField label="Parent">
            {task.parent ? (
              <Link
                href={`/org/${orgId}/projects/${projectId}/tasks/${task.parent.id}`}
                data-testid="task-parent-link"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'var(--fs-13)',
                  color: 'var(--accent)',
                  textDecoration: 'none',
                }}
              >
                {task.parent.key}: {task.parent.title}
              </Link>
            ) : (
              <span data-testid="task-parent-link" style={{ color: 'var(--text-faint)' }}>
                None
              </span>
            )}
          </SidePanelField>

          <SidePanelField label="Reporter">
            {task.reporter ? (
              <div
                data-testid="task-reporter"
                style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}
              >
                <AvatarInitials
                  fullName={`${task.reporter.firstName} ${task.reporter.lastName}`}
                  initials={initialsOfMember(task.reporter)}
                  size={22}
                  data-testid={`task-reporter-avatar-${task.reporter.membershipId}`}
                />
                <span style={{ fontSize: 'var(--fs-13)', color: 'var(--text)' }}>
                  {task.reporter.firstName} {task.reporter.lastName}
                </span>
              </div>
            ) : (
              <span data-testid="task-reporter" style={{ color: 'var(--text-faint)' }}>
                —
              </span>
            )}
          </SidePanelField>

          <SidePanelField label="Created">
            <span
              data-testid="task-created-date"
              style={{ fontSize: 'var(--fs-13)', color: 'var(--text)' }}
            >
              {formatDateLong(task.createdAt)}
            </span>
          </SidePanelField>

          {!readOnly && (
            <>
              <div style={{ borderTop: '1px solid var(--divider)', margin: '0' }} />
              <Button
                variant="ghost"
                onClick={() => setDeleteOpen(true)}
                data-testid="task-delete-btn"
                style={{ color: 'var(--error-500)' }}
              >
                Delete task
              </Button>
            </>
          )}
        </aside>
      </div>

      <Modal
        open={deleteOpen}
        onClose={() => !deleting && setDeleteOpen(false)}
        title="Delete task"
        actions={
          <>
            <Button
              variant="secondary"
              size="lg"
              disabled={deleting}
              onClick={() => setDeleteOpen(false)}
              data-testid="task-delete-cancel"
              style={{ flex: 1 }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="lg"
              loading={deleting}
              onClick={confirmDelete}
              data-testid="task-delete-confirm"
              style={{ flex: 1 }}
            >
              Delete task
            </Button>
          </>
        }
      >
        <p style={{ fontFamily: 'var(--font-text)', fontSize: 'var(--fs-15)', color: 'var(--text-sub)' }}>
          Are you sure you want to delete &quot;{displayKey}: {task.title}&quot;? This action
          cannot be undone. Subtasks will be detached.
        </p>
      </Modal>

      {addSubtaskOpen && (
        <CreateTaskModal
          open={addSubtaskOpen}
          orgId={orgId}
          projectId={projectId}
          columns={columns}
          tasks={[]}
          members={members}
          fixedType="subtask"
          fixedParentId={task.id}
          onClose={() => setAddSubtaskOpen(false)}
          onCreated={() => void load()}
        />
      )}
    </div>
  );
}

function SidePanelField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--fs-11)',
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
        }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

function ChildRow({
  child,
  first,
  onOpen,
}: {
  child: KanbanTaskChild;
  first: boolean;
  onOpen: () => void;
}) {
  const isDone = child.columnCategory === 'done';
  return (
    <button
      type="button"
      data-testid={`task-child-${child.id}`}
      onClick={onOpen}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--sp-3)',
        padding: '10px 14px',
        borderTop: first ? 'none' : '1px solid var(--divider)',
        background: 'transparent',
        border: 'none',
        borderTopWidth: first ? 0 : 1,
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: 'var(--radius-sm)',
          border: `1px solid ${isDone ? 'var(--success-500)' : 'var(--border)'}`,
          color: isDone ? 'var(--success-500)' : 'transparent',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        aria-hidden
      >
        {isDone && <CheckIcon size={12} />}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--fs-12)',
          color: 'var(--text-muted)',
          minWidth: 60,
        }}
      >
        {child.key}
      </span>
      <TaskTypeGlyph type={child.type} size={14} />
      <span
        style={{
          flex: 1,
          fontSize: 'var(--fs-14)',
          color: 'var(--text)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {child.title}
      </span>
      {child.assignee && (
        <AvatarInitials
          fullName={`${child.assignee.firstName} ${child.assignee.lastName}`}
          initials={initialsOfMember(child.assignee)}
          size={22}
          data-testid={`task-child-assignee-${child.id}`}
        />
      )}
    </button>
  );
}
