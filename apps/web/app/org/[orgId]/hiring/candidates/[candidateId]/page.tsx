'use client';

import { useSearchParams } from 'next/navigation';
import { use, useCallback, useEffect, useRef, useState } from 'react';
import {
  APPLICATION_STATUS_LABELS,
  CONCLUSION_PROMPTING_STATUSES,
  HIRING_MESSAGES,
  MESSAGES,
  formatShortDate,
  type ApplicationStatus,
} from '@devscribed/validation';
import { Button, Card, InfoBanner, Skeleton, Toast } from '@/ds';
import { focusByTestId } from '@/field-error';
import { PageHeader } from '@/layout/PageHeader';
import type { CandidateCard, CardCriterion, Criterion } from '@/hiring/types';
import { ApplicationSection } from './ApplicationSection';
import { AutosavingField } from './AutosavingField';
import { CriteriaSection } from './CriteriaSection';

type State =
  | { status: 'loading' }
  | { status: 'ready'; card: CandidateCard }
  | { status: 'error' }
  | { status: 'gone' };

/** Interview notes are the tallest thing on the page, because it is what it is for. */
const NOTES_ROWS = 12;
const CONCLUSION_ROWS = 5;

/**
 * The candidate card — the page the team works on **during** an interview, and what the
 * calendar invite's deep link opens.
 *
 * One constraint governs the whole screen: someone is on a live call while using it.
 * Nothing steals focus, nothing moves under the cursor, and no save is silent. Which is
 * why the record is fetched once and never refetched in the background — a poll arriving
 * mid-sentence would replace text somebody was still writing — and why a status change
 * is patched in place rather than reloaded.
 */
