'use client';

import { notFound, useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useState } from 'react';
import { HIRING_MESSAGES } from '@devscribed/validation';
import { Badge, Button, Card, Skeleton, Table } from '@/ds';
import { PageHeader } from '@/layout/PageHeader';
import type { Vacancy } from '@/hiring/types';
import { VacancyDialog } from './VacancyDialog';

type State = { status: 'loading' } | { status: 'ready'; vacancies: Vacancy[] } | { status: 'gone' };

/**
 * The vacancies list. Search, the status filter, and the row actions menu belong to
 * the lifecycle spec and arrive with it; this is the list, the create dialog, and the
 * route into a vacancy.
 *
 * `user` and `viewer` are refused by the API, and the screen renders the not-found
 * state rather than a permission error — the sidebar never offered them the row, so a
 * direct navigation is the only way to arrive here.
 */
export default function VacanciesPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  const router = useRouter();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const response = await fetch(`/api/organizations/${orgId}/hiring/vacancies`, {
      credentials: 'same-origin',
    });
    if (response.status === 403 || response.status === 404) {
      setState({ status: 'gone' });
      return;
    }
    if (!response.ok) return;
    const body = await response.json();
    setState({ status: 'ready', vacancies: body.vacancies });
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === 'gone') notFound();

  return (
    <>
      <PageHeader
        title="Vacancies"
        action={
          <Button variant="primary" onClick={() => setDialogOpen(true)} data-testid="vacancy-new-button">
            New vacancy
          </Button>
        }
      />

      {state.status === 'loading' ? (
        <Card>
          <span
            aria-live="polite"
            style={{
              position: 'absolute',
              width: 1,
              height: 1,
              overflow: 'hidden',
              clip: 'rect(0 0 0 0)',
            }}
          >
            Loading vacancies
          </span>
          <Skeleton rows={4} height={22} data-testid="vacancies-loading-skeleton" />
        </Card>
      ) : state.vacancies.length === 0 ? (
        <Card>
          <p
            data-testid="vacancies-empty-state"
            style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-14)' }}
          >
            {HIRING_MESSAGES.vacancy.empty}
          </p>
        </Card>
      ) : (
        <div data-testid="vacancies-list">
          <Table<Vacancy>
            rows={state.vacancies}
            rowHref={(row) => `/org/${orgId}/hiring/vacancies/${row.id}`}
            rowTestId={(row) => `vacancy-row-${row.id}`}
            onRowClick={(row, event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey) return;
              event.preventDefault();
              router.push(`/org/${orgId}/hiring/vacancies/${row.id}`);
            }}
            columns={[
              {
                label: 'Title',
                flex: 3,
                render: (row) => (
                  <span data-testid={`vacancy-title-${row.id}`} style={{ minWidth: 0 }}>
                    {row.title}
                  </span>
                ),
              },
              {
                label: 'Interviewer',
                flex: 2,
                render: (row) => (
                  <span data-testid={`vacancy-interviewer-${row.id}`}>{row.interviewer.fullName}</span>
                ),
              },
              {
                label: 'Length',
                flex: 1,
                mono: true,
                render: (row) => (
                  <span data-testid={`vacancy-duration-${row.id}`}>{row.durationMinutes} min</span>
                ),
              },
              {
                label: 'Candidates',
                flex: 1,
                align: 'flex-end',
                mono: true,
                render: (row) => (
                  <span data-testid={`vacancy-count-${row.id}`}>{row.applicationCount}</span>
                ),
              },
              {
                label: 'Status',
                flex: 1,
                align: 'flex-end',
                render: (row) => (
                  <Badge
                    tone={row.status === 'open' ? 'active' : 'inactive'}
                    data-testid={`vacancy-status-${row.id}`}
                  >
                    {row.status === 'open' ? 'Open' : 'Closed'}
                  </Badge>
                ),
              },
            ]}
          />
        </div>
      )}

      <VacancyDialog
        orgId={orgId}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={(vacancy) => {
          setDialogOpen(false);
          // The toast belongs to the destination, so it survives the navigation the
          // spec asks for rather than being raised on a screen about to be replaced.
          router.push(`/org/${orgId}/hiring/vacancies/${vacancy.id}?created=1`);
        }}
      />
    </>
  );
}
