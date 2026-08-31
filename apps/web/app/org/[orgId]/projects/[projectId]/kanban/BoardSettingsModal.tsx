'use client';

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEffect, useState, type CSSProperties } from 'react';
import { Button, IconButton, Input, Modal } from '@/ds';
import { DragHandleIcon, PencilIcon, PlusIcon, TrashIcon } from '@/layout/icons';
import { useSession } from '@/layout/session-context';
import { useToast } from '@/toast';
import {
  COLLAB_MESSAGES,
  KANBAN_MESSAGES,
  can,
  labelDeleteConfirmMessage,
  validateColumnName,
  validateLabelColor,
  validateLabelName,
  type Role,
} from '@devscribed/validation';
import type { KanbanColumn, KanbanLabel } from './types';

/**
 * Board Settings modal (spec 13 §Board Settings modal, extended by spec 14
 * §Board Settings Modal — Labels Section). Two sections:
 *   1. Columns — inline rename, drag-reorder, delete (disabled if the column
 *      has tasks), and a "+ Add Column" affordance.
 *   2. Labels — create/edit/delete project-scoped labels (admin/manager only;
 *      spec 14 FR-3). Delete opens a confirmation stating how many tasks lose
 *      the label.
 * Every mutation fires against the API and, on success, calls `onChanged` so
 * the Board reloads.
 */
