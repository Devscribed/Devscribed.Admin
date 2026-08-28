'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  APPLICATION_STATUS_LABELS,
  HIRING_MESSAGES,
  applicationStatusOptions,
  cancelledBadgeLabel,
  cancelledTooltip,
  formatHistoryDate,
  formatShortDate,
  formatShortWhen,
  isLiveBooking,
  mergeTimeline,
  scheduleEntryAriaLabel,
  scheduleEntryLabel,
  scheduleSummary,
  type ApplicationStatus,
  type TimelineEntry,
} from '@devscribed/validation';
import { Badge, Button, Card, SectionLabel, Select, Tooltip } from '@/ds';
import { CancelInterviewDialog } from '@/hiring/CancelInterviewDialog';
import { formatDuration } from '@/hiring/format';
import { RescheduleDialog } from '@/hiring/RescheduleDialog';
import type { CardApplication } from '@/hiring/types';

/**
 * One application: what the candidate and the calendar already settled, read-only, and
 * beneath it everything the team writes.
 *
 * One section is expanded at a time — the most recent, or the one the calendar invite's
 * deep link names. The rest collapse to a summary row, because a candidate with four
 * applications otherwise opens as four full-height note fields with nothing to say which
 * of them this interview is.
 */
export function ApplicationSection({
  orgId,
  application,
  candidateName,
  viewerTimeZone,
  expanded,
  collapsible,
  deepLinked,
  onToggle,
  onStatusChange,
  onScheduleChange,
  criteria,
  children,
}: {
  orgId: string;
  application: CardApplication;
  /** The candidate's current name, which a later booking may have overwritten. */
  candidateName: string;
  viewerTimeZone: string;
  expanded: boolean;
  collapsible: boolean;
  /** True for the one section `?application=` named, which scrolls itself into view. */
  deepLinked: boolean;
  onToggle: () => void;
  onStatusChange: (status: ApplicationStatus) => void;
  /**
   * A move or a cancellation landed: the server answered with the whole application, so
   * the section is replaced in place rather than the page refetched. Nothing on this
   * screen may reload the notes somebody is still typing.
   */
  onScheduleChange: (application: CardApplication, outcome: 'rescheduled' | 'cancelled') => void;
  /** The criteria section, built by the page so it can share the library it fetched. */
  criteria: ReactNode;
  /** The editors, built by the page so the save closures stay in one place. */
  children: ReactNode;
}) {
  const section = useRef<HTMLDivElement>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    // Only the deep-linked section scrolls, and only on arrival: nothing on this page
    // may move under the cursor of someone already typing.
    //
    // `nearest` rather than `start`, so a section already on screen — the common case,
    // where the invite points at the only application — is left where it is instead of
    // being pulled to the top and taking the candidate's name off the page with it.
    if (!deepLinked) return;
    section.current?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }, [deepLinked]);

  const start = new Date(application.startUtc);
  const minutes = Math.round((new Date(application.endUtc).getTime() - start.getTime()) / 60_000);
  const statusLabel = APPLICATION_STATUS_LABELS[application.status];
  const bookedElsewhere = application.bookedTimeZone !== viewerTimeZone;
  /*
   * One rule, both actions, both parties: the interview has not started and has not been
   * called off (07 §14.65). Once `start` has passed the controls are **absent, not
   * disabled** — a disabled control invites a reader to work out why, and the API refuses
   * a past interview anyway, so there is nothing here for a disabled button to protect.
   */
  const actionable = isLiveBooking(
    { start, isCancelled: application.isCancelled },
    new Date(),
  );

  return (
    <div
      ref={section}
      className="card-section"
      data-testid={`application-section-${application.id}`}
    >
      {/*
        `clip={false}` because this card hosts pickers: the status `Select` in its header
        and the criteria value controls further down both drop a list into the card, and
        a clipped one is cut off at its edge.
      */}
      <Card clip={false}>
        <div className="card-section-head">
          <div style={{ minWidth: 0, flex: 1 }}>
            <Heading
              application={application}
              minutes={minutes}
              expanded={expanded}
              collapsible={collapsible}
              onToggle={onToggle}
              summary={
                expanded ? null : `${formatShortDate(start, viewerTimeZone)} · ${statusLabel}`
              }
            />

            {expanded && (
              <>
                <div
                  data-testid={`application-when-${application.id}`}
                  style={{ fontSize: 'var(--fs-14)', color: 'var(--text-sub)' }}
                >
                  {formatShortWhen(start, viewerTimeZone)} {viewerTimeZone} ·{' '}
                  <span data-testid={`application-interviewer-${application.id}`}>
                    {application.interviewer.fullName}
                  </span>
                  {/* The zone they booked in, when it is not the one being read in —
                      it is what their invite says and what they agreed to. */}
                  {bookedElsewhere && (
                    <span style={{ color: 'var(--text-muted)' }}>
                      {' · booked '}
                      {formatShortWhen(start, application.bookedTimeZone)}{' '}
                      {application.bookedTimeZone}
                    </span>
                  )}
                </div>

                {application.submittedName !== candidateName && (
                  <p
                    data-testid={`application-submitted-as-${application.id}`}
                    style={{ margin: '2px 0 0', fontSize: 'var(--fs-13)', color: 'var(--text-muted)' }}
                  >
                    Applied as &ldquo;{application.submittedName}&rdquo;
                  </p>
                )}

                {/*
                  Beside the interview facts they change and above the history they
                  write — never inside the notes area, so a destructive control is never
                  adjacent to a field that autosaves (07 §08.39, 07 design §UI Notes).
                */}
                {actionable && (
                  <div className="application-schedule-actions">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setRescheduling(true)}
                      data-testid={`application-reschedule-${application.id}`}
                    >
                      {HIRING_MESSAGES.manage.rescheduleAction}
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => setCancelling(true)}
                      data-testid={`application-cancel-${application.id}`}
                    >
                      {HIRING_MESSAGES.manage.cancelActionTeam}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="card-section-status">
            {application.isCancelled && (
              <Tooltip
                content={cancelledTooltip(application.cancellation, viewerTimeZone)}
                placement="left"
                testId={`application-cancelled-tooltip-${application.id}`}
                style={{ display: 'inline-block' }}
              >
                {/* Names who cancelled and when (04 §03.11). The mark says the interview
                    did not take place and nothing about the candidate's standing — which
                    is why the section keeps its status control beside it. */}
                <Badge
                  tone="inactive"
                  aria-label={cancelledTooltip(application.cancellation, viewerTimeZone)}
                  data-testid={`application-cancelled-${application.id}`}
                >
                  {cancelledBadgeLabel(application.cancellation)}
                </Badge>
              </Tooltip>
            )}
            {expanded && (
              <Select
                value={application.status}
                options={applicationStatusOptions().map((option) => ({
                  ...option,
                  testId: `application-status-option-${application.id}-${option.value}`,
                }))}
                onChange={(value) => onStatusChange(value as ApplicationStatus)}
                aria-label={`Status for ${application.vacancy.title}`}
                data-testid={`application-status-select-${application.id}`}
                wrapperStyle={{ width: 170 }}
              />
            )}
          </div>
        </div>

        {/*
          Mounted only while open, so a card with four sections is not four idle
          availability hooks. Both close by restoring focus to the control that opened
          them, which `Modal` handles.
        */}
        {rescheduling && (
          <RescheduleDialog
            open
            orgId={orgId}
            applicationId={application.id}
            candidateName={candidateName}
            currentStartUtc={application.startUtc}
            viewerTimeZone={viewerTimeZone}
            onClose={() => setRescheduling(false)}
            onMoved={(updated) => {
              setRescheduling(false);
              onScheduleChange(updated, 'rescheduled');
            }}
          />
        )}

        {cancelling && (
          <CancelInterviewDialog
            open
            orgId={orgId}
            applicationId={application.id}
            candidateName={candidateName}
            startUtc={application.startUtc}
            timeZone={viewerTimeZone}
            onClose={() => setCancelling(false)}
            onCancelled={(updated) => {
              setCancelling(false);
              // The section is marked, never collapsed and never navigated away from
              // (07 design, Interactions).
              onScheduleChange(updated, 'cancelled');
            }}
          />
        )}

        {expanded && (
          <div className="card-section-body">
            <SchedulingHistory
              applicationId={application.id}
              /*
               * Two records, one list, merged here and only here — a CV version is not
               * an event, and folding it into the log would have put a filename and a
               * size in a row that has no place for either (07 §11.52).
               */
              entries={mergeTimeline(application.scheduleEvents, application.cvVersions, {
                submittedName: application.submittedName,
                timeZone: application.bookedTimeZone,
              })}
              viewerTimeZone={viewerTimeZone}
            />

            <CvRow orgId={orgId} application={application} />

            {application.note && (
              <div>
                <SectionLabel>Candidate&rsquo;s note</SectionLabel>
                <p
                  data-testid={`application-note-${application.id}`}
                  style={{
                    margin: 'var(--sp-4) 0 0',
                    whiteSpace: 'pre-wrap',
                    fontSize: 'var(--fs-15)',
                    lineHeight: 'var(--lh-normal)',
                    color: 'var(--text-sub)',
                  }}
                >
                  {application.note}
                </p>
              </div>
            )}

            {criteria}

            {children}
          </div>
        )}
      </Card>
    </div>
  );
}

/** The vacancy and its length; collapsed, the whole summary row; and the toggle. */
function Heading({
  application,
  minutes,
  expanded,
  collapsible,
  summary,
  onToggle,
}: {
  application: CardApplication;
  minutes: number;
  expanded: boolean;
  collapsible: boolean;
  summary: string | null;
  onToggle: () => void;
}) {
  const style = {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: 'var(--fs-16)',
    letterSpacing: '-.2px',
    color: 'var(--text)',
    marginBottom: 4,
  } as const;

  const title = (
    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
      <span data-testid={`application-vacancy-${application.id}`}>
        {application.vacancy.title}
      </span>
      <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
        {' · '}
        {formatDuration(minutes)}
        {summary ? ` · ${summary}` : ''}
      </span>
    </span>
  );

  if (!collapsible) return <div style={style}>{title}</div>;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      data-testid={`application-toggle-${application.id}`}
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--sp-4)',
        width: '100%',
        padding: 0,
        border: 'none',
        background: 'none',
        textAlign: 'left',
        color: 'var(--text)',
        cursor: 'pointer',
      }}
    >
      {title}
      <Chevron expanded={expanded} />
    </button>
  );
}

