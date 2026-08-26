'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import {
  APPLICATION_STATUS_LABELS,
  HIRING_MESSAGES,
  applicationStatusOptions,
  formatShortDate,
  formatShortWhen,
  type ApplicationStatus,
} from '@devscribed/validation';
import { Badge, Button, Card, SectionLabel, Select } from '@/ds';
import { formatDuration } from '@/hiring/format';
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
  /** The criteria section, built by the page so it can share the library it fetched. */
  criteria: ReactNode;
  /** The editors, built by the page so the save closures stay in one place. */
  children: ReactNode;
}) {
  const section = useRef<HTMLDivElement>(null);

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

  return (
    <div
      ref={section}
      className="card-section"
      data-testid={`application-section-${application.id}`}
    >
      <Card>
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
              </>
            )}
          </div>

          <div className="card-section-status">
            {application.isCancelled && (
              <Badge tone="inactive" data-testid={`application-cancelled-${application.id}`}>
                Cancelled
              </Badge>
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

        {expanded && (
          <div className="card-section-body">
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
