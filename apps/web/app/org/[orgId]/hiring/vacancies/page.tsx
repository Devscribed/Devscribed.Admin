'use client';

import { notFound, useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useState } from 'react';
import { HIRING_MESSAGES, type VacancyStatusFilter } from '@devscribed/validation';
import { Badge, Button, Card, SearchField, Select, Skeleton, Table } from '@/ds';
import { PageHeader } from '@/layout/PageHeader';
import type { Vacancy } from '@/hiring/types';
import { VacancyDialog } from './VacancyDialog';

type State = { status: 'loading' } | { status: 'ready'; vacancies: Vacancy[] } | { status: 'gone' };

/** 01 §05.16 — the same 300 ms the member search already uses. */
const SEARCH_DEBOUNCE_MS = 300;

const STATUS_OPTIONS = [
  { value: 'all', label: 'All', testId: 'vacancies-status-option-all' },
  { value: 'open', label: 'Open', testId: 'vacancies-status-option-open' },
  { value: 'closed', label: 'Closed', testId: 'vacancies-status-option-closed' },
];

/**
 * The vacancies list: search, the status filter, and the route into a vacancy.
 *
 * Both filters run server-side. The list has no page size, so narrowing it in the
 * browser would mean fetching every vacancy in the organization to show one.
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

  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<VacancyStatusFilter>('all');

  // Typing debounces; the status filter does not, because a click is already a
  // deliberate act and waiting on it would read as lag.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async (): Promise<void> => {
    const params = new URLSearchParams();
    if (query.trim()) params.set('search', query.trim());
    if (status !== 'all') params.set('status', status);
    const suffix = params.toString() ? `?${params}` : '';

    const response = await fetch(`/api/organizations/${orgId}/hiring/vacancies${suffix}`, {
      credentials: 'same-origin',
    });
    if (response.status === 403 || response.status === 404) {
      setState({ status: 'gone' });
      return;
    }
    if (!response.ok) return;
    const body = await response.json();
    setState({ status: 'ready', vacancies: body.vacancies });
  }, [orgId, query, status]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === 'gone') notFound();

  const filtered = query.trim().length > 0 || status !== 'all';

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

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--sp-6)',
          marginBottom: 'var(--sp-10)',
          flexWrap: 'wrap',
        }}
      >
        <SearchField
          placeholder="Search vacancies…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search vacancies"
          data-testid="vacancies-search-input"
          style={{ flex: 1, minWidth: 220 }}
        />
        <Select
          value={status}
          options={STATUS_OPTIONS}
          onChange={(value) => setStatus(value as VacancyStatusFilter)}
          data-testid="vacancies-status-filter"
          wrapperStyle={{ width: 160 }}
        />
      </div>

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
            {filtered ? HIRING_MESSAGES.vacancy.emptyFiltered : HIRING_MESSAGES.vacancy.empty}
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
                  <div style={{ minWidth: 0 }}>
                    <span data-testid={`vacancy-title-${row.id}`}>{row.title}</span>
                    {/* Chips on a second line inside the title cell — read-only here,
                        editable only in the dialog (01 §UI Notes). */}
                    {row.categories.length > 0 && (
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 'var(--sp-2)',
                          marginTop: 'var(--sp-2)',
                        }}
                      >
                        {row.categories.map((category) => (
                          <Badge
                            key={category.id}
                            tone="neutral"
                            dot={false}
                            data-testid={`vacancy-category-chip-${category.id}`}
                          >
                            {category.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
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
        onSaved={(vacancy) => {
          setDialogOpen(false);
          // The toast belongs to the destination, so it survives the navigation the
          // spec asks for rather than being raised on a screen about to be replaced.
          router.push(`/org/${orgId}/hiring/vacancies/${vacancy.id}?created=1`);
        }}
      />
    </>
  );
}