export function BoardSettingsModal({
  open,
  orgId,
  projectId,
  columns,
  onClose,
  onChanged,
}: {
  open: boolean;
  orgId: string;
  projectId: string;
  columns: KanbanColumn[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { showToast } = useToast();
  const session = useSession();
  const role = session.role as Role;
  const canManageLabels = can(role, 'manage-labels');

  const [localColumns, setLocalColumns] = useState<KanbanColumn[]>(columns);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [addDraft, setAddDraft] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<KanbanColumn | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Labels state (spec 14).
  const [labels, setLabels] = useState<KanbanLabel[]>([]);
  const [labelEditingId, setLabelEditingId] = useState<string | null>(null);
  const [labelDraftName, setLabelDraftName] = useState('');
  const [labelDraftColor, setLabelDraftColor] = useState('');
  const [labelEditNameError, setLabelEditNameError] = useState<string | null>(null);
  const [labelEditColorError, setLabelEditColorError] = useState<string | null>(null);
  const [labelAdding, setLabelAdding] = useState(false);
  const [labelAddName, setLabelAddName] = useState('');
  const [labelAddColor, setLabelAddColor] = useState<string>(LABEL_SWATCHES[0]);
  const [labelAddNameError, setLabelAddNameError] = useState<string | null>(null);
  const [labelAddColorError, setLabelAddColorError] = useState<string | null>(null);
  const [labelDeleteTarget, setLabelDeleteTarget] = useState<KanbanLabel | null>(null);
  const [labelDeleting, setLabelDeleting] = useState(false);

  useEffect(() => {
    if (open) {
      setLocalColumns(columns);
      setEditingId(null);
      setEditDraft('');
      setEditError(null);
      setAdding(false);
      setAddDraft('');
      setAddError(null);
      setDeleteTarget(null);
      setLabelEditingId(null);
      setLabelAdding(false);
      setLabelDeleteTarget(null);
      void loadLabels();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, columns]);

  async function loadLabels() {
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/projects/${projectId}/labels`,
        { credentials: 'same-origin' },
      );
      if (!response.ok) return;
      const data = (await response.json()) as { labels: KanbanLabel[] };
      setLabels(data.labels ?? []);
    } catch {
      // non-blocking — the Columns section is still usable.
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function reorder(nextOrder: KanbanColumn[]) {
    const columnIds = nextOrder.map((c) => c.id);
    setLocalColumns(nextOrder);
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/projects/${projectId}/board/columns/reorder`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ columnIds }),
        },
      );
      if (!response.ok) {
        setLocalColumns(columns);
        const body = await response.json().catch(() => null);
        showToast(
          'toast-column-reordered',
          body?.message ?? KANBAN_MESSAGES.genericError,
          'error',
        );
        return;
      }
      onChanged();
    } catch {
      setLocalColumns(columns);
      showToast('toast-column-reordered', KANBAN_MESSAGES.genericError, 'error');
    }
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = localColumns.findIndex((c) => c.id === active.id);
    const to = localColumns.findIndex((c) => c.id === over.id);
    if (from < 0 || to < 0) return;
    void reorder(arrayMove(localColumns, from, to));
  }

  async function saveRename(column: KanbanColumn) {
    const result = validateColumnName(editDraft);
    if (!result.valid) {
      setEditError(result.error);
      return;
    }
    if (result.value === column.name) {
      setEditingId(null);
      setEditDraft('');
      setEditError(null);
      return;
    }
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/projects/${projectId}/board/columns/${column.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ name: result.value }),
        },
      );
      if (response.ok) {
        setEditingId(null);
        setEditDraft('');
        setEditError(null);
        showToast('toast-column-updated', KANBAN_MESSAGES.toastColumnUpdated);
        onChanged();
        return;
      }
      const body = await response.json().catch(() => null);
      if (response.status === 409) {
        setEditError(KANBAN_MESSAGES.columnNameDuplicate);
      } else {
        setEditError(body?.message ?? KANBAN_MESSAGES.genericError);
      }
    } catch {
      setEditError(KANBAN_MESSAGES.genericError);
    }
  }

  async function saveAdd() {
    const result = validateColumnName(addDraft);
    if (!result.valid) {
      setAddError(result.error);
      return;
    }
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/projects/${projectId}/board/columns`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ name: result.value }),
        },
      );
      if (response.ok) {
        setAdding(false);
        setAddDraft('');
        setAddError(null);
        showToast('toast-column-created', KANBAN_MESSAGES.toastColumnCreated);
        onChanged();
        return;
      }
      const body = await response.json().catch(() => null);
      if (response.status === 409) {
        setAddError(KANBAN_MESSAGES.columnNameDuplicate);
      } else {
        setAddError(body?.message ?? KANBAN_MESSAGES.genericError);
      }
    } catch {
      setAddError(KANBAN_MESSAGES.genericError);
    }
  }

  async function confirmDelete(column: KanbanColumn) {
    setDeleting(true);
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/projects/${projectId}/board/columns/${column.id}`,
        { method: 'DELETE', credentials: 'same-origin' },
      );
      if (response.ok) {
        setDeleteTarget(null);
        showToast('toast-column-deleted', KANBAN_MESSAGES.toastColumnDeleted);
        onChanged();
      } else {
        const body = await response.json().catch(() => null);
        showToast(
          'toast-column-deleted',
          body?.message ?? KANBAN_MESSAGES.genericError,
          'error',
        );
      }
    } catch {
      showToast('toast-column-deleted', KANBAN_MESSAGES.genericError, 'error');
    }
    setDeleting(false);
  }

  /* ---------------- Labels (spec 14) ---------------- */

  async function saveAddLabel() {
    const nameResult = validateLabelName(labelAddName);
    const colorResult = validateLabelColor(labelAddColor);
    if (!nameResult.valid || !colorResult.valid) {
      setLabelAddNameError(nameResult.valid ? null : nameResult.error);
      setLabelAddColorError(colorResult.valid ? null : colorResult.error);
      return;
    }
    setLabelAddNameError(null);
    setLabelAddColorError(null);
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/projects/${projectId}/labels`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ name: nameResult.value, color: colorResult.value }),
        },
      );
      if (response.ok) {
        setLabelAdding(false);
        setLabelAddName('');
        setLabelAddColor(LABEL_SWATCHES[0]);
        showToast('toast-label-created', COLLAB_MESSAGES.toastLabelCreated);
        await loadLabels();
        onChanged();
        return;
      }
      const body = await response.json().catch(() => null);
      if (response.status === 409) {
        setLabelAddNameError(COLLAB_MESSAGES.labelNameDuplicate);
      } else {
        setLabelAddNameError(body?.message ?? COLLAB_MESSAGES.genericError);
      }
    } catch {
      setLabelAddNameError(COLLAB_MESSAGES.genericError);
    }
  }

  async function saveEditLabel(label: KanbanLabel) {
    const nameResult = validateLabelName(labelDraftName);
    const colorResult = validateLabelColor(labelDraftColor);
    if (!nameResult.valid || !colorResult.valid) {
      setLabelEditNameError(nameResult.valid ? null : nameResult.error);
      setLabelEditColorError(colorResult.valid ? null : colorResult.error);
      return;
    }
    setLabelEditNameError(null);
    setLabelEditColorError(null);
    if (nameResult.value === label.name && colorResult.value === label.color) {
      setLabelEditingId(null);
      return;
    }
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/projects/${projectId}/labels/${label.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ name: nameResult.value, color: colorResult.value }),
        },
      );
      if (response.ok) {
        setLabelEditingId(null);
        showToast('toast-label-updated', COLLAB_MESSAGES.toastLabelUpdated);
        await loadLabels();
        onChanged();
        return;
      }
      const body = await response.json().catch(() => null);
      if (response.status === 409) {
        setLabelEditNameError(COLLAB_MESSAGES.labelNameDuplicate);
      } else {
        setLabelEditNameError(body?.message ?? COLLAB_MESSAGES.genericError);
      }
    } catch {
      setLabelEditNameError(COLLAB_MESSAGES.genericError);
    }
  }

  async function confirmLabelDelete(label: KanbanLabel) {
    setLabelDeleting(true);
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/projects/${projectId}/labels/${label.id}`,
        { method: 'DELETE', credentials: 'same-origin' },
      );
      if (response.ok) {
        setLabelDeleteTarget(null);
        showToast('toast-label-deleted', COLLAB_MESSAGES.toastLabelDeleted);
        await loadLabels();
        onChanged();
      } else {
        const body = await response.json().catch(() => null);
        showToast(
          'toast-label-deleted',
          body?.message ?? COLLAB_MESSAGES.genericError,
          'error',
        );
      }
    } catch {
      showToast('toast-label-deleted', COLLAB_MESSAGES.genericError, 'error');
    }
    setLabelDeleting(false);
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Board Settings"
        width={520}
        data-testid="board-settings-modal"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)' }}>
          <div>
            <MicroLabel>Columns</MicroLabel>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={onDragEnd}
            >
              <SortableContext
                items={localColumns.map((c) => c.id)}
                strategy={verticalListSortingStrategy}
              >
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    marginTop: 'var(--sp-3)',
                    border: '1px solid var(--divider)',
                    borderRadius: 'var(--radius-lg)',
                    overflow: 'hidden',
                  }}
                >
                  {localColumns.map((column) => (
                    <SortableColumnRow
                      key={column.id}
                      column={column}
                      editing={editingId === column.id}
                      editDraft={editDraft}
                      editError={editingId === column.id ? editError : null}
                      onStartEdit={() => {
                        setEditingId(column.id);
                        setEditDraft(column.name);
                        setEditError(null);
                      }}
                      onEditChange={(v) => {
                        setEditDraft(v);
                        if (editError) setEditError(null);
                      }}
                      onEditSave={() => void saveRename(column)}
                      onEditCancel={() => {
                        setEditingId(null);
                        setEditDraft('');
                        setEditError(null);
                      }}
                      onDelete={() => setDeleteTarget(column)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>

          {adding ? (
            <div
              style={{
                display: 'flex',
                gap: 'var(--sp-2)',
                alignItems: 'flex-start',
              }}
            >
              <Input
                autoFocus
                value={addDraft}
                onChange={(event: { target: { value: string } }) => {
                  setAddDraft(event.target.value);
                  if (addError) setAddError(null);
                }}
                placeholder="Column name"
                data-testid="board-settings-column-name-input"
                aria-invalid={addError ? true : undefined}
                error={addError ?? undefined}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void saveAdd();
                  } else if (e.key === 'Escape') {
                    setAdding(false);
                    setAddDraft('');
                    setAddError(null);
                  }
                }}
                style={{ flex: 1 }}
                wrapperStyle={{ gap: 0, flex: 1 }}
              />
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={() => void saveAdd()}
              >
                Add
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="md"
                onClick={() => {
                  setAdding(false);
                  setAddDraft('');
                  setAddError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setAdding(true)}
              data-testid="board-settings-column-add"
              style={{ alignSelf: 'flex-start' }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <PlusIcon />
                Add Column
              </span>
            </Button>
          )}

          {/* --- Labels section (spec 14) --- */}
          <div data-testid="board-settings-labels-section">
            <MicroLabel>Labels</MicroLabel>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                marginTop: 'var(--sp-3)',
                border: labels.length
                  ? '1px solid var(--divider)'
                  : '1px dashed var(--border)',
                borderRadius: 'var(--radius-lg)',
                overflow: 'hidden',
              }}
            >
              {labels.length === 0 ? (
                <div
                  style={{
                    padding: 'var(--sp-5)',
                    color: 'var(--text-faint)',
                    fontSize: 'var(--fs-12)',
                    fontStyle: 'italic',
                  }}
                >
                  No labels yet.
                </div>
              ) : (
                labels.map((label) => (
                  <LabelRow
                    key={label.id}
                    label={label}
                    editing={labelEditingId === label.id}
                    canManage={canManageLabels}
                    draftName={labelDraftName}
                    draftColor={labelDraftColor}
                    nameError={labelEditingId === label.id ? labelEditNameError : null}
                    colorError={labelEditingId === label.id ? labelEditColorError : null}
                    onStartEdit={() => {
                      setLabelEditingId(label.id);
                      setLabelDraftName(label.name);
                      setLabelDraftColor(label.color);
                      setLabelEditNameError(null);
                      setLabelEditColorError(null);
                    }}
                    onNameChange={(v) => {
                      setLabelDraftName(v);
                      if (labelEditNameError) setLabelEditNameError(null);
                    }}
                    onColorChange={(v) => {
                      setLabelDraftColor(v);
                      if (labelEditColorError) setLabelEditColorError(null);
                    }}
                    onSave={() => void saveEditLabel(label)}
                    onCancel={() => {
                      setLabelEditingId(null);
                      setLabelEditNameError(null);
                      setLabelEditColorError(null);
                    }}
                    onDelete={() => setLabelDeleteTarget(label)}
                  />
                ))
              )}
            </div>
            {canManageLabels && (
              labelAdding ? (
                <div
                  style={{
                    marginTop: 'var(--sp-3)',
                    padding: 'var(--sp-3)',
                    border: '1px solid var(--divider)',
                    borderRadius: 'var(--radius-lg)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--sp-3)',
                  }}
                >
                  <Input
                    autoFocus
                    value={labelAddName}
                    onChange={(event: { target: { value: string } }) => {
                      setLabelAddName(event.target.value);
                      if (labelAddNameError) setLabelAddNameError(null);
                    }}
                    placeholder="Label name"
                    data-testid="board-settings-label-name-input"
                    aria-invalid={labelAddNameError ? true : undefined}
                    error={labelAddNameError ?? undefined}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void saveAddLabel();
                      } else if (e.key === 'Escape') {
                        setLabelAdding(false);
                        setLabelAddName('');
                        setLabelAddNameError(null);
                        setLabelAddColorError(null);
                      }
                    }}
                    wrapperStyle={{ gap: 0 }}
                  />
                  <ColorPicker
                    value={labelAddColor}
                    onChange={(v) => {
                      setLabelAddColor(v);
                      if (labelAddColorError) setLabelAddColorError(null);
                    }}
                    hexError={labelAddColorError}
                    hexInputTestId="board-settings-label-color-input"
                  />
                  <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => void saveAddLabel()}
                    >
                      Save
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setLabelAdding(false);
                        setLabelAddName('');
                        setLabelAddColor(LABEL_SWATCHES[0]);
                        setLabelAddNameError(null);
                        setLabelAddColorError(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 'var(--sp-3)' }}>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setLabelAdding(true)}
                    data-testid="board-settings-label-add"
                  >
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <PlusIcon />
                      Add Label
                    </span>
                  </Button>
                </div>
              )
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={deleteTarget !== null}
        onClose={() => (!deleting ? setDeleteTarget(null) : undefined)}
        title="Delete column"
        data-testid="board-settings-column-delete-confirm"
        actions={
          <>
            <Button
              type="button"
              variant="secondary"
              size="lg"
              disabled={deleting}
              onClick={() => setDeleteTarget(null)}
              style={{ flex: 1 }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="lg"
              loading={deleting}
              onClick={() => deleteTarget && void confirmDelete(deleteTarget)}
              style={{ flex: 1 }}
            >
              Delete column
            </Button>
          </>
        }
      >
        <p
          style={{
            fontFamily: 'var(--font-text)',
            fontSize: 'var(--fs-15)',
            color: 'var(--text-sub)',
          }}
        >
          Delete column "{deleteTarget?.name}"?
        </p>
      </Modal>

      <Modal
        open={labelDeleteTarget !== null}
        onClose={() => (!labelDeleting ? setLabelDeleteTarget(null) : undefined)}
        title="Delete label"
        data-testid="board-settings-label-delete-confirm"
        actions={
          <>
            <Button
              type="button"
              variant="secondary"
              size="lg"
              disabled={labelDeleting}
              onClick={() => setLabelDeleteTarget(null)}
              data-testid="board-settings-label-delete-cancel"
              style={{ flex: 1 }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="lg"
              loading={labelDeleting}
              onClick={() =>
                labelDeleteTarget && void confirmLabelDelete(labelDeleteTarget)
              }
              data-testid="board-settings-label-delete-confirm-btn"
              style={{ flex: 1 }}
            >
              Delete label
            </Button>
          </>
        }
      >
        <p
          style={{
            fontFamily: 'var(--font-text)',
            fontSize: 'var(--fs-15)',
            color: 'var(--text-sub)',
          }}
        >
          {labelDeleteTarget
            ? labelDeleteConfirmMessage(
                labelDeleteTarget.name,
                labelDeleteTarget.assignmentCount ?? 0,
              )
            : ''}
        </p>
      </Modal>
    </>
  );
}

