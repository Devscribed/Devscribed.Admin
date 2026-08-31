'use client';

import { useSearchParams } from 'next/navigation';
import { use, useCallback, useEffect, useRef, useState } from 'react';
import {
  APPLICATION_STATUS_LABELS,
  CONCLUSION_PROMPTING_STATUSES,
  HIRING_MESSAGES,
  MESSAGES,
  formatShortDate,
  interviewMovedToast,
  type ApplicationStatus,
} from '@devscribed/validation';
import { Button, Card, InfoBanner, Preloader } from '@/ds';
import { focusByTestId } from '@/field-error';
import { PageHeader } from '@/layout/PageHeader';
import type {
  CandidateCard,
  CardApplication,
  CardCriterion,
  Criterion,
} from '@/hiring/types';
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
  /**
   * What just happened, and which test id reports it. A status change, a move and a
   * cancellation are three different outcomes and 04/07 name a surface for each, so the
   * id travels with the message rather than being fixed to the one component that shows
   * them all.
   *
   * One at a time: a new outcome replaces the last rather than stacking under it
   * (reversal 4), and nothing here times out.
   */
  const [notice, setNotice] = useState<{ message: string; testId: string } | null>(null);
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
        setNotice({ message: MESSAGES.generic, testId: 'card-status-toast' });
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
      setNotice({
        message: `Moved to ${APPLICATION_STATUS_LABELS[status]}`,
        testId: 'card-status-toast',
      });

      // The one focus move on this page, and it is a direct answer to what the member
      // just did: an outcome with no reason recorded is the gap this prompts for
      // (04 §06.31). Prompted, never required — the field is focused, not validated.
      //
      // After the banner above has been laid out, never before it. The announcement is
      // now in flow rather than floating over the page (reversal 4), so focusing first
      // would scroll the field into view and then push it down by the banner's own
      // height — which is the one thing this screen exists not to do.
      if (CONCLUSION_PROMPTING_STATUSES.includes(status)) {
        requestAnimationFrame(() => focusByTestId('card-conclusion-input'));
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
        <p style={{ margin: 0, fontSize: 'var(--font-size-base)', color: 'var(--text-tertiary)' }}>
          {HIRING_MESSAGES.card.notFound}
        </p>
      </Card>
    );
  }

  if (state.status === 'loading') {
    return (
      <Card>
        <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-7)' }}>
          {/* The dots carry no text, so the announcement is made beside them. */}
          <Preloader data-testid="card-loading" aria-hidden />
          <span aria-live="polite" style={VISUALLY_HIDDEN}>
            Loading candidate
          </span>
        </div>
      </Card>
    );
  }

  if (state.status === 'error') {
    return (
      <Card data-testid="card-load-error">
        <InfoBanner variant="error" role="alert">
          <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            {MESSAGES.generic}
            <Button onClick={() => void load()} data-testid="card-load-retry">
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

  /**
   * A move or a cancellation landed. The server answered with the whole application, so
   * the section is replaced from that rather than the page refetched — a refetch would
   * replace the text in every open editor, and somebody is on a live call.
   *
   * The section is marked, never collapsed and never navigated away from: cancelling an
   * interview is not a reason to close the notes taken during it (07 design).
   */
  const applyScheduleChange = (
    updated: CardApplication,
    outcome: 'rescheduled' | 'cancelled',
  ): void => {
    setState((current) =>
      current.status === 'ready'
        ? {
            status: 'ready',
            card: {
              ...current.card,
              applications: current.card.applications.map((application) =>
                application.id === updated.id ? updated : application,
              ),
            },
          }
        : current,
    );

    setNotice(
      outcome === 'cancelled'
        ? {
            message: HIRING_MESSAGES.toast.interviewCancelled,
            testId: 'toast-interview-cancelled',
          }
        : {
            message: interviewMovedToast(new Date(updated.startUtc), viewerTimeZone),
            testId: 'toast-interview-rescheduled',
          },
    );
  };

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

      {/*
        Reversal 4's slot, the one Phase 3 fixed: directly under `PageHeader`, above the
        page body. The announcement is about the page and was raised from the header over
        it, and in flow it pushes the body down rather than covering it — which is why the
        status change below defers its focus move until after this has been laid out.

        It leaves by being dismissed or by being replaced; nothing times out, because a
        banner that removes itself after a few seconds is a toast wearing a different
        component. The test ids are kept: they name the announcement, not the component
        that draws it.
      */}
      {notice && (
        <InfoBanner
          variant="success"
          role="status"
          onDismiss={() => setNotice(null)}
          data-testid={notice.testId}
          style={{ marginBottom: 'var(--space-6)' }}
        >
          {notice.message}
        </InfoBanner>
      )}

      {applications.length === 0 ? (
        <Card>
          <p
            data-testid="candidate-no-applications"
            style={{ margin: 0, fontSize: 'var(--font-size-s)', color: 'var(--text-secondary)' }}
          >
            No applications yet.
          </p>
        </Card>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
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
              onScheduleChange={applyScheduleChange}
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
