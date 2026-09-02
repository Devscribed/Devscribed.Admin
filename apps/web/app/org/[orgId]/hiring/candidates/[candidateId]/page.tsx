'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { use, useCallback, useEffect, useRef, useState } from 'react';
import {
  APPLICATION_STATUS_LABELS,
  CANDIDATE_MESSAGES,
  CLIPBOARD_UNAVAILABLE_EMAIL,
  CONCLUSION_PROMPTING_STATUSES,
  HIRING_MESSAGES,
  MESSAGES,
  canManageHiring,
  candidateActionsLabel,
  candidateDeleteConfirmation,
  candidateDeleteTitle,
  formatShortDate,
  interviewMovedToast,
  type ApplicationStatus,
} from '@devscribed/validation';
import {
  BackTo,
  Button,
  Card,
  ConfirmDialog,
  CopyIcon,
  IconButton,
  InfoBanner,
  Popover,
  Preloader,
  ToastHost,
} from '@/ds';
import { focusByTestId } from '@/field-error';
import { PageHeader } from '@/layout/PageHeader';
import { useSession } from '@/layout/session-context';
import { rememberDeletedCandidate } from '@/hiring/candidate-deleted';
import { readCandidateOrigin } from '@/hiring/candidate-origin';
import { useToasts } from '@/hiring/useToasts';
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
  const router = useRouter();
  const search = useSearchParams();
  /**
   * Whether this member may delete the person whose card this is (03 §11.60).
   *
   * The role, not the card's own response: the card is readable by an assigned
   * interviewer and the delete is not, so the one thing on this screen that is gated has
   * to ask a question the card does not answer. It arrives with the shell's `/api/me`,
   * which the whole frame already blocks on, so the menu never appears and withdraws.
   */
  const canManage = canManageHiring(useSession().role);
  const deepLinkedId = search.get('application');
  /**
   * The board's drop into `Didn't pass` or `Offer` arrives here (05 §06.20). It is the
   * same prompt a status change made on this page raises — the member has just recorded
   * an outcome, and the reason for it is the gap.
   */
  const focusConclusion = search.get('focus') === 'conclusion';
  /**
   * The candidate list's `Reschedule interview` arrives here (03 §10.56, 07 §08.40).
   *
   * The team never sends the candidate's own manage link (07 §01.5), so the internal door
   * is this card — and a row action that landed on it and then asked the member to find
   * the same button again would be two presses for one intention. It opens the dialog on
   * the application `?application=` names, which is the row's own.
   */
  const openReschedule = search.get('reschedule') === '1';

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
  const [notice, setNotice] = useState<{
    message: string;
    testId: string;
    /** `success` unless stated. A refusal painted green would be a banner lying. */
    tone?: 'success' | 'error';
  } | null>(null);
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
  /** Whether the delete confirmation is up, and whether its request is in flight. */
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  /**
   * The list this card was opened from, read once (04 §01.8).
   *
   * Once, because the answer must not change under a member who is reading it: the list
   * records itself while it is on screen, and a card that re-read on every render would
   * be re-reading a value nothing here can change anyway.
   *
   * **The database is the fallback, not the board.** A card reached from the calendar
   * invite's deep link has no list behind it at all — it is a fresh tab, often a fresh
   * sign-in — and the candidate database is the one list every caller who can read this
   * card can also read, interviewers included since the scopes were folded together
   * (03 §07.33). A board would have been a guess at which vacancy.
   */
  const [origin] = useState(
    () =>
      readCandidateOrigin(orgId) ?? {
        label: HIRING_MESSAGES.card.backToCandidates,
        href: `/org/${orgId}/hiring/candidates`,
      },
  );
  /**
   * The page's other announcement surface, and the split between the two is by **grain**.
   *
   * The `InfoBanner` below reports what happened to an *application*: a status moved, an
   * interview was rescheduled or called off. It sits in flow, under the header and above
   * the sections it is about, which is where reversal 4 put it and where it stays.
   *
   * A toast reports what happened to the *page's own* controls — the header's copy button
   * and its menu — and those change nothing in the body. Pushing every section down by a
   * banner's height to say "Email copied" would move the interview notes under a hand
   * that is typing into them, which is the one thing this screen exists not to do.
   */
  const { toasts, push, dismiss } = useToasts();

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
        setNotice({ message: MESSAGES.generic, testId: 'card-status-toast', tone: 'error' });
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

  /**
   * Drawn on **every** state, not only on a loaded card (04 §01.8).
   *
   * Two reasons, and the second is this screen's own rule. A card that 404s is where a
   * member lands when a colleague deleted the person while they were reading about them —
   * without this, the only way out of that is the browser's own Back. And a link that
   * appeared once the record arrived would push the whole page down by its own height as
   * it did, which is a layout shift on the one screen that must not have any.
   */
  const back = (
    <BackTo
      label={origin.label}
      href={origin.href}
      data-testid="candidate-back-link"
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey) return;
        event.preventDefault();
        router.push(origin.href);
      }}
    />
  );

  if (state.status === 'gone') {
    // Rendered here rather than through Next's `notFound()`: this state has its own
    // sentence, and it is the same one for a candidate that does not exist and for one
    // this caller may not see. Which of those it is, is exactly what it must not say.
    return (
      <>
        {back}
        <Card data-testid="candidate-not-found">
          <p
            style={{ margin: 0, fontSize: 'var(--font-size-base)', color: 'var(--text-tertiary)' }}
          >
            {HIRING_MESSAGES.card.notFound}
          </p>
        </Card>
      </>
    );
  }

  if (state.status === 'loading') {
    return (
      <>
        {back}
        <Card>
          <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-7)' }}>
            {/* The dots carry no text, so the announcement is made beside them. */}
            <Preloader data-testid="card-loading" aria-hidden />
            <span aria-live="polite" style={VISUALLY_HIDDEN}>
              Loading candidate
            </span>
          </div>
        </Card>
      </>
    );
  }

  if (state.status === 'error') {
    return (
      <>
        {back}
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
      </>
    );
  }

  const { candidate, applications, viewerTimeZone } = state.card;
  // Read-only, always: the internal screens never edit what a candidate told us about
  // themselves (04 §02.9).
  const candidateName = `${candidate.firstName} ${candidate.lastName}`;
  // What the confirmation states goes with them. Both numbers are already on this page:
  // the menu is drawn only for a caller whose card is unscoped, so what is on screen is
  // the whole record and neither number has to be fetched (03 §11.62).
  const assessmentCount = applications.reduce(
    (total, application) => total + application.criteria.length,
    0,
  );

  /**
   * Deleting the person this card is about (04 §02.10, 03 §11).
   *
   * The card 404s the moment the flag is set, so this screen cannot report its own
   * outcome: it leaves the name for the candidate database and goes there, and the list
   * raises the confirmation on arrival (03 §11.65). `push` rather than `back`, because a
   * card is also reachable from a board and from a calendar invite in a fresh tab, and
   * only one of the three destinations still has a place for what just happened.
   */
  async function remove(): Promise<void> {
    setDeleting(true);
    try {
      const response = await fetch(`/api/organizations/${orgId}/hiring/candidates/${candidateId}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (!response.ok) {
        setDeleting(false);
        setConfirmingDelete(false);
        push({ message: MESSAGES.generic, tone: 'error', testId: 'card-delete-failed' });
        return;
      }
      rememberDeletedCandidate(candidateName);
      router.push(`/org/${orgId}/hiring/candidates`);
    } catch {
      setDeleting(false);
      setConfirmingDelete(false);
      push({ message: MESSAGES.generic, tone: 'error', testId: 'card-delete-failed' });
    }
  }

  /**
   * Copying the address (04 §02.12).
   *
   * The email is the one field on this page anybody re-types — into a mail client, into a
   * calendar invite, into a spreadsheet — and re-typing an address is how a letter goes to
   * the wrong person. A refusal is said out loud rather than swallowed: the clipboard can
   * be denied by permission or by an insecure origin, and a button that appeared to work
   * and did not is worse than one that says so, because the member finds out at the point
   * of pasting nothing.
   */
  async function copyEmail(): Promise<void> {
    try {
      await navigator.clipboard.writeText(candidate.email);
      push({
        message: HIRING_MESSAGES.toast.emailCopied,
        testId: 'toast-email-copied',
      });
    } catch {
      // The address is drawn in full right beside the control, so the instruction is to
      // select it — there is nothing this has to recite.
      push({
        message: CLIPBOARD_UNAVAILABLE_EMAIL,
        tone: 'error',
        testId: 'toast-email-copy-failed',
      });
    }
  }

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
      {back}

      <PageHeader
        title={<span data-testid="candidate-name">{candidateName}</span>}
        subtitle={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}>
            <span data-testid="candidate-email">{candidate.email}</span>
            {/*
              The copy affordance the design puts against the address. `IconButton` rather
              than a bare glyph, because a glyph-only control still needs a name, a hit
              area and a focus treatment, and blue already specifies all three (ledger §10).
            */}
            <IconButton
              label={HIRING_MESSAGES.card.copyEmail}
              size={28}
              data-testid="candidate-email-copy"
              onClick={() => void copyEmail()}
            >
              <CopyIcon width={16} height={16} aria-hidden />
            </IconButton>
            <span>
              · first seen {formatShortDate(new Date(candidate.createdAt), viewerTimeZone)}
            </span>
          </span>
        }
        /*
          A person-grain action, so it belongs to the page rather than to any one
          application section (04 §02.10). One item today, and still in the ⋮ the rest of
          hiring uses: a destructive action never sits in a header as a bare button.
        */
        action={
          canManage ? (
            <Popover
              label={candidateActionsLabel(candidateName)}
              data-testid="candidate-actions"
              items={[
                {
                  key: 'delete',
                  label: CANDIDATE_MESSAGES.actions.delete,
                  testId: 'candidate-action-delete',
                  danger: true,
                  onSelect: () => setConfirmingDelete(true),
                },
              ]}
            />
          ) : undefined
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
          variant={notice.tone ?? 'success'}
          // A failure interrupts; an outcome reports. The same slot, two urgencies.
          role={notice.tone === 'error' ? 'alert' : 'status'}
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
              openReschedule={openReschedule && application.id === deepLinkedId}
              onToggle={() =>
                setExpandedId((current) => (current === application.id ? null : application.id))
              }
              onStatusChange={(status) => void changeStatus(application.id, status)}
              onScheduleChange={applyScheduleChange}
              onOpenCalendar={() =>
                push({
                  message: CANDIDATE_MESSAGES.toast.viewInCalendar,
                  testId: `toast-calendar-${application.id}`,
                })
              }
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

      {/*
        The same confirmation the list mounts, over the same endpoint — one wording, two
        doors. It stays up while the request is in flight, because the next thing that
        happens is a navigation and a dialog that dismissed first would leave the screen
        blank and unexplained for as long as the request takes.
      */}
      {confirmingDelete && (
        <ConfirmDialog
          open
          title={candidateDeleteTitle(candidateName)}
          description={candidateDeleteConfirmation(applications.length, assessmentCount)}
          acceptBtnText={CANDIDATE_MESSAGES.deleteDialog.accept}
          declineBtnText={CANDIDATE_MESSAGES.deleteDialog.decline}
          busy={deleting}
          closeOnAccept={false}
          onAccept={() => void remove()}
          onClose={() => setConfirmingDelete(false)}
          acceptTestId="candidate-delete-confirm"
          data-testid="candidate-delete-dialog"
        />
      )}

      {/*
        The header's own outcomes, which change nothing in the body — see the queue's own
        note above. They float rather than push, because the body is being typed into.
      */}
      <ToastHost toasts={toasts} onDismiss={dismiss} />
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
