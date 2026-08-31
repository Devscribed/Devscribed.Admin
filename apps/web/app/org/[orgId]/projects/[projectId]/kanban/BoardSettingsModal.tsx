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
import { useEffect, useState } from 'react';
import { Button, IconButton, Input, Modal } from '@/ds';
import { DragHandleIcon, PencilIcon, PlusIcon, TrashIcon } from '@/layout/icons';
import { useToast } from '@/toast';
import { KANBAN_MESSAGES, validateColumnName } from '@devscribed/validation';
import type { KanbanColumn } from './types';

/**
 * Board Settings modal (spec 13 §Board Settings modal). Manages columns:
 * inline rename, drag-reorder via @dnd-kit's sortable, delete (disabled if the
 * column has tasks), and an inline "+ Add Column" affordance. Every mutation
 * fires against the API and, on success, calls `onChanged` so the Board reloads.
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

  const [localColumns, setLocalColumns] = useState<KanbanColumn[]>(columns);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [addDraft, setAddDraft] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<KanbanColumn | null>(null);
  const [deleting, setDeleting] = useState(false);

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
    }
  }, [open, columns]);

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

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Board Settings"
        width={480}
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

          <div
            style={{
              padding: 'var(--sp-4)',
              border: '1px dashed var(--border)',
              borderRadius: 'var(--radius-lg)',
              color: 'var(--text-faint)',
              fontSize: 'var(--fs-12)',
            }}
          >
            Labels — spec 14
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
    </>
  );
}

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