export default function CandidateCardPage({
  params,
}: {
  params: Promise<{ orgId: string; candidateId: string }>;
}) {
  const { orgId, candidateId } = use(params);
  const search = useSearchParams();
  const deepLinkedId = search.get('application');
  /**
   * The board's drop into `Didn't pass` or `Offer` arrives here (05 §06.20). It is the
   * same prompt a status change made on this page raises — the member has just recorded
   * an outcome, and the reason for it is the gap.
   */
  const focusConclusion = search.get('focus') === 'conclusion';

  const [state, setState] = useState<State>({ status: 'loading' });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  /**
   * The org-wide criteria library, fetched once for the whole page rather than per
   * application: it is the same list on every section, and a second copy would be a
   * second thing to keep in step after an inline creation.
   *
   * Archived entries included — one already assessed still has to render its chip and
   * its scale, even though it has left the add-autocomplete (06 §03.18).
   */
  const [library, setLibrary] = useState<Criterion[]>([]);
  /**
   * Whether the caller may read the org-wide library at all.
   *
   * Both libraries are `admin`/`manager` only, `GET` included (06 §Actors), and an
   * assigned `user` interviewer reaches this card without reaching them. So the criteria
   * section renders read-only for them: a page cannot offer an autocomplete over a list
   * it may not fetch, and opening the whole library to make one control work is the
   * trade the permission matrix already refused. The answer to that request is the
   * predicate — no second endpoint, and nothing on screen that guesses at a role.
   */
  const [libraryReadable, setLibraryReadable] = useState(true);

  const loadLibrary = useCallback(async (): Promise<void> => {
    const response = await fetch(
      `/api/organizations/${orgId}/hiring/criteria?includeArchived=true`,
      { credentials: 'same-origin' },
    );
    if (response.ok) {
      setLibrary((await response.json()).criteria);
      setLibraryReadable(true);
      return;
    }
    // A refusal, not a failure: the page still renders everything the card carried.
    if (response.status === 403 || response.status === 404) setLibraryReadable(false);
  }, [orgId]);

  const load = useCallback(async (): Promise<void> => {
    setState({ status: 'loading' });
    try {
      const response = await fetch(`/api/organizations/${orgId}/hiring/candidates/${candidateId}`, {
        credentials: 'same-origin',
      });
      // 404 for a candidate this caller may not see, whatever the reason — a role with
      // no hiring access, an interviewer reaching for somebody else's vacancy, or an id
      // that names nothing. Which of those it is, is exactly what it must not say.
      if (response.status === 403 || response.status === 404) {
        setState({ status: 'gone' });
        return;
      }
      if (!response.ok) {
        setState({ status: 'error' });
        return;
      }
      const card: CandidateCard = await response.json();
      setState({ status: 'ready', card });
      // After the section has rendered, and only on arrival. Nothing else on this page
      // moves focus without the member having just asked for it.
      if (focusConclusion) requestAnimationFrame(() => focusByTestId('card-conclusion-input'));
      // The section the deep link names, or the most recent — which is the first, since
      // the API orders them (04 §03.13).
      setExpandedId(
        card.applications.find((application) => application.id === deepLinkedId)?.id ??
          card.applications[0]?.id ??
          null,
      );
    } catch {
      setState({ status: 'error' });
    }
  }, [orgId, candidateId, deepLinkedId, focusConclusion]);

  useEffect(() => {
    void load();
    void loadLibrary();
  }, [load, loadLibrary]);

  const registerDirty = useUnsavedGuard();

  /**
   * One application's assessments, replaced in place.
   *
   * Patched rather than refetched for the same reason a status change is: a refetch would
   * replace the text in every open editor on the page, and the server has just told us
   * the only thing that changed.
   */
  const setCriteria = useCallback((applicationId: string, criteria: CardCriterion[]): void => {
    setState((current) =>
      current.status === 'ready'
        ? {
            status: 'ready',
            card: {
              ...current.card,
              applications: current.card.applications.map((application) =>
                application.id === applicationId ? { ...application, criteria } : application,
              ),
            },
          }
        : current,
    );
  }, []);

  const patch = useCallback(
    async (applicationId: string, body: Record<string, unknown>) => {
      const response = await fetch(
        `/api/organizations/${orgId}/hiring/applications/${applicationId}`,
        {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      if (!response.ok) throw new Error(`save failed: ${response.status}`);
      return (await response.json()) as { savedAt: string; status: ApplicationStatus };
    },
    [orgId],
  );

  const changeStatus = useCallback(
    async (applicationId: string, status: ApplicationStatus): Promise<void> => {
      try {
        await patch(applicationId, { status });
      } catch {
        setToast(MESSAGES.generic);
        return;
      }

      // Patched in place rather than refetched: a refetch would replace the text in
      // every open editor, and the server has just told us the only thing that changed.
      setState((current) =>
        current.status === 'ready'
          ? {
              status: 'ready',
              card: {
                ...current.card,
                applications: current.card.applications.map((application) =>
                  application.id === applicationId ? { ...application, status } : application,
                ),
              },
            }
          : current,
      );

      // A member who changes the status here stays on the card — this is the middle of
      // an interview, not the end of one.
      setToast(`Moved to ${APPLICATION_STATUS_LABELS[status]}`);

      // The one focus move on this page, and it is a direct answer to what the member
      // just did: an outcome with no reason recorded is the gap this prompts for
      // (04 §06.31). Prompted, never required — the field is focused, not validated.
      if (CONCLUSION_PROMPTING_STATUSES.includes(status)) {
        focusByTestId('card-conclusion-input');
      }
    },
    [patch],
  );

  if (state.status === 'gone') {
    // Rendered here rather than through Next's `notFound()`: this state has its own
    // sentence, and it is the same one for a candidate that does not exist and for one
    // this caller may not see. Which of those it is, is exactly what it must not say.
    return (
      <Card data-testid="candidate-not-found">
        <p style={{ margin: 0, fontSize: 'var(--fs-15)', color: 'var(--text-sub)' }}>
          {HIRING_MESSAGES.card.notFound}
        </p>
      </Card>
    );
  }

  if (state.status === 'loading') {
    return (
      <Card>
        <span aria-live="polite" style={VISUALLY_HIDDEN}>
          Loading candidate
        </span>
        <Skeleton rows={5} height={22} data-testid="card-loading-skeleton" />
      </Card>
    );
  }

  if (state.status === 'error') {
    return (
      <Card data-testid="card-load-error">
        <InfoBanner tone="error">
          <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
            {MESSAGES.generic}
            <Button variant="ghost" size="sm" onClick={() => void load()} data-testid="card-load-retry">
              Retry
            </Button>
          </span>
        </InfoBanner>
      </Card>
    );
  }

  const { candidate, applications, viewerTimeZone } = state.card;
  // Read-only, always: the internal screens never edit what a candidate told us about
  // themselves (04 §02.9).
  const candidateName = `${candidate.firstName} ${candidate.lastName}`;

  return (
    <div data-testid="candidate-card">
      <PageHeader
        title={<span data-testid="candidate-name">{candidateName}</span>}
        subtitle={
          <>
            <span data-testid="candidate-email">{candidate.email}</span> · first seen{' '}
            {formatShortDate(new Date(candidate.createdAt), viewerTimeZone)}
          </>
        }
      />

      {applications.length === 0 ? (
        <Card>
          <p
            data-testid="candidate-no-applications"
            style={{ margin: 0, fontSize: 'var(--fs-14)', color: 'var(--text-muted)' }}
          >
            No applications yet.
          </p>
        </Card>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--sp-8)' }}>
          {applications.map((application) => (
            <ApplicationSection
              key={application.id}
              orgId={orgId}
              application={application}
              candidateName={candidateName}
              viewerTimeZone={viewerTimeZone}
              expanded={expandedId === application.id}
              collapsible={applications.length > 1}
              deepLinked={application.id === deepLinkedId}
              onToggle={() =>
                setExpandedId((current) => (current === application.id ? null : application.id))
              }
              onStatusChange={(status) => void changeStatus(application.id, status)}
              criteria={
                <CriteriaSection
                  orgId={orgId}
                  applicationId={application.id}
                  criteria={application.criteria}
                  library={library}
                  readOnly={!libraryReadable}
                  onChange={(criteria) => setCriteria(application.id, criteria)}
                  onLibraryChange={() => void loadLibrary()}
                />
              }
            >
              {/*
                Keyed by application, so expanding a different section builds a fresh
                editor rather than carrying one interview's half-written notes onto
                another's.
              */}
              <AutosavingField
                key={`${application.id}-notes`}
                label="Interview notes"
                testId="card-notes"
                placeholder="Notes from the interview…"
                rows={NOTES_ROWS}
                initial={application.interviewNotes}
                save={(value) => patch(application.id, { interviewNotes: value })}
                registerDirty={registerDirty}
              />
              <AutosavingField
                key={`${application.id}-conclusion`}
                label="Conclusion"
                testId="card-conclusion"
                placeholder="The outcome, and why."
                rows={CONCLUSION_ROWS}
                initial={application.conclusion}
                save={(value) => patch(application.id, { conclusion: value })}
                registerDirty={registerDirty}
              />
            </ApplicationSection>
          ))}
        </div>
      )}

      {toast && (
        <Toast tone="success" onDismiss={() => setToast(null)} data-testid="card-status-toast">
          {toast}
        </Toast>
      )}
    </div>
  );
}

/**
 * The browser's own "leave site?" prompt while any editor still holds text the server
 * has not accepted (04 §Design, Interactions).
 *
 * Each editor registers a way to ask it; the guard asks all of them on the way out. A
 * member closing the tab two seconds after their last sentence would otherwise lose it
 * with no warning at all.
 */
function useUnsavedGuard(): (isDirty: () => boolean) => () => void {
  const editors = useRef(new Set<() => boolean>());

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent): void {
      for (const isDirty of editors.current) {
        if (!isDirty()) continue;
        event.preventDefault();
        return;
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  return useCallback((isDirty: () => boolean) => {
    editors.current.add(isDirty);
    return () => {
      editors.current.delete(isDirty);
    };
  }, []);
}

/** Present to a screen reader, absent to everything else. */
const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
} as const;
