'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { IconButton, Toggle } from '@/ds';
import { BackArrowIcon, GearIcon } from '@/layout/icons';
import type { KanbanProject } from './types';

/**
 * Shared header row for Board / List views. Back-link → project detail, project
 * name + key badge, view toggle (Board / List), and — admin/manager only — the
 * Board Settings gear (Board view only).
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
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
      <Link
        href={`/org/${orgId}/projects/${projectId}`}
        data-testid="kanban-back-link"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          fontFamily: 'var(--font-display)',
          fontWeight: 500,
          fontSize: 'var(--fs-14)',
          color: 'var(--accent)',
          textDecoration: 'none',
        }}
      >
        <BackArrowIcon />
        Back
      </Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: 'var(--fs-22)',
            letterSpacing: '-.4px',
            color: 'var(--text)',
            margin: 0,
          }}
        >
          {project.name}
        </h1>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--fs-12)',
            color: 'var(--text-muted)',
            background: 'var(--bg-sunken)',
            borderRadius: 'var(--radius-sm)',
            padding: '2px 8px',
          }}
        >
          {project.key}
        </span>
        <div data-testid="board-view-toggle">
          <Toggle
            value={view}
            options={[
              { value: 'board', label: 'Board' },
              { value: 'list', label: 'List' },
            ]}
            onChange={(v: string) => {
              if (v === view) return;
              const next =
                v === 'board'
                  ? `/org/${orgId}/projects/${projectId}/board`
                  : `/org/${orgId}/projects/${projectId}/list`;
              router.push(next);
            }}
          />
        </div>
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