/** Decorative: the button's `aria-expanded` already carries the state. */
function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      style={{
        marginLeft: 'auto',
        flexShrink: 0,
        transform: `rotate(${expanded ? 180 : 0}deg)`,
        transition: 'transform 200ms',
      }}
    >
      <path
        d="M4 6l4 4 4-4"
        fill="none"
        stroke="var(--text-muted)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Every reschedule, every CV replacement, the cancellation and the original booking,
 * newest first — collapsed to one line until somebody asks for the sequence.
 *
 * Collapsed by default because a candidate who moved five times must not add five
 * permanent rows to a section that already needed collapsing (07 §11.54). And expansion
 * never scrolls: a member reading a card must not have the notes field move under their
 * cursor.
 *
 * A replacement is always the candidate's: internal members cannot replace or delete a
 * CV from any surface, so a row reading "CV replaced" is never a member's doing
 * (07 §07.37). The team sees it because a CV that changed silently between booking and
 * interview, after the interviewer read the first one, is a bad surprise (07 §07.38).
 *
 * **Team-only.** It appears here and on no candidate-facing surface (07 §11.53) — the
 * candidate already knows what they did, and showing them a tally of their own
 * reschedules reads as a reprimand from a page whose whole purpose is to make changing
 * an interview unremarkable.
 */
