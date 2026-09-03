'use client';

import { useRouter } from 'next/navigation';
import { BackTo, IconButton, PageTitle, ToggleButton } from '@devscribed/ds';
import { GearIcon } from '@/layout/icons';
import type { KanbanProject } from './types';

/**
 * Shared header row for Board / List views. Back-link → project detail, project
 * name + key badge, view toggle (Board / List), and — admin/manager only — the
 * Board Settings gear (Board view only).
 *
 * The view switch is `ToggleButton` (§31), which is the collapse Phase 3 began and Phase 4
 * widened past two segments. This one has exactly two, so it takes the pair form; what
 * changes for a test is the role — §31 is a `radiogroup` of radios, so the switch is reached
 * by name rather than as a button.
 *
 * The key keeps a monospace face and this is the half of §77 that wanted one: `MOB-14` is a
 * literal identifier a reader copies, not a number to be compared down a column. The tabular
 * figures §77 gave the reports are the other half, and they are not this.
 */
export function KanbanHeader({
  project,
  orgId,
  projectId,
  view,
  canManageColumns,
  onOpenSettings,
}: {
  project: KanbanProject;
  orgId: string;
  projectId: string;
  view: 'board' | 'list';
  canManageColumns: boolean;
  onOpenSettings?: () => void;
}) {
  const router = useRouter();
  const detail = `/org/${orgId}/projects/${projectId}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <BackTo
        label="Back"
        href={detail}
        data-testid="kanban-back-link"
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey) return;
          event.preventDefault();
          router.push(detail);
        }}
        style={{ marginBottom: 0 }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-5)', flexWrap: 'wrap' }}>
        <PageTitle style={{ margin: 0 }}>{project.name}</PageTitle>
        <span
          style={{
            fontFamily: 'var(--font-family-mono)',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--text-secondary)',
            background: 'var(--surface-sunken)',
            borderRadius: 'var(--radius-s)',
            padding: 'var(--space-1) var(--space-4)',
          }}
        >
          {project.key}
        </span>
        <ToggleButton
          data-testid="board-view-toggle"
          label="View"
          value1="Board"
          value2="List"
          selectedValue={view === 'board' ? 'Board' : 'List'}
          onValue1Click={() => {
            if (view === 'board') return;
            router.push(`${detail}/board`);
          }}
          onValue2Click={() => {
            if (view === 'list') return;
            router.push(`${detail}/list`);
          }}
          value1TestId="board-view-toggle-board"
          value2TestId="board-view-toggle-list"
          style={{ marginBottom: 0 }}
        />
        {view === 'board' && canManageColumns && onOpenSettings && (
          <IconButton
            label="Board settings"
            onClick={onOpenSettings}
            data-testid="board-settings-btn"
          >
            <GearIcon />
          </IconButton>
        )}
      </div>
    </div>
  );
}
