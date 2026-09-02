'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  APPLICATION_STATUS_LABELS,
  HIRING_MESSAGES,
  applicationStatusOptions,
  cancelledBadgeLabel,
  cancelledTooltip,
  formatHistoryDate,
  formatShortDate,
  formatShortWeekdayDate,
  formatShortWhen,
  formatSlotTime,
  formatZoneWithOffset,
  isLiveBooking,
  mergeTimeline,
  scheduleEntryAriaLabel,
  scheduleEntryLabel,
  scheduleSummary,
  type ApplicationStatus,
  type TimelineEntry,
} from '@devscribed/validation';
import {
  Badge,
  Button,
  CalendarIcon,
  Card,
  PersonOutlineIcon,
  Popover,
  Select,
  TimeOutlineIcon,
} from '@devscribed/ds';
import { CancelInterviewDialog } from '@/hiring/CancelInterviewDialog';
import { formatDuration, formatFileSize } from '@/hiring/format';
import { RescheduleDialog } from '@/hiring/RescheduleDialog';
import { VacancyStatusBadge } from '@/hiring/StatusBadge';
import { valueOf } from '@/hiring/select';
import type { CardApplication } from '@/hiring/types';
import { SectionHeading } from './SectionHeading';

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
  openReschedule,
  onToggle,
  onStatusChange,
  onScheduleChange,
  onOpenCalendar,
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
  /**
   * True when the candidate list sent the member here to move this interview
   * (`?reschedule=1`, 07 §08.40). Read **once**, at mount: it is where the page opened,
   * not a state the page is held in, so closing the dialog does not reopen it.
   */
  openReschedule?: boolean;
  onToggle: () => void;
  onStatusChange: (status: ApplicationStatus) => void;
  /**
   * A move or a cancellation landed: the server answered with the whole application, so
   * the section is replaced in place rather than the page refetched. Nothing on this
   * screen may reload the notes somebody is still typing.
   */
  onScheduleChange: (application: CardApplication, outcome: 'rescheduled' | 'cancelled') => void;
  /** Raises the toast that says the calendar link does not exist yet (03 §10.55). */
  onOpenCalendar: () => void;
  /** The criteria section, built by the page so it can share the library it fetched. */
  criteria: ReactNode;
  /** The editors, built by the page so the save closures stay in one place. */
  children: ReactNode;
}) {
  const router = useRouter();
  const section = useRef<HTMLDivElement>(null);
  const [rescheduling, setRescheduling] = useState(Boolean(openReschedule));
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

  /*
   * Two records, one list, merged here and only here — a CV version is not an event, and
   * folding it into the log would have put a filename and a size in a row that has no place
   * for either (07 §11.52). Read up here so the layout can ask whether there is anything to
   * draw before it spends a grid row on the answer.
   */
  const timeline = mergeTimeline(application.scheduleEvents, application.cvVersions, {
    submittedName: application.submittedName,
    timeZone: application.bookedTimeZone,
  });

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
      <Card variant="panel" clip={false} padded={false}>
        {/*
          The header pads itself so the rule under it can reach both edges of the card —
          see `.card-section-head` in globals.css.
        */}
        <div className={`card-section-head${expanded ? ' card-section-head-divided' : ''}`}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <Heading
              application={application}
              expanded={expanded}
              collapsible={collapsible}
              onToggle={onToggle}
              summary={
                expanded
                  ? null
                  : `${formatDuration(minutes)} · ${formatShortDate(start, viewerTimeZone)} · ${statusLabel}`
              }
            />

            {expanded && (
              <>
                {/* The vacancy's labels, under its name — the same neutral pill the list
                    and the vacancy page draw them with (ledger §59). */}
                {application.vacancy.categories.length > 0 && (
                  <div className="application-categories">
                    {application.vacancy.categories.map((category) => (
                      <Badge
                        key={category.id}
                        status="neutral"
                        size="s"
                        data-testid={`application-category-chip-${application.id}-${category.id}`}
                      >
                        {category.name}
                      </Badge>
                    ))}
                  </div>
                )}

                {/*
                  One fact per line, each led by its own glyph: the three things asked out
                  loud during an interview — when it is, how long it runs, who is taking it
                  — read as a list rather than as a dot-separated run. During the interview
                  is exactly when a run of three facts is hardest to read off a screen.
                */}
                <div className="application-meta">
                  {/* The date, alone on its line. */}
                  <p
                    className="application-meta-row"
                    data-testid={`application-when-${application.id}`}
                  >
                    <CalendarIcon aria-hidden width="18" height="18" />
                    <span>{formatShortWeekdayDate(start, viewerTimeZone)}</span>
                  </p>
                  {/*
                    The clock, the length and the zone read as one fact — *when it starts,
                    for how long, on whose clock* — so they share a line with the glyph that
                    means time. The zone carries its offset, because a bare IANA id answers
                    which zone and not what time that is.
                  */}
                  <p className="application-meta-row">
                    <TimeOutlineIcon aria-hidden width="18" height="18" />
                    <span>
                      {formatSlotTime(start, viewerTimeZone)}
                      <span className="application-meta-quiet">
                        {` · ${minutes} min · ${formatZoneWithOffset(start, viewerTimeZone)}`}
                      </span>
                      {/* The zone they booked in, when it is not the one being read in —
                          it is what their invite says and what they agreed to. */}
                      {bookedElsewhere && (
                        <span className="application-meta-quiet">
                          {` · booked ${formatShortWhen(start, application.bookedTimeZone)} `}
                          {formatZoneWithOffset(start, application.bookedTimeZone)}
                        </span>
                      )}
                    </span>
                  </p>
                  <p
                    className="application-meta-row"
                    data-testid={`application-interviewer-${application.id}`}
                  >
                    <PersonOutlineIcon aria-hidden width="18" height="18" />
                    <span>{application.interviewer.fullName}</span>
                  </p>
                </div>

              </>
            )}
          </div>

          {/* The header's right-hand column: what this interview *is*, over where it goes. */}
          <div className="card-section-aside">
          <div className="card-section-status">
            {/*
              Names who cancelled and when (04 §03.11). The mark says the interview did not
              take place and nothing about the candidate's standing — which is why the
              section keeps its status control beside it.

              The hover bubble is gone, and this is the second of reversal 2's three sites.
              The badge's *name* is still the whole fact, which is where the sentence has
              always lived — `cancelledTooltip` is the accessible name and the truncated
              form is only what is drawn. Native `title` would add nothing a reader can use
              and take something away: with text content already naming the badge, `title`
              becomes its description, so the same sentence would be announced twice. And a
              pointer user is not left guessing, because this screen draws the fact in full
              a few rows below, in the scheduling history, with who gave the reason and
              when — which the vacancies menu (§22) had nowhere to put.
            */}
            {application.isCancelled && (
              <Badge
                status="inactive"
                aria-label={cancelledTooltip(application.cancellation, viewerTimeZone)}
                data-testid={`application-cancelled-${application.id}`}
              >
                {cancelledBadgeLabel(application.cancellation)}
              </Badge>
            )}
            {expanded && <StatusSelect application={application} onChange={onStatusChange} />}
            {/*
              The interview's own actions, in the kebab every other list row in the module
              uses. They were two buttons under the facts they change — which put a
              destructive control in the reading order of the header, and put `Cancel
              interview` permanently on screen beside a status control somebody is using.
              A kebab is one deliberate press away from either (04 design §Layout).

              Rendered only while there is something in it: a menu whose every row is gone
              is a trigger that opens nothing.
            */}
            {expanded && actionable && (
              <Popover
                label={HIRING_MESSAGES.manage.interviewActions}
                data-testid={`application-actions-${application.id}`}
                items={[
                  {
                    key: 'reschedule',
                    label: HIRING_MESSAGES.manage.rescheduleAction,
                    testId: `application-reschedule-${application.id}`,
                    onSelect: () => setRescheduling(true),
                  },
                  {
                    key: 'cancel',
                    label: HIRING_MESSAGES.manage.cancelActionTeam,
                    testId: `application-cancel-${application.id}`,
                    // The one action on this page that cannot be undone.
                    danger: true,
                    onSelect: () => setCancelling(true),
                  },
                ]}
              />
            )}
          </div>

          {/*
            Where the header ends: the two places this interview goes. `View vacancy` is
            the record it belongs to; `Open in calendar` is the primary because during an
            interview it is the thing most often reached for — and it is honest about not
            existing yet (03 §10.55), rather than describing a navigation it cannot make.
          */}
          {expanded && (
            <div className="application-header-actions">
              <Button
                onClick={() => router.push(`/org/${orgId}/hiring/vacancies/${application.vacancy.id}`)}
                data-testid={`application-open-vacancy-${application.id}`}
              >
                {HIRING_MESSAGES.manage.viewVacancyAction}
              </Button>
              <Button
                variant="primary"
                onClick={onOpenCalendar}
                data-testid={`application-calendar-${application.id}`}
              >
                {HIRING_MESSAGES.manage.openInCalendarAction}
              </Button>
            </div>
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
            {/* Everything the team writes during the interview. */}
            <div className="card-section-main">
              {criteria}

              {children}
            </div>

            {/* Everything the candidate sent, in the order it is asked for. */}
            <div className="card-section-side">
              <div>
                <SectionHeading>From the candidate</SectionHeading>
                <CvRow orgId={orgId} application={application} />
              </div>

              {application.note && (
                <div>
                  <SectionHeading>Candidate&rsquo;s note</SectionHeading>
                  <p
                    data-testid={`application-note-${application.id}`}
                    style={{
                      margin: 'var(--space-3) 0 0',
                      whiteSpace: 'pre-wrap',
                      fontSize: 'var(--font-size-s)',
                      lineHeight: '22px',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {application.note}
                  </p>
                </div>
              )}

              {/*
                The name on the application, when it is not the name of the record it was
                filed under. It was in the header, beside the vacancy's own title, where it
                read as a fact about the interview; it is a fact about what they sent, so it
                sits at the bottom of what they sent.
              */}
              {application.submittedName !== candidateName && (
                <p
                  className="application-submitted-as"
                  data-testid={`application-submitted-as-${application.id}`}
                >
                  Applied as &ldquo;{application.submittedName}&rdquo;
                </p>
              )}
            </div>

            {/*
              The log spans both columns — it is neither the team's writing nor the
              candidate's material — and the row is not drawn at all when there is nothing
              in it. `SchedulingHistory` already returns null on an empty timeline; without
              this the grid would still spend a row's gap on the nothing it returned.
            */}
            {timeline.length > 0 && (
              <div className="card-section-log">
                <SchedulingHistory
                  applicationId={application.id}
                  entries={timeline}
                  viewerTimeZone={viewerTimeZone}
                />
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

/**
 * The vacancy and its length; collapsed, the whole summary row; and the toggle.
 *
 * A real `<h2>` — the level between `PageTitle`'s `<h1>` and the panel's own captions, which
 * is the outline Phase 3 established for a caption that names a surface (reversal 5). The
 * panel cannot use `Card`'s own `title` slot to get it: `Card` draws a title and one trailing
 * action in a single row, and this header carries the interview's facts and its two schedule
 * actions under the title and a badge and a status control beside it.
 *
 * When the section is collapsible the button goes *inside* the heading rather than the heading
 * inside the button, which is the disclosure pattern: the section is still findable by heading,
 * and the control that opens it is still a control.
 *
 * The type is blue's headline-6 — 16px, `--font-weight-medium`, -0.32px — which is exactly
 * what `Card` paints its own titles with. Meridian's `--font-display` at 600 and -.2px is the
 * same idea in a family the app no longer has.
 */
function Heading({
  application,
  expanded,
  collapsible,
  summary,
  onToggle,
}: {
  application: CardApplication;
  expanded: boolean;
  collapsible: boolean;
  summary: string | null;
  onToggle: () => void;
}) {
  const heading = {
    margin: '0 0 4px',
    fontWeight: 'var(--headline-6-weight)',
    fontSize: 'var(--headline-6-size)',
    lineHeight: 'var(--headline-6-line)',
    letterSpacing: 'var(--headline-6-tracking)',
    color: 'var(--text-primary)',
  } as const;

  const title = (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 'var(--space-4)',
        minWidth: 0,
      }}
    >
      <span
        data-testid={`application-vacancy-${application.id}`}
        style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}
      >
        {application.vacancy.title}
      </span>
      {/*
        The vacancy as it is **now**, beside its name — the one fact on this header that is
        not frozen at booking, and the one a member most needs before they act: an offer on
        a closed vacancy is a different conversation.
      */}
      <VacancyStatusBadge
        status={application.vacancy.status}
        testId={`application-vacancy-status-${application.id}`}
      />
      {/*
        The length has left the title. It is one of the three facts stated with a glyph
        below — when, how long, with whom — and stating it twice made the heading a run of
        four things separated by dots, which is the shape a *summary* has. A collapsed
        section still needs one, so `summary` keeps it.
      */}
      {summary && (
        <span
          style={{
            fontSize: 'var(--font-size-s)',
            color: 'var(--text-secondary)',
            fontWeight: 'var(--font-weight-regular)',
          }}
        >
          {summary}
        </span>
      )}
    </span>
  );

  if (!collapsible) return <h2 style={heading}>{title}</h2>;

  return (
    <h2 style={heading}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        data-testid={`application-toggle-${application.id}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
          width: '100%',
          padding: 0,
          border: 'none',
          background: 'none',
          textAlign: 'left',
          font: 'inherit',
          letterSpacing: 'inherit',
          color: 'inherit',
          cursor: 'pointer',
        }}
      >
        {title}
        <Chevron expanded={expanded} />
      </button>
    </h2>
  );
}

/**
 * The application's status, and the one control on this page that writes without a save.
 *
 * Blue's `Select` deals in options rather than the values behind them, so the current status
 * is looked up in the list rather than handed over as a bare string — passing the string would
 * draw `didnt_pass` where the label belongs.
 */
function StatusSelect({
  application,
  onChange,
}: {
  application: CardApplication;
  onChange: (status: ApplicationStatus) => void;
}) {
  const options = applicationStatusOptions().map((option) => ({
    ...option,
    testId: `application-status-option-${application.id}-${option.value}`,
  }));

  /*
   * The label is beside the control, not above it. `Select`'s own `label` prop is the form
   * geometry — indented, with 10px above and 4px below — which is right in a column of
   * fields and wrong in a header row, where it would push the control off the line the
   * kebab beside it sits on. So it is a plain span, at `FieldLabel`'s type and ink.
   */
  return (
    <span className="application-status-field">
      <span className="application-status-label" id={`application-status-label-${application.id}`}>
        {HIRING_MESSAGES.manage.statusLabel}
      </span>
      <Select
        value={options.find((option) => option.value === application.status)}
        options={options}
        onChange={(option) => onChange(valueOf(option) as ApplicationStatus)}
        aria-label={`Status for ${application.vacancy.title}`}
        data-testid={`application-status-select-${application.id}`}
        wrapperStyle={{ width: 170 }}
      />
    </span>
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
        transition: 'transform var(--duration-hover)',
      }}
    >
      <path
        d="M4 6l4 4 4-4"
        fill="none"
        stroke="var(--text-secondary)"
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
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
        aria-controls={listId}
        data-testid={`application-history-toggle-${applicationId}`}
      >
        <span aria-hidden style={{ marginRight: 'var(--space-2)' }}>{expanded ? '▾' : '▸'}</span>
        {expanded ? HIRING_MESSAGES.manage.historyLabel : scheduleSummary(entries, viewerTimeZone)}
      </Button>

      {/*
        The last of the token map's four `--bg-panel-2` surfaces, and it takes the answer
        Phase 4 gave the candidates filter bar rather than the one Phase 2 gave the shell:
        `--surface-sunken`, the tone blue already puts behind a `Table`'s own header row. A
        log inset into the panel it belongs to is a recessed surface, not a second white card
        floating inside a white card.
      */}
      {expanded && (
        <Card
          id={listId}
          data-testid={listId}
          style={{ background: 'var(--surface-sunken)', marginTop: 'var(--space-3)' }}
        >
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 'var(--space-3)' }}>
            {entries.map((entry) => (
              <li
                key={entry.id}
                aria-label={scheduleEntryAriaLabel(entry, viewerTimeZone)}
                data-testid={`application-history-entry-${entry.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 'var(--space-5)',
                  fontSize: 'var(--font-size-s)',
                  color: 'var(--text-primary)',
                }}
              >
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {scheduleEntryLabel(entry)}
                </span>
                <span style={{ color: 'var(--text-tertiary)' }}>{entry.actorName}</span>
                {/* The reason a member gave, never on a candidate-facing surface. */}
                {entry.reason && (
                  <span style={{ color: 'var(--text-tertiary)' }}>— {entry.reason}</span>
                )}
                {/*
                  Meridian drew this in `--text-faint`, the fourth text level blue does not
                  have (reversal 7). It takes `--text-secondary`, the answer Phase 3 settled
                  and Phase 4 applied twice: a timestamp beside the fact it dates is shown
                  but receded, which is the same reading as a past interview's date.
                */}
                <span
                  style={{
                    marginLeft: 'auto',
                    color: 'var(--text-secondary)',
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
 *
 * `Button as="a"` (ledger §38) is what keeps that true under blue, which measured a
 * `<button>` because prod has no control that navigates. Scripted navigation would lose
 * middle-click, copy-address, open-in-new-tab and `download`'s own filename handling, and
 * the CV test asserts three of the four.
 */
function CvRow({ orgId, application }: { orgId: string; application: CardApplication }) {
  // Every booking stores a CV, so an application without one is a record that lost it —
  // which is a fact worth stating rather than a row worth hiding.
  if (!application.cv) {
    return (
      <p
        data-testid="card-cv-unavailable"
        style={{ margin: 0, fontSize: 'var(--font-size-s)', color: 'var(--text-secondary)' }}
      >
        {HIRING_MESSAGES.card.cvUnavailable}
      </p>
    );
  }

  const href = `/api/organizations/${orgId}/hiring/applications/${application.id}/cv`;

  const extension = (application.cv.fileName.split('.').pop() || 'file').toUpperCase();

  return (
    <div className="card-cv">
      {/*
        The ordinary attachment row — an extension tile, the file's name, its weight — which
        is the shape a file has in every mail client and tracker, so it is recognised before
        it is read. It replaced a line of text led by a 📄: blue draws icons, never emoji,
        and the emoji was decoration beside a name that already said what it was (the same
        call 05 made on the board card's `CV` mark).

        **The row is the link.** A file row that opens the file is the whole affordance, so
        `View` is not a button any more — it is the object itself, and `Download` is left
        beneath as the one action a click cannot express.
      */}
      <a
        className="card-cv-file"
        href={`${href}?disposition=inline`}
        target="_blank"
        rel="noreferrer"
        aria-label={`View ${application.cv.fileName}`}
        data-testid="card-cv-view"
      >
        <span aria-hidden="true" className="card-cv-tile">
          {extension}
        </span>
        <span className="card-cv-meta">
          <span data-testid="card-cv-name" className="card-cv-filename">
            {application.cv.fileName}
          </span>
          {application.cv.sizeBytes !== null && (
            <span className="card-cv-size">{formatFileSize(application.cv.sizeBytes)}</span>
          )}
        </span>
      </a>
      <div className="card-cv-actions">
        <Button
          as="a"
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


