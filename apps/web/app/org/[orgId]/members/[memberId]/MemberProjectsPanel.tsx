'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Card, EmptyState, InfoBanner, Preloader, Table } from '@devscribed/ds';
import type { ProjectListItem, ProjectsResponse } from '../../projects/types';

/**
 * PATCH-019 — the member's Projects tab.
 *
 * The tab existed as a disabled word with nothing behind it. What it shows is the projects
 * this member is on, read from the projects list narrowed by `membershipId` — the same route
 * the Projects screen reads, with the same capability rules, so a caller who may not list
 * projects at all sees the tab refuse in the way that route refuses.
 *
 * Active projects only. Archiving a project does not unassign anybody, so an archived one is
 * still an assignment on paper; what a person opening this tab is asking is what somebody is
 * working on, and that is the live list.
 */
export function MemberProjectsPanel({ orgId, memberId }: { orgId: string; memberId: string }) {
  const [projects, setProjects] = useState<ProjectListItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      setFailed(false);
      try {
        const response = await fetch(
          `/api/organizations/${orgId}/projects?status=active&membershipId=${encodeURIComponent(memberId)}`,
          { credentials: 'same-origin', signal },
        );
        if (signal?.aborted) return;
        if (!response.ok) {
          setFailed(true);
          return;
        }
        const body = (await response.json()) as ProjectsResponse;
        if (signal?.aborted) return;
        setProjects(body.projects);
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        setFailed(true);
      }
    },
    [orgId, memberId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  if (failed) {
    return (
      <div data-testid="member-projects-panel">
        <InfoBanner variant="error" role="alert">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--space-3)',
            }}
          >
            <span>Projects could not be loaded.</span>
            <Button onClick={() => void load()} data-testid="member-projects-retry-btn">
              Retry
            </Button>
          </div>
        </InfoBanner>
      </div>
    );
  }

  // The wait is drawn while there is nothing to draw, and never over rows already read.
  if (projects === null) {
    return (
      <div data-testid="member-projects-panel">
        <Card>
          <div
            role="status"
            aria-label="Loading projects"
            style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-9) 0' }}
          >
            <Preloader />
          </div>
        </Card>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div data-testid="member-projects-panel">
        <Card>
          <EmptyState data-testid="member-projects-empty">
            This member is not on any active project.
          </EmptyState>
        </Card>
      </div>
    );
  }

  return (
    <div data-testid="member-projects-panel">
      <Card padded={false}>
        {/* The row navigates, so it is a real anchor — the system's `Table` makes that swap
            itself given `rowHref`, which keeps middle-click and copy-address working. */}
        <Table<ProjectListItem>
          columns={[
            { label: 'Project', render: (row) => row.name },
            { label: 'Client', render: (row) => row.clientName ?? '—' },
            {
              label: 'People',
              align: 'flex-end',
              maxWidth: 'none',
              render: (row) => row.memberCount,
            },
          ]}
          rows={projects}
          rowKey={(row) => row.id}
          rowTestId={(row) => `member-projects-row-${row.id}`}
          rowHref={(row) => `/org/${orgId}/projects/${row.id}`}
        />
      </Card>
    </div>
  );
}