/** Spec 14 §UI Description — the fixed swatch palette shown in the color picker. */
const LABEL_SWATCHES = [
  '#E11D48',
  '#F97316',
  '#F59E0B',
  '#10B981',
  '#3B82F6',
  '#8B5CF6',
  '#EC4899',
  '#6B7280',
] as const;

function MicroLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-display)',
        fontSize: 'var(--fs-11)',
        letterSpacing: 1,
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
      }}
    >
      {children}
    </span>
  );
}

function SortableColumnRow({
  column,
  editing,
  editDraft,
  editError,
  onStartEdit,
  onEditChange,
  onEditSave,
  onEditCancel,
  onDelete,
}: {
  column: KanbanColumn;
  editing: boolean;
  editDraft: string;
  editError: string | null;
  onStartEdit: () => void;
  onEditChange: (v: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: column.id });
  const isEmpty = column.taskCount === 0;
  return (
    <div
      ref={setNodeRef}
      data-testid={`board-settings-column-${column.id}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--sp-3)',
        padding: '8px 10px',
        borderTop: '1px solid var(--divider)',
        background: isDragging ? 'var(--hover-bg-tint)' : 'transparent',
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Drag column"
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--text-faint)',
          cursor: 'grab',
          display: 'inline-flex',
          padding: 4,
        }}
      >
        <DragHandleIcon />
      </button>
      {editing ? (
        <div style={{ flex: 1, display: 'flex', gap: 'var(--sp-2)' }}>
          <Input
            autoFocus
            value={editDraft}
            onChange={(event: { target: { value: string } }) => onEditChange(event.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onEditSave();
              } else if (e.key === 'Escape') {
                onEditCancel();
              }
            }}
            aria-invalid={editError ? true : undefined}
            error={editError ?? undefined}
            style={{ flex: 1 }}
            wrapperStyle={{ gap: 0, flex: 1 }}
          />
          <Button type="button" variant="primary" size="sm" onClick={onEditSave}>
            Save
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onEditCancel}>
            Cancel
          </Button>
        </div>
      ) : (
        <span
          data-testid={`board-settings-column-name-${column.id}`}
          onClick={onStartEdit}
          style={{
            flex: 1,
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--fs-14)',
            fontWeight: 500,
            color: 'var(--text)',
            cursor: 'pointer',
          }}
        >
          {column.name}
        </span>
      )}
      <span
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: 'var(--fs-11)',
          color: 'var(--text-muted)',
          background: 'var(--bg-sunken)',
          borderRadius: 999,
          padding: '1px 8px',
        }}
      >
        {column.taskCount}
      </span>
      {!editing && (
        <IconButton
          label="Edit column"
          onClick={onStartEdit}
          data-testid={`board-settings-column-edit-${column.id}`}
        >
          <PencilIcon />
        </IconButton>
      )}
      <IconButton
        label={isEmpty ? 'Delete column' : 'Column has tasks'}
        onClick={onDelete}
        disabled={!isEmpty}
        title={!isEmpty ? 'Column has tasks' : undefined}
        data-testid={`board-settings-column-delete-${column.id}`}
      >
        <TrashIcon />
      </IconButton>
    </div>
  );
}

function LabelRow({
  label,
  editing,
  canManage,
  draftName,
  draftColor,
  nameError,
  colorError,
  onStartEdit,
  onNameChange,
  onColorChange,
  onSave,
  onCancel,
  onDelete,
}: {
  label: KanbanLabel;
  editing: boolean;
  canManage: boolean;
  draftName: string;
  draftColor: string;
  nameError: string | null;
  colorError: string | null;
  onStartEdit: () => void;
  onNameChange: (v: string) => void;
  onColorChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      data-testid={`board-settings-label-${label.id}`}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--sp-3)',
        padding: '8px 10px',
        borderTop: '1px solid var(--divider)',
        flexWrap: 'wrap',
      }}
    >
      {editing ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
          <Input
            autoFocus
            value={draftName}
            onChange={(event: { target: { value: string } }) => onNameChange(event.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onSave();
              } else if (e.key === 'Escape') {
                onCancel();
              }
            }}
            aria-invalid={nameError ? true : undefined}
            error={nameError ?? undefined}
            wrapperStyle={{ gap: 0 }}
          />
          <ColorPicker
            value={draftColor}
            onChange={onColorChange}
            hexError={colorError}
            hexInputTestId={`board-settings-label-color-edit-input-${label.id}`}
          />
          <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
            <Button type="button" variant="primary" size="sm" onClick={onSave}>
              Save
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <span
            aria-hidden
            style={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: label.color,
              flexShrink: 0,
              marginTop: 4,
            }}
          />
          <span
            data-testid={`board-settings-label-name-${label.id}`}
            style={{
              flex: 1,
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--fs-14)',
              fontWeight: 500,
              color: 'var(--text)',
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {label.name}
          </span>
          <span
            data-testid={`board-settings-label-color-${label.id}`}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--fs-12)',
              color: 'var(--text-muted)',
              marginTop: 2,
            }}
          >
            {label.color.toUpperCase()}
          </span>
          {canManage && (
            <>
              <IconButton
                label="Edit label"
                onClick={onStartEdit}
                data-testid={`board-settings-label-edit-${label.id}`}
              >
                <PencilIcon />
              </IconButton>
              <IconButton
                label="Delete label"
                onClick={onDelete}
                data-testid={`board-settings-label-delete-${label.id}`}
              >
                <TrashIcon />
              </IconButton>
            </>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Spec 14 §UI Description — 8 swatches plus a free-form hex input. Emits every
 * change through `onChange`; validation is left to the caller so add and edit
 * flows can surface their own error slots.
 */
function ColorPicker({
  value,
  onChange,
  hexError,
  hexInputTestId,
}: {
  value: string;
  onChange: (v: string) => void;
  hexError: string | null;
  hexInputTestId: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {LABEL_SWATCHES.map((swatch) => {
          const selected = value.toUpperCase() === swatch.toUpperCase();
          const style: CSSProperties = {
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: swatch,
            border: selected
              ? '2px solid var(--text)'
              : '2px solid var(--divider)',
            cursor: 'pointer',
            padding: 0,
          };
          return (
            <button
              key={swatch}
              type="button"
              onClick={() => onChange(swatch)}
              aria-label={`Color ${swatch}`}
              aria-pressed={selected}
              style={style}
            />
          );
        })}
      </div>
      <Input
        value={value}
        onChange={(event: { target: { value: string } }) => onChange(event.target.value)}
        placeholder="#RRGGBB"
        data-testid={hexInputTestId}
        aria-invalid={hexError ? true : undefined}
        error={hexError ?? undefined}
        wrapperStyle={{ gap: 0 }}
        style={{ fontFamily: 'var(--font-mono)' }}
      />
    </div>
  );
}
