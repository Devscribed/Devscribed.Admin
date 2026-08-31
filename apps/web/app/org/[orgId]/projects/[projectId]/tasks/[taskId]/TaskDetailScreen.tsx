'use client';

import DOMPurify from 'dompurify';
import Link from 'next/link';
import { notFound, useRouter } from 'next/navigation';
import { marked } from 'marked';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, InfoBanner, Input, Modal, Select, Spinner } from '@/ds';
import {
  BackArrowIcon,
  CheckIcon,
  EyeIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from '@/layout/icons';
import { useSession } from '@/layout/session-context';
import { useToast } from '@/toast';
import {
  COLLAB_MESSAGES,
  COMMENT_DELETE_CONFIRM,
  KANBAN_MESSAGES,
  TASK_PRIORITIES,
  TASK_TYPES,
  TIME_TRACKING_MESSAGES,
  can,
  formatActivityDescription,
  formatDurationHuman,
  formatTaskKey,
  validateCommentContent,
  validateDueDate,
  validateStoryPoints,
  validateTaskDescription,
  validateTaskTitle,
  type Role,
  type TaskPriority,
  type TaskType,
} from '@devscribed/validation';
import { useRunningTimer } from '@/layout/running-timer-context';
import { AvatarInitials } from '../../../../members/[memberId]/AvatarInitials';
import type { MemberListResponse } from '../../../../members/types';
import { CreateTaskModal, type OrgMember } from '../../kanban/CreateTaskModal';
import { LabelChip } from '../../kanban/LabelChip';
import type {
  BoardResponse,
  KanbanColumn,
  KanbanLabel,
  KanbanProject,
  KanbanTaskChild,
  KanbanTaskDetail,
  TaskActivityRow,
  TaskComment,
  TaskLabelChip,
  TaskWatcher,
  WatchersResponse,
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
  const canUseTimer = can(role, 'use-timer');

  // Spec 15 — the shell-level running-timer state, so the task detail page can
  // start a timer pre-filled with this task and swap the button for a "running"
  // link when a timer is already active.
  const { timer: runningTimer, start: startTimer } = useRunningTimer();
  const [startingTimer, setStartingTimer] = useState(false);

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

  // Spec 14 collaboration state.
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [watchers, setWatchers] = useState<TaskWatcher[]>([]);
  const [isWatching, setIsWatching] = useState(false);
  const [activity, setActivity] = useState<TaskActivityRow[]>([]);
  const [projectLabels, setProjectLabels] = useState<KanbanLabel[]>([]);
  const [myMembershipId, setMyMembershipId] = useState<string | null>(null);

  // Comment composer + edit state.
  const [commentDraft, setCommentDraft] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);
  const [postingComment, setPostingComment] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentDraft, setEditCommentDraft] = useState('');
  const [editCommentError, setEditCommentError] = useState<string | null>(null);
  const [savingCommentEdit, setSavingCommentEdit] = useState(false);
  const [deleteCommentTarget, setDeleteCommentTarget] = useState<TaskComment | null>(null);
  const [deletingComment, setDeletingComment] = useState(false);
  const [labelPickerOpen, setLabelPickerOpen] = useState(false);
  const labelPickerRootRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const [taskRes, boardRes, commentsRes, watchersRes, activityRes, labelsRes] =
        await Promise.all([
          fetch(`/api/organizations/${orgId}/projects/${projectId}/tasks/${taskId}`, {
            credentials: 'same-origin',
          }),
          fetch(`/api/organizations/${orgId}/projects/${projectId}/board`, {
            credentials: 'same-origin',
          }),
          fetch(
            `/api/organizations/${orgId}/projects/${projectId}/tasks/${taskId}/comments`,
            { credentials: 'same-origin' },
          ),
          fetch(
            `/api/organizations/${orgId}/projects/${projectId}/tasks/${taskId}/watchers`,
            { credentials: 'same-origin' },
          ),
          fetch(
            `/api/organizations/${orgId}/projects/${projectId}/tasks/${taskId}/activity`,
            { credentials: 'same-origin' },
          ),
          fetch(`/api/organizations/${orgId}/projects/${projectId}/labels`, {
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
      if (commentsRes.ok) {
        const data = (await commentsRes.json()) as { comments: TaskComment[] };
        setComments(data.comments ?? []);
      }
      if (watchersRes.ok) {
        const data = (await watchersRes.json()) as WatchersResponse;
        setWatchers(data.watchers ?? []);
        setIsWatching(!!data.isWatching);
      }
      if (activityRes.ok) {
        const data = (await activityRes.json()) as { activity: TaskActivityRow[] };
        setActivity(data.activity ?? []);
      }
      if (labelsRes.ok) {
        const data = (await labelsRes.json()) as { labels: KanbanLabel[] };
        setProjectLabels(data.labels ?? []);
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
        const self = data.members.find((m) => m.isSelf);
        if (self) setMyMembershipId(self.id);
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

  /**
   * Spec 14 — re-fetch watchers + activity in parallel after any mutation that could
   * add rows to either. Silently swallows errors: the primary mutation already showed a
   * toast, and a failed collab refetch just keeps the previous list on screen.
   */
  async function refreshCollab() {
    try {
      const [watchersRes, activityRes] = await Promise.all([
        fetch(
          `/api/organizations/${orgId}/projects/${projectId}/tasks/${taskId}/watchers`,
          { credentials: 'same-origin' },
        ),
        fetch(
          `/api/organizations/${orgId}/projects/${projectId}/tasks/${taskId}/activity`,
          { credentials: 'same-origin' },
        ),
      ]);
      if (watchersRes.ok) {
        const data = (await watchersRes.json()) as WatchersResponse;
        setWatchers(data.watchers ?? []);
        setIsWatching(data.isWatching ?? false);
      }
      if (activityRes.ok) {
        const data = (await activityRes.json()) as { activity: TaskActivityRow[] };
        setActivity(data.activity ?? []);
      }
    } catch {
      // Ignore — a stale collab feed is a UX blip, not a failure to surface.
    }
  }

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
        // Spec 14: every task mutation may add an activity row and (via auto-watch on
        // assigneeId) a watcher row. The task response itself carries neither list, so
        // the sidebar/activity feed would otherwise render stale until a full reload.
        void refreshCollab();
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

  /* ---------------- Spec 14 — collaboration handlers ---------------- */

  const memberMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) map.set(m.membershipId, `${m.firstName} ${m.lastName}`);
    return map;
  }, [members]);

  const columnMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of columns) map.set(c.id, c.name);
    return map;
  }, [columns]);

  const labelNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of projectLabels) map.set(l.id, l.name);
    if (task?.labels) for (const l of task.labels) map.set(l.id, l.name);
    return map;
  }, [projectLabels, task?.labels]);

  const availableLabels = useMemo(() => {
    const assigned = new Set((task?.labels ?? []).map((l) => l.id));
    return projectLabels.filter((l) => !assigned.has(l.id));
  }, [projectLabels, task?.labels]);

  useEffect(() => {
    if (!labelPickerOpen) return;
    function onDown(e: MouseEvent) {
      if (
        labelPickerRootRef.current &&
        !labelPickerRootRef.current.contains(e.target as Node)
      ) {
        setLabelPickerOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setLabelPickerOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [labelPickerOpen]);

  async function assignLabel(label: KanbanLabel) {
    if (!task) return;
    setLabelPickerOpen(false);
    // Optimistic add.
    const chip: TaskLabelChip = { id: label.id, name: label.name, color: label.color };
    setTask({ ...task, labels: [...(task.labels ?? []), chip] });
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/projects/${projectId}/tasks/${task.id}/labels`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ labelId: label.id }),
        },
      );
      if (!response.ok) {
        void load();
        const body = await response.json().catch(() => null);
        showToast(
          'toast-label-assign',
          body?.message ?? COLLAB_MESSAGES.genericError,
          'error',
        );
        return;
      }
      void load();
    } catch {
      void load();
      showToast('toast-label-assign', COLLAB_MESSAGES.genericError, 'error');
    }
  }

  async function removeLabel(labelId: string) {
    if (!task) return;
    const original = task.labels ?? [];
    setTask({ ...task, labels: original.filter((l) => l.id !== labelId) });
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/projects/${projectId}/tasks/${task.id}/labels/${labelId}`,
        { method: 'DELETE', credentials: 'same-origin' },
      );
      if (!response.ok) {
        void load();
        const body = await response.json().catch(() => null);
        showToast(
          'toast-label-remove',
          body?.message ?? COLLAB_MESSAGES.genericError,
          'error',
        );
        return;
      }
      void load();
    } catch {
      void load();
      showToast('toast-label-remove', COLLAB_MESSAGES.genericError, 'error');
    }
  }

  async function submitComment() {
    if (postingComment) return;
    const result = validateCommentContent(commentDraft);
    if (!result.valid) {
      setCommentError(result.error);
      const el = document.querySelector<HTMLTextAreaElement>(
        '[data-testid="task-comment-composer"]',
      );
      el?.focus();
      return;
    }
    setCommentError(null);
    setPostingComment(true);
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/projects/${projectId}/tasks/${taskId}/comments`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ content: result.value }),
        },
      );
      if (response.ok) {
        setCommentDraft('');
        showToast('toast-comment-posted', COLLAB_MESSAGES.toastCommentPosted);
        void load();
      } else {
        const body = await response.json().catch(() => null);
        setCommentError(body?.message ?? COLLAB_MESSAGES.genericError);
      }
    } catch {
      setCommentError(COLLAB_MESSAGES.genericError);
    }
    setPostingComment(false);
  }

  async function saveCommentEdit(comment: TaskComment) {
    if (savingCommentEdit) return;
    const result = validateCommentContent(editCommentDraft);
    if (!result.valid) {
      setEditCommentError(result.error);
      return;
    }
    setEditCommentError(null);
    setSavingCommentEdit(true);
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/projects/${projectId}/tasks/${taskId}/comments/${comment.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ content: result.value }),
        },
      );
      if (response.ok) {
        setEditingCommentId(null);
        setEditCommentDraft('');
        showToast('toast-comment-updated', COLLAB_MESSAGES.toastCommentUpdated);
        void load();
      } else {
        const body = await response.json().catch(() => null);
        setEditCommentError(body?.message ?? COLLAB_MESSAGES.genericError);
      }
    } catch {
      setEditCommentError(COLLAB_MESSAGES.genericError);
    }
    setSavingCommentEdit(false);
  }

  async function confirmDeleteComment(comment: TaskComment) {
    if (deletingComment) return;
    setDeletingComment(true);
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/projects/${projectId}/tasks/${taskId}/comments/${comment.id}`,
        { method: 'DELETE', credentials: 'same-origin' },
      );
      if (response.ok) {
        setDeleteCommentTarget(null);
        showToast('toast-comment-deleted', COLLAB_MESSAGES.toastCommentDeleted);
        void load();
      } else {
        const body = await response.json().catch(() => null);
        showToast(
          'toast-comment-deleted',
          body?.message ?? COLLAB_MESSAGES.genericError,
          'error',
        );
      }
    } catch {
      showToast('toast-comment-deleted', COLLAB_MESSAGES.genericError, 'error');
    }
    setDeletingComment(false);
  }

  /**
   * Spec 15 — start a timer pre-filled with this task's project + id. The server
   * computes the `task` label from the referenced task (FR-2), so no `task` field
   * is sent. On conflict (spec 12 FR-11 one-timer-per-member) the button already
   * swaps to the running-link state, so we only surface the toast on real errors.
   */
  async function handleStartTimer() {
    if (startingTimer || !task) return;
    setStartingTimer(true);
    const result = await startTimer({
      projectId,
      taskId: task.id,
      task: null,
      description: null,
    });
    setStartingTimer(false);
    if (result.ok) {
      showToast('toast-timer-started', TIME_TRACKING_MESSAGES.toastTimerStarted);
    } else if (result.conflict) {
      showToast(
        'toast-timer-started',
        result.message ?? TIME_TRACKING_MESSAGES.timerAlreadyRunning,
        'error',
      );
    } else {
      showToast(
        'toast-timer-started',
        result.message ?? TIME_TRACKING_MESSAGES.genericError,
        'error',
      );
    }
  }

  async function toggleWatch() {
    const nextWatching = !isWatching;
    setIsWatching(nextWatching);
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/projects/${projectId}/tasks/${taskId}/watchers`,
        {
          method: nextWatching ? 'POST' : 'DELETE',
          credentials: 'same-origin',
        },
      );
      if (!response.ok) {
        setIsWatching(!nextWatching);
        const body = await response.json().catch(() => null);
        showToast(
          'toast-watch-toggle',
          body?.message ?? COLLAB_MESSAGES.genericError,
          'error',
        );
        return;
      }
      showToast(
        'toast-watch-toggle',
        nextWatching
          ? COLLAB_MESSAGES.toastNowWatching
          : COLLAB_MESSAGES.toastUnwatched,
      );
      void load();
    } catch {
      setIsWatching(!nextWatching);
      showToast('toast-watch-toggle', COLLAB_MESSAGES.genericError, 'error');
    }
  }

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

          {/* Comments section (spec 14) */}
          <CommentsSection
            comments={comments}
            myMembershipId={myMembershipId}
            role={role}
            readOnly={archived}
            commentDraft={commentDraft}
            commentError={commentError}
            postingComment={postingComment}
            onDraftChange={(v) => {
              setCommentDraft(v);
              if (commentError) setCommentError(null);
            }}
            onSubmit={submitComment}
            editingCommentId={editingCommentId}
            editCommentDraft={editCommentDraft}
            editCommentError={editCommentError}
            savingCommentEdit={savingCommentEdit}
            onStartEdit={(c) => {
              setEditingCommentId(c.id);
              setEditCommentDraft(c.content);
              setEditCommentError(null);
            }}
            onEditDraftChange={(v) => {
              setEditCommentDraft(v);
              if (editCommentError) setEditCommentError(null);
            }}
            onEditSave={(c) => void saveCommentEdit(c)}
            onEditCancel={() => {
              setEditingCommentId(null);
              setEditCommentDraft('');
              setEditCommentError(null);
            }}
            onRequestDelete={(c) => setDeleteCommentTarget(c)}
          />

          {/* Activity section (spec 14) */}
          <ActivitySection
            activity={activity}
            resolveMember={(id) =>
              id ? memberMap.get(id) ?? 'Unknown' : 'Unassigned'
            }
            resolveColumn={(id) => (id ? columnMap.get(id) ?? '(deleted column)' : '')}
            resolveLabel={(id) => (id ? labelNameMap.get(id) ?? '(deleted label)' : '')}
            resolveTask={(id) => (id ? id : 'None')}
          />

          {/* Spec 15 — Time Logged section (aggregate + recent entries). */}
          <TimeLoggedSection
            orgId={orgId}
            totalMinutes={task.timeLoggedMinutes ?? 0}
            entries={task.recentTimeEntries ?? []}
          />
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
          {/* Spec 15 — Start Timer button / Running-link, gated on `use-timer`. */}
          {canUseTimer &&
            (runningTimer ? (
              <Link
                href={`/org/${orgId}/time-tracking`}
                data-testid="task-timer-running-link"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 'var(--sp-2)',
                  alignSelf: 'flex-start',
                  padding: '8px 14px',
                  borderRadius: 'var(--radius-lg)',
                  background: 'var(--tracker-bg)',
                  border: '1px solid var(--tracker-border)',
                  color: 'var(--amber-700)',
                  fontFamily: 'var(--font-display)',
                  fontWeight: 600,
                  fontSize: 'var(--fs-13)',
                  textDecoration: 'none',
                }}
              >
                <span aria-hidden>⏱</span> Timer running →
              </Link>
            ) : (
              <Button
                variant="primary"
                loading={startingTimer}
                onClick={() => void handleStartTimer()}
                data-testid="task-start-timer-btn"
              >
                <span
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <span aria-hidden>▶</span> Start Timer
                </span>
              </Button>
            ))}

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

          {/* Labels section (spec 14 — side panel). */}
          <div
            data-testid="task-labels-section"
            ref={labelPickerRootRef}
            style={{ display: 'flex', flexDirection: 'column', gap: 6, position: 'relative' }}
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
              Labels
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              {(task.labels ?? []).map((label) => (
                <LabelChip
                  key={label.id}
                  label={label}
                  size="md"
                  testId={`task-label-chip-${label.id}`}
                  removeTestId={`task-label-remove-${label.id}`}
                  onRemove={!readOnly ? () => void removeLabel(label.id) : undefined}
                />
              ))}
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => setLabelPickerOpen((v) => !v)}
                  data-testid="task-label-add-btn"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    background: 'transparent',
                    border: '1px dashed var(--border)',
                    borderRadius: 999,
                    padding: '3px 10px',
                    color: 'var(--text-muted)',
                    fontFamily: 'var(--font-display)',
                    fontSize: 'var(--fs-12)',
                    cursor: 'pointer',
                  }}
                >
                  <PlusIcon size={10} />
                  Add label
                </button>
              )}
              {(task.labels ?? []).length === 0 && readOnly && (
                <span style={{ color: 'var(--text-faint)', fontSize: 'var(--fs-13)' }}>—</span>
              )}
            </div>
            {labelPickerOpen && !readOnly && (
              <div
                data-testid="task-label-picker"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  left: 0,
                  right: 0,
                  zIndex: 40,
                  background: 'var(--bg-panel)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: 'var(--shadow-pop)',
                  padding: 'var(--sp-2)',
                  maxHeight: 240,
                  overflowY: 'auto',
                }}
              >
                {availableLabels.length === 0 ? (
                  <div
                    style={{
                      padding: 'var(--sp-3)',
                      color: 'var(--text-muted)',
                      fontSize: 'var(--fs-12)',
                    }}
                  >
                    No labels available.
                  </div>
                ) : (
                  availableLabels.map((label) => (
                    <button
                      key={label.id}
                      type="button"
                      onClick={() => void assignLabel(label)}
                      data-testid={`task-label-picker-option-${label.id}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        width: '100%',
                        padding: '6px 8px',
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        borderRadius: 'var(--radius-sm)',
                        textAlign: 'left',
                      }}
                    >
                      <span
                        aria-hidden
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          background: label.color,
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontSize: 'var(--fs-13)',
                          color: 'var(--text)',
                        }}
                      >
                        {label.name}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Watchers section (spec 14 — side panel). */}
          <WatchersSection
            watchers={watchers}
            isWatching={isWatching}
            onToggle={toggleWatch}
            disabled={false}
          />

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

      <Modal
        open={deleteCommentTarget !== null}
        onClose={() => !deletingComment && setDeleteCommentTarget(null)}
        title="Delete comment"
        actions={
          <>
            <Button
              variant="secondary"
              size="lg"
              disabled={deletingComment}
              onClick={() => setDeleteCommentTarget(null)}
              data-testid="task-comment-delete-cancel"
              style={{ flex: 1 }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="lg"
              loading={deletingComment}
              onClick={() =>
                deleteCommentTarget && void confirmDeleteComment(deleteCommentTarget)
              }
              data-testid="task-comment-delete-confirm"
              style={{ flex: 1 }}
            >
              Delete comment
            </Button>
          </>
        }
      >
        <p style={{ fontFamily: 'var(--font-text)', fontSize: 'var(--fs-15)', color: 'var(--text-sub)' }}>
          {COMMENT_DELETE_CONFIRM}
        </p>
      </Modal>
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

/* ---------------- Spec 14 — Comments / Watchers / Activity ---------------- */

const EDITED_THRESHOLD_MS = 5000;

function CommentsSection({
  comments,
  myMembershipId,
  role,
  readOnly,
  commentDraft,
  commentError,
  postingComment,
  onDraftChange,
  onSubmit,
  editingCommentId,
  editCommentDraft,
  editCommentError,
  savingCommentEdit,
  onStartEdit,
  onEditDraftChange,
  onEditSave,
  onEditCancel,
  onRequestDelete,
}: {
  comments: TaskComment[];
  myMembershipId: string | null;
  role: Role;
  readOnly: boolean;
  commentDraft: string;
  commentError: string | null;
  postingComment: boolean;
  onDraftChange: (v: string) => void;
  onSubmit: () => void;
  editingCommentId: string | null;
  editCommentDraft: string;
  editCommentError: string | null;
  savingCommentEdit: boolean;
  onStartEdit: (c: TaskComment) => void;
  onEditDraftChange: (v: string) => void;
  onEditSave: (c: TaskComment) => void;
  onEditCancel: () => void;
  onRequestDelete: (c: TaskComment) => void;
}) {
  const canDeleteAny = role === 'admin' || role === 'manager';
  return (
    <div data-testid="task-comments-section" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--fs-11)',
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
        }}
      >
        Comments ({comments.length})
      </div>
      {!readOnly && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
          <textarea
            data-testid="task-comment-composer"
            value={commentDraft}
            onChange={(e) => onDraftChange(e.target.value)}
            placeholder="Write a comment... (markdown)"
            rows={3}
            style={{
              fontFamily: 'var(--font-text)',
              fontSize: 'var(--fs-14)',
              color: 'var(--text)',
              background: 'var(--bg-input)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '10px 12px',
              resize: 'vertical',
              minHeight: 72,
            }}
          />
          {commentError && (
            <span
              style={{ color: 'var(--error-500)', fontSize: 'var(--fs-12)' }}
              data-testid="task-comment-composer-error"
            >
              {commentError}
            </span>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              type="button"
              variant="primary"
              size="sm"
              loading={postingComment}
              onClick={onSubmit}
              data-testid="task-comment-submit-btn"
            >
              Comment
            </Button>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
        {comments.length === 0 ? (
          <div
            style={{
              padding: 'var(--sp-4)',
              color: 'var(--text-faint)',
              fontSize: 'var(--fs-13)',
              fontStyle: 'italic',
              background: 'var(--bg-panel-2)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--divider)',
            }}
          >
            {COLLAB_MESSAGES.emptyComments}
          </div>
        ) : (
          comments.map((c) => (
            <CommentRow
              key={c.id}
              comment={c}
              isMine={c.author.membershipId === myMembershipId}
              canDeleteAny={canDeleteAny}
              editing={editingCommentId === c.id}
              editDraft={editCommentDraft}
              editError={editingCommentId === c.id ? editCommentError : null}
              saving={editingCommentId === c.id && savingCommentEdit}
              onStartEdit={() => onStartEdit(c)}
              onEditDraftChange={onEditDraftChange}
              onEditSave={() => onEditSave(c)}
              onEditCancel={onEditCancel}
              onRequestDelete={() => onRequestDelete(c)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function CommentRow({
  comment,
  isMine,
  canDeleteAny,
  editing,
  editDraft,
  editError,
  saving,
  onStartEdit,
  onEditDraftChange,
  onEditSave,
  onEditCancel,
  onRequestDelete,
}: {
  comment: TaskComment;
  isMine: boolean;
  canDeleteAny: boolean;
  editing: boolean;
  editDraft: string;
  editError: string | null;
  saving: boolean;
  onStartEdit: () => void;
  onEditDraftChange: (v: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onRequestDelete: () => void;
}) {
  const canEdit = isMine;
  const canDelete = isMine || canDeleteAny;
  const wasEdited =
    new Date(comment.updatedAt).getTime() - new Date(comment.createdAt).getTime() >
    EDITED_THRESHOLD_MS;
  const html = useMemo(() => {
    const raw = marked.parse(comment.content, { async: false }) as string;
    return DOMPurify.sanitize(raw);
  }, [comment.content]);
  const fullName = `${comment.author.firstName} ${comment.author.lastName}`;
  const initials = `${comment.author.firstName[0] ?? ''}${comment.author.lastName[0] ?? ''}`.toUpperCase();
  return (
    <div
      data-testid={`task-comment-${comment.id}`}
      style={{
        display: 'flex',
        gap: 'var(--sp-3)',
        padding: 'var(--sp-4)',
        background: 'var(--bg-panel-2)',
        border: '1px solid var(--divider)',
        borderRadius: 'var(--radius-lg)',
      }}
    >
      <AvatarInitials fullName={fullName} initials={initials} size={28} data-testid={`task-comment-avatar-${comment.id}`} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span
            data-testid={`task-comment-author-${comment.id}`}
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: 'var(--fs-13)',
              color: 'var(--text)',
            }}
          >
            {fullName}
          </span>
          <span style={{ fontSize: 'var(--fs-12)', color: 'var(--text-muted)' }}>
            {formatCommentTimestamp(comment.createdAt)}
          </span>
          {wasEdited && (
            <span
              data-testid={`task-comment-edited-badge-${comment.id}`}
              style={{ fontSize: 'var(--fs-12)', color: 'var(--text-faint)' }}
            >
              (edited)
            </span>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            {!editing && canEdit && (
              <button
                type="button"
                onClick={onStartEdit}
                data-testid={`task-comment-edit-btn-${comment.id}`}
                aria-label="Edit comment"
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
            {!editing && canDelete && (
              <button
                type="button"
                onClick={onRequestDelete}
                data-testid={`task-comment-delete-btn-${comment.id}`}
                aria-label="Delete comment"
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  padding: 4,
                }}
              >
                <TrashIcon />
              </button>
            )}
          </div>
        </div>
        {editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', marginTop: 'var(--sp-2)' }}>
            <textarea
              data-testid={`task-comment-edit-composer-${comment.id}`}
              value={editDraft}
              onChange={(e) => onEditDraftChange(e.target.value)}
              rows={3}
              style={{
                fontFamily: 'var(--font-text)',
                fontSize: 'var(--fs-14)',
                color: 'var(--text)',
                background: 'var(--bg-input)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '10px 12px',
                resize: 'vertical',
              }}
            />
            {editError && (
              <span style={{ color: 'var(--error-500)', fontSize: 'var(--fs-12)' }}>
                {editError}
              </span>
            )}
            <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
              <Button
                type="button"
                variant="primary"
                size="sm"
                loading={saving}
                onClick={onEditSave}
                data-testid={`task-comment-edit-save-${comment.id}`}
              >
                Save
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onEditCancel}
                data-testid={`task-comment-edit-cancel-${comment.id}`}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div
            data-testid={`task-comment-content-${comment.id}`}
            style={{
              fontSize: 'var(--fs-14)',
              color: 'var(--text)',
              marginTop: 6,
              lineHeight: 1.55,
              wordBreak: 'break-word',
            }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
      </div>
    </div>
  );
}

function WatchersSection({
  watchers,
  isWatching,
  onToggle,
  disabled,
}: {
  watchers: TaskWatcher[];
  isWatching: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  const visible = watchers.slice(0, 5);
  const overflow = watchers.length - visible.length;
  return (
    <div
      data-testid="task-watchers-section"
      style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
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
        Watchers (
        <span data-testid="task-watchers-count">{watchers.length}</span>)
      </span>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        data-testid="task-watch-toggle-btn"
        aria-pressed={isWatching}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          alignSelf: 'flex-start',
          padding: '6px 12px',
          borderRadius: 999,
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--fs-12)',
          fontWeight: 500,
          cursor: disabled ? 'not-allowed' : 'pointer',
          background: isWatching ? 'var(--accent-soft)' : 'var(--bg-input)',
          color: isWatching ? 'var(--accent)' : 'var(--text)',
          border: `1px solid ${isWatching ? 'var(--accent)' : 'var(--border)'}`,
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <EyeIcon size={14} />
        {isWatching ? 'Watching' : 'Watch'}
      </button>
      {watchers.length === 0 ? (
        <span style={{ color: 'var(--text-faint)', fontSize: 'var(--fs-12)' }}>
          {COLLAB_MESSAGES.emptyWatchers}
        </span>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 4 }}>
          {visible.map((w, i) => (
            <span
              key={w.membershipId}
              title={`${w.firstName} ${w.lastName}`}
              style={{ marginLeft: i === 0 ? 0 : -6 }}
            >
              <AvatarInitials
                fullName={`${w.firstName} ${w.lastName}`}
                initials={`${w.firstName[0] ?? ''}${w.lastName[0] ?? ''}`.toUpperCase()}
                size={24}
                data-testid={`task-watcher-avatar-${w.membershipId}`}
              />
            </span>
          ))}
          {overflow > 0 && (
            <span
              style={{
                marginLeft: 6,
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--fs-11)',
                color: 'var(--text-muted)',
              }}
            >
              +{overflow} more
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function ActivitySection({
  activity,
  resolveMember,
  resolveColumn,
  resolveLabel,
  resolveTask,
}: {
  activity: TaskActivityRow[];
  resolveMember: (id: string | null) => string;
  resolveColumn: (id: string | null) => string;
  resolveLabel: (id: string | null) => string;
  resolveTask: (id: string | null) => string;
}) {
  return (
    <div data-testid="task-activity-section" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--fs-11)',
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
        }}
      >
        Activity
      </div>
      {activity.length === 0 ? (
        <div
          style={{
            padding: 'var(--sp-4)',
            color: 'var(--text-faint)',
            fontSize: 'var(--fs-13)',
            fontStyle: 'italic',
            background: 'var(--bg-panel-2)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--divider)',
          }}
        >
          {COLLAB_MESSAGES.emptyActivity}
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--sp-3)',
            padding: 'var(--sp-4)',
            background: 'var(--bg-panel-2)',
            border: '1px solid var(--divider)',
            borderRadius: 'var(--radius-lg)',
            maxHeight: 400,
            overflowY: 'auto',
          }}
        >
          {activity.map((row) => {
            const actorName = row.actor
              ? `${row.actor.firstName} ${row.actor.lastName}`
              : 'Unknown';
            const initials = row.actor
              ? `${row.actor.firstName[0] ?? ''}${row.actor.lastName[0] ?? ''}`.toUpperCase()
              : '?';
            const description = formatActivityDescription(row, {
              resolveMember,
              resolveColumn,
              resolveLabel,
              resolveTask,
            });
            return (
              <div
                key={row.id}
                data-testid={`task-activity-entry-${row.id}`}
                style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'flex-start' }}
              >
                <AvatarInitials fullName={actorName} initials={initials} size={22} data-testid={`task-activity-actor-${row.id}`} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 'var(--fs-13)', color: 'var(--text)' }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                      {actorName}
                    </span>{' '}
                    {description}
                  </div>
                  <div style={{ fontSize: 'var(--fs-11)', color: 'var(--text-muted)', marginTop: 2 }}>
                    {formatCommentTimestamp(row.createdAt)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Spec 15 §UI Description — the Time Logged section on task detail. Sits between the
 * children/comments blocks in the left column. The row list is server-capped at
 * `TASK_TIME_LOGGED_RECENT_LIMIT` (10) and each row deep-links into the daily view
 * for that entry's date. Visibility per role is enforced server-side (FR-18): the
 * caller sees whatever the API decided they may see.
 */
function TimeLoggedSection({
  orgId,
  totalMinutes,
  entries,
}: {
  orgId: string;
  totalMinutes: number;
  entries: import('../../kanban/types').TaskTimeEntryRow[];
}) {
  const isEmpty = totalMinutes === 0 && entries.length === 0;
  return (
    <div
      data-testid="task-time-logged-section"
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 'var(--sp-3)',
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
          Time Logged
        </span>
        <span
          data-testid="task-time-logged-total"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--fs-15)',
            color: 'var(--text)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {formatDurationHuman(totalMinutes)}
        </span>
      </div>
      {isEmpty ? (
        <div
          data-testid="task-time-logged-empty"
          style={{
            padding: 'var(--sp-4)',
            color: 'var(--text-faint)',
            fontSize: 'var(--fs-13)',
            fontStyle: 'italic',
            background: 'var(--bg-panel-2)',
            border: '1px solid var(--divider)',
            borderRadius: 'var(--radius-lg)',
          }}
        >
          {TIME_TRACKING_MESSAGES.emptyTimeLogged}
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            border: '1px solid var(--divider)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
          }}
        >
          {entries.map((entry, i) => (
            <Link
              key={entry.id}
              href={`/org/${orgId}/time-tracking?view=daily&date=${entry.date}`}
              data-testid={`task-time-logged-entry-${entry.id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--sp-3)',
                padding: '10px 14px',
                borderTop: i === 0 ? 'none' : '1px solid var(--divider)',
                textDecoration: 'none',
                color: 'var(--text)',
                background: 'transparent',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'var(--fs-13)',
                  color: 'var(--text)',
                  minWidth: 110,
                }}
              >
                {formatEntryDate(entry.date)}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--fs-13)',
                  color: 'var(--text-muted)',
                  fontVariantNumeric: 'tabular-nums',
                  minWidth: 70,
                }}
              >
                {formatDurationHuman(entry.durationMinutes)}
              </span>
              <span
                style={{
                  flex: 1,
                  fontSize: 'var(--fs-13)',
                  color: 'var(--text-sub)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {entry.memberName}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** Format a `YYYY-MM-DD` entry date as "Aug 27, 2026" (UTC-anchored to avoid a
 * midnight-flip when the viewer's local zone is behind UTC). */
function formatEntryDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function formatCommentTimestamp(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