function SchedulingHistory({
  applicationId,
  entries,
  viewerTimeZone,
}: {
  applicationId: string;
  entries: TimelineEntry[];
  viewerTimeZone: string;
}) {
  const [expanded, setExpanded] = useState(false);
  // An application booked before the log existed has nothing to show, and one empty
  // summary row on every such card would be worse than none.
  if (entries.length === 0) return null;

  const listId = `application-history-${applicationId}`;

  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
        aria-controls={listId}
        data-testid={`application-history-toggle-${applicationId}`}
        style={{ paddingLeft: 0, color: 'var(--text-muted)' }}
      >
        <span aria-hidden style={{ marginRight: 'var(--sp-3)' }}>{expanded ? '▾' : '▸'}</span>
        {expanded ? HIRING_MESSAGES.manage.historyLabel : scheduleSummary(entries, viewerTimeZone)}
      </Button>

      {expanded && (
        <Card
          id={listId}
          data-testid={listId}
          style={{ background: 'var(--bg-panel-2)', marginTop: 'var(--sp-4)' }}
        >
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 'var(--sp-4)' }}>
            {entries.map((entry) => (
              <li
                key={entry.id}
                aria-label={scheduleEntryAriaLabel(entry, viewerTimeZone)}
                data-testid={`application-history-entry-${entry.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 'var(--sp-6)',
                  fontSize: 'var(--fs-13)',
                  color: 'var(--text)',
                }}
              >
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {scheduleEntryLabel(entry)}
                </span>
                <span style={{ color: 'var(--text-sub)' }}>{entry.actorName}</span>
                {/* The reason a member gave, never on a candidate-facing surface. */}
                {entry.reason && (
                  <span style={{ color: 'var(--text-sub)' }}>— {entry.reason}</span>
                )}
                <span
                  style={{
                    marginLeft: 'auto',
                    color: 'var(--text-faint)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {formatHistoryDate(new Date(entry.createdAt), viewerTimeZone)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/**
 * View and download, both pointed at the authenticated endpoint. There is no storage URL
 * on this page to leak (04 §07.33) — the key never leaves the server. Real links rather
 * than buttons, so the browser's own download handling applies.
 */
function CvRow({ orgId, application }: { orgId: string; application: CardApplication }) {
  // Every booking stores a CV, so an application without one is a record that lost it —
  // which is a fact worth stating rather than a row worth hiding.
  if (!application.cv) {
    return (
      <p
        data-testid="card-cv-unavailable"
        style={{ margin: 0, fontSize: 'var(--fs-14)', color: 'var(--text-muted)' }}
      >
        {HIRING_MESSAGES.card.cvUnavailable}
      </p>
    );
  }

  const href = `/api/organizations/${orgId}/hiring/applications/${application.id}/cv`;

  return (
    <div className="card-cv-row">
      <span
        data-testid="card-cv-name"
        style={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontSize: 'var(--fs-14)',
          color: 'var(--text)',
        }}
      >
        <span aria-hidden="true">📄 </span>
        {application.cv.fileName}
        {application.cv.sizeBytes !== null && (
          <span style={{ color: 'var(--text-muted)' }}> {fileSize(application.cv.sizeBytes)}</span>
        )}
      </span>
      <div className="card-cv-actions">
        <Button
          as="a"
          variant="secondary"
          size="sm"
          href={`${href}?disposition=inline`}
          target="_blank"
          rel="noreferrer"
          aria-label={`View ${application.cv.fileName}`}
          data-testid="card-cv-view"
        >
          View
        </Button>
        <Button
          as="a"
          variant="secondary"
          size="sm"
          href={href}
          download={application.cv.fileName}
          aria-label={`Download ${application.cv.fileName}`}
          data-testid="card-cv-download"
        >
          Download
        </Button>
      </div>
    </div>
  );
}

const KB = 1024;

/** `180 KB`, `1.4 MB` — enough to tell a real CV from an empty one. */
function fileSize(bytes: number): string {
  if (bytes < KB) return `${bytes} B`;
  if (bytes < KB * KB) return `${Math.round(bytes / KB)} KB`;
  return `${(bytes / (KB * KB)).toFixed(1)} MB`;
}
