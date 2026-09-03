'use client';

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { Button, Checkbox, Input, Modal, Select } from '@/ds';
import { useSession } from '@/layout/session-context';
import {
  REQUEST_MESSAGES,
  REQUEST_PRIORITIES,
  REQUEST_TOPIC_MESSAGES,
  todayInTimeZone,
  validateNewRequest,
} from '@devscribed/validation';
import type { RequestRowData } from './types';

/** Active members of the organization, as the members list returns them. */
interface MemberOption {
  id: string;
  fullName: string;
  status: 'active' | 'removed';
}

/** One offer in the About picker — an active topic of the addressee's audience. */
interface TopicOption {
  id: string;
  name: string;
}

/**
 * Requests spec 03 — one offer in the contact picker: a person, and the client they work
 * for. The option label renders both, which the design system's `Select` already types as
 * a `ReactNode`, so the two-line option needs no new primitive.
 */
interface ContactOption {
  id: string;
  displayName: string;
  clientId: string;
  clientName: string;
}

/** Which kind of addressee the request is for. */
type AssigneeKind = 'member' | 'client';

const ASSIGNEE_KIND_OPTIONS: { value: AssigneeKind; label: string }[] = [
  { value: 'member', label: 'Colleague' },
  { value: 'client', label: 'Client' },
];

const microLabel: CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--fs-11)',
  letterSpacing: 'var(--ls-wider)',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  marginBottom: 'var(--sp-4)',
};

/**
 * The order errors are reported in, which is also the order the first invalid field is
 * looked for in. Clicking an invalid form shows every error and moves focus to the first
 * one (AC-10); the submit control is never disabled for validation.
 */
const FIELD_ORDER = [
  'topicId',
  'title',
  'description',
  'projectId',
  'assigneeMembershipId',
  'assigneeClientMembershipId',
  'priority',
  'neededBy',
] as const;

/** Inline field error. Only the four the specs name carry a test id. */
function FieldError({ field, message }: { field: string; message: string }) {
  const testId =
    field === 'title'
      ? 'request-new-error-title'
      : field === 'topicId'
        ? 'request-new-error-topic'
        : field === 'assigneeMembershipId' || field === 'assigneeClientMembershipId'
          ? 'request-new-error-assignee'
          : undefined;
  return (
    <div
      id={`request-new-error-${field}`}
      data-testid={testId}
      style={{
        fontFamily: 'var(--font-text)',
        fontSize: 'var(--fs-12)',
        color: 'var(--error-500)',
        marginTop: 'var(--sp-2)',
      }}
    >
      {message}
    </div>
  );
}

/**
 * New request (requests spec 01 requirements 1–15). The client validates rules 1–7 for
 * immediate feedback and the server re-validates every one of them, including the two it
 * cannot check — an active membership and an available project.
 *
 * Two `@ds` gaps are filled here with token-carrying native elements, exactly as the
 * vacation modals already do: there is no textarea primitive and no date primitive. Both
 * are recorded in the spec's DS-gaps table; neither gets a style of its own.
 */
export function NewRequestModal({
  orgId,
  open,
  projects,
  onClose,
  onCreated,
}: {
  orgId: string;
  open: boolean;
  projects: { id: string; name: string; clientId: string | null }[];
  onClose: () => void;
  onCreated: (request: RequestRowData) => void;
}) {
  const session = useSession();
  const today = todayInTimeZone(session.account.timezone);

  const [topicId, setTopicId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState('');
  const [assigneeKind, setAssigneeKind] = useState<AssigneeKind>('member');
  const [assigneeMembershipId, setAssigneeMembershipId] = useState('');
  const [assigneeClientMembershipId, setAssigneeClientMembershipId] = useState('');
  const [priority, setPriority] = useState('normal');
  const [blocking, setBlocking] = useState(false);
  const [neededBy, setNeededBy] = useState('');

  const [members, setMembers] = useState<MemberOption[]>([]);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  // `null` while the catalogue has not been read yet, so an empty picker is never drawn
  // before the answer arrives. Kept PER AUDIENCE: switching back to one already read must
  // restore what it offered, and a failed read for one must not empty the other.
  const [topicsByAudience, setTopicsByAudience] = useState<
    Record<AssigneeKind, TopicOption[] | null>
  >({ member: null, client: null });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [descriptionFocus, setDescriptionFocus] = useState(false);
  const [dateFocus, setDateFocus] = useState(false);

  const titleRef = useRef<HTMLDivElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const assigneeRef = useRef<HTMLDivElement>(null);
  const priorityRef = useRef<HTMLDivElement>(null);
  const projectRef = useRef<HTMLDivElement>(null);
  const topicRef = useRef<HTMLDivElement>(null);
  const neededByRef = useRef<HTMLInputElement | null>(null);

  // Re-seed clean whenever the modal opens, and load the addressee choices.
  useEffect(() => {
    if (!open) return;
    setTopicId('');
    setTitle('');
    setDescription('');
    setProjectId('');
    setAssigneeKind('member');
    setAssigneeMembershipId('');
    setAssigneeClientMembershipId('');
    setPriority('normal');
    setBlocking(false);
    setNeededBy('');
    setFieldErrors({});
    setFormError(null);
    setSaving(false);
    setTopicsByAudience({ member: null, client: null });

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/organizations/${orgId}/members`, {
          credentials: 'same-origin',
        });
        if (!response.ok) return;
        const data = (await response.json()) as { members: MemberOption[] };
        if (!cancelled) setMembers(data.members.filter((m) => m.status === 'active'));
      } catch {
        // The addressee list stays empty; the server refuses a request with no
        // addressee, and the inline error says so.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, orgId]);

  /* The picker's own read: the addressee's audience, and active only — `staff` for a
     colleague and `client` for a client contact, re-issued when the kind is switched
     (REQ-03-024). Neither an archived topic nor one of the other audience is ever offered
     here. The list's topic FILTER reads the same route with `status=all`, which is a
     different question and deliberately a second read (REQ-02-031). */
  useEffect(() => {
    if (!open) return;
    if (topicsByAudience[assigneeKind] !== null) return;
    const audience = assigneeKind === 'client' ? 'client' : 'staff';
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(
          `/api/organizations/${orgId}/request-topics?audience=${audience}&status=active`,
          { credentials: 'same-origin' },
        );
        if (!response.ok) return;
        const data = (await response.json()) as { topics: TopicOption[] };
        if (!cancelled) {
          setTopicsByAudience((prev) => ({
            ...prev,
            [assigneeKind]: data.topics.map((t) => ({ id: t.id, name: t.name })),
          }));
        }
      } catch {
        // The picker stays in its loading state rather than claiming the catalogue is
        // empty: "no topics" is a statement, and a failed read has not made it.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, orgId, assigneeKind, topicsByAudience]);

  /* The contact picker's offers: REQ-03-043's read — the active contacts of every client
     that owns a project this requester is assigned to, which is the same boundary the
     create route enforces (REQ-03-023), so the picker offers what the server accepts.
     It is the requester's own route, guarded by `create-request`: the client book's
     contacts route is a manager's read and a `user` is answered 404 by it. Read on the
     open cycle rather than once, so a contact invited or removed elsewhere in the same
     session is not offered stale. */
  useEffect(() => {
    if (!open || assigneeKind !== 'client') return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/organizations/${orgId}/request-contacts`, {
          credentials: 'same-origin',
        });
        if (!response.ok) return;
        const body = (await response.json()) as { contacts: ContactOption[] };
        if (!cancelled) {
          setContacts(
            body.contacts.map((contact) => ({
              id: contact.id,
              displayName: contact.displayName,
              clientId: contact.clientId,
              clientName: contact.clientName,
            })),
          );
        }
      } catch {
        // The picker offers nothing; the server refuses a request with no addressee and
        // the inline error says so.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, orgId, assigneeKind]);

  /**
   * Switching the addressee kind clears the chosen topic — a topic of the other audience
   * is one the server will refuse — and leaves the title, description, priority,
   * needed-by and blocking values exactly where they are.
   */
  function chooseAssigneeKind(value: string): void {
    const kind: AssigneeKind = value === 'client' ? 'client' : 'member';
    if (kind === assigneeKind) return;
    setAssigneeKind(kind);
    setTopicId('');
    setProjectId('');
    setFieldErrors({});
  }

  function focusFirstInvalid(errors: Record<string, string>): void {
    const first = FIELD_ORDER.find((field) => errors[field]);
    const target: Record<string, HTMLElement | null> = {
      topicId: topicRef.current?.querySelector('button') ?? null,
      title: titleRef.current?.querySelector('input') ?? null,
      description: descriptionRef.current,
      projectId: projectRef.current?.querySelector('button') ?? null,
      assigneeMembershipId: assigneeRef.current?.querySelector('button') ?? null,
      assigneeClientMembershipId: assigneeRef.current?.querySelector('button') ?? null,
      priority: priorityRef.current?.querySelector('button') ?? null,
      neededBy: neededByRef.current,
    };
    if (first) target[first]?.focus();
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (saving) return;

    // Neither `type` nor `accessKind` is sent: the kind is set by the topic, and the
    // route refuses a body carrying either name (REQ-02-021, REQ-02-022).
    const body = {
      topicId,
      title,
      description: description.trim().length > 0 ? description : undefined,
      projectId: projectId.length > 0 ? projectId : undefined,
      assigneeKind,
      // Exactly one addressee id is sent, the one the chosen kind selects.
      assigneeMembershipId:
        assigneeKind === 'member' && assigneeMembershipId.length > 0
          ? assigneeMembershipId
          : undefined,
      assigneeClientMembershipId:
        assigneeKind === 'client' && assigneeClientMembershipId.length > 0
          ? assigneeClientMembershipId
          : undefined,
      priority,
      blocking,
      neededBy: neededBy.length > 0 ? neededBy : undefined,
    };

    const parsed = validateNewRequest(body, today);
    if (!parsed.valid) {
      setFieldErrors(parsed.fields);
      setFormError(null);
      focusFirstInvalid(parsed.fields);
      return;
    }

    setFieldErrors({});
    setFormError(null);
    setSaving(true);
    try {
      const response = await fetch(`/api/organizations/${orgId}/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      });
      if (response.status === 201) {
        const created = (await response.json()) as RequestRowData;
        setSaving(false);
        onCreated(created);
        onClose();
        return;
      }
      const failure = await response.json().catch(() => null);
      if (failure?.fields && typeof failure.fields === 'object') {
        setFieldErrors(failure.fields as Record<string, string>);
        focusFirstInvalid(failure.fields as Record<string, string>);
      } else {
        setFormError(failure?.message ?? REQUEST_MESSAGES.genericError);
      }
    } catch {
      setFormError(REQUEST_MESSAGES.genericError);
    }
    setSaving(false);
  }

  // Only once the read has actually come back: a picker that has not been filled yet is
  // not an empty catalogue. Evaluated PER AUDIENCE, so switching to a kind whose
  // catalogue is empty replaces the picker and withdraws the submit control, and
  // switching back restores both (REQ-03-024, edge case 20).
  const topics = topicsByAudience[assigneeKind];
  const pickerEmpty = topics !== null && topics.length === 0;

  // A client-addressed request names a project of the addressee's client, so the control
  // offers only those. The narrowing is a convenience; the server decides (REQ-03-022).
  const chosenContact = contacts.find((contact) => contact.id === assigneeClientMembershipId);
  const projectOptions =
    assigneeKind === 'client'
      ? projects.filter(
          (project) => chosenContact !== undefined && project.clientId === chosenContact.clientId,
        )
      : projects;

  return (
    <Modal
      open={open}
      title="New request"
      onClose={() => {
        if (!saving) onClose();
      }}
      width={520}
      data-testid="request-new-modal"
      actions={
        <>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            onClick={onClose}
            disabled={saving}
            style={{ flex: 1 }}
          >
            Cancel
          </Button>
          {/* Disabled only while the request is in flight — never for validation. Not
              drawn at all when the catalogue offers nothing (REQ-02-017). */}
          {!pickerEmpty && (
            <Button
              type="submit"
              form="request-new-form"
              variant="primary"
              size="lg"
              loading={saving}
              data-testid="request-new-submit"
              style={{ flex: 1 }}
            >
              {saving ? 'Creating' : 'Create request'}
            </Button>
          )}
        </>
      }
    >
      <form id="request-new-form" onSubmit={submit} noValidate>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)' }}>
          {/* About — the only classifier a caller supplies. When the addressee's audience
              has no active topic the picker is replaced by the empty-catalogue copy and
              no submit control is drawn at all: the form says why it cannot be used,
              instead of failing when it is used (REQ-02-017). */}
          {pickerEmpty ? (
            <div
              data-testid="request-new-topic-empty"
              style={{
                fontFamily: 'var(--font-text)',
                fontSize: 'var(--fs-14)',
                color: 'var(--text-muted)',
              }}
            >
              {REQUEST_TOPIC_MESSAGES.pickerEmpty}
            </div>
          ) : (
            <div ref={topicRef}>
              <Select
                label="About"
                value={topicId}
                placeholder="Choose a topic"
                options={(topics ?? []).map((topic) => ({
                  value: topic.id,
                  label: topic.name,
                }))}
                onChange={setTopicId}
                error={fieldErrors.topicId}
                data-testid="request-new-topic"
              />
              {fieldErrors.topicId && (
                <FieldError field="topicId" message={fieldErrors.topicId} />
              )}
            </div>
          )}

          <div ref={titleRef}>
            <Input
              label="Title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              error={fieldErrors.title}
              data-testid="request-new-title"
            />
            {fieldErrors.title && <FieldError field="title" message={fieldErrors.title} />}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label htmlFor="request-new-description" style={microLabel}>
              Description
            </label>
            {/* @ds ships no textarea; this is the token-carrying native element the
                vacation reject modal already uses. Recorded in the spec's DS gaps. */}
            <textarea
              id="request-new-description"
              ref={descriptionRef}
              value={description}
              rows={4}
              onChange={(event) => setDescription(event.target.value)}
              onFocus={() => setDescriptionFocus(true)}
              onBlur={() => setDescriptionFocus(false)}
              data-testid="request-new-description"
              style={{
                width: '100%',
                border: `var(--border-crisp) solid ${
                  fieldErrors.description
                    ? 'var(--error-500)'
                    : descriptionFocus
                      ? 'var(--accent)'
                      : 'var(--border-strong)'
                }`,
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--sp-4) var(--sp-6)',
                fontFamily: 'var(--font-text)',
                fontSize: 'var(--fs-15)',
                color: 'var(--text)',
                background: 'var(--bg-field)',
                outline: 'none',
                boxShadow: descriptionFocus ? 'var(--shadow-glow-accent)' : 'none',
                transition: 'border-color .15s, box-shadow .15s',
                resize: 'vertical',
              }}
            />
            {fieldErrors.description && (
              <FieldError field="description" message={fieldErrors.description} />
            )}
          </div>

          <div ref={projectRef}>
            <Select
              label="Project"
              value={projectId}
              placeholder={assigneeKind === 'client' ? 'Choose a project' : 'Any'}
              options={projectOptions.map((project) => ({
                value: project.id,
                label: project.name,
              }))}
              onChange={setProjectId}
              error={fieldErrors.projectId}
              data-testid="request-new-project"
            />
            {fieldErrors.projectId && (
              <FieldError field="projectId" message={fieldErrors.projectId} />
            )}
          </div>

          {/* The addressee kind, above the addressee itself. A labelled `Select` like
              every other field of this modal — a segmented control among them would read
              as a view switch rather than a field. */}
          <div>
            <Select
              label="To"
              value={assigneeKind}
              options={ASSIGNEE_KIND_OPTIONS}
              onChange={chooseAssigneeKind}
              data-testid="request-new-assignee-kind"
            />
          </div>

          <div ref={assigneeRef}>
            {assigneeKind === 'client' ? (
              <Select
                label="For"
                value={assigneeClientMembershipId}
                placeholder="Choose a contact"
                options={contacts.map((contact) => ({
                  value: contact.id,
                  // A `ReactNode` label: the person's name over their client's, which the
                  // design system's `Select` already accepts.
                  label: (
                    <span style={{ display: 'flex', flexDirection: 'column' }}>
                      <span>{contact.displayName}</span>
                      <span style={{ fontSize: 'var(--fs-12)', color: 'var(--text-muted)' }}>
                        {contact.clientName}
                      </span>
                    </span>
                  ),
                }))}
                onChange={(value) => {
                  setAssigneeClientMembershipId(value);
                  // A project of the previous contact's client is one the server would
                  // refuse, so the choice does not survive a change of addressee.
                  setProjectId('');
                }}
                error={fieldErrors.assigneeClientMembershipId}
                data-testid="request-new-assignee-client"
              />
            ) : (
              <Select
                label="For"
                value={assigneeMembershipId}
                placeholder="Choose a person"
                options={members.map((member) => ({ value: member.id, label: member.fullName }))}
                onChange={setAssigneeMembershipId}
                error={fieldErrors.assigneeMembershipId}
                data-testid="request-new-assignee-member"
              />
            )}
            {(fieldErrors.assigneeMembershipId || fieldErrors.assigneeClientMembershipId) && (
              <FieldError
                field={
                  assigneeKind === 'client' ? 'assigneeClientMembershipId' : 'assigneeMembershipId'
                }
                message={
                  (assigneeKind === 'client'
                    ? fieldErrors.assigneeClientMembershipId
                    : fieldErrors.assigneeMembershipId) as string
                }
              />
            )}
          </div>

          <div ref={priorityRef}>
            <Select
              label="Priority"
              value={priority}
              options={REQUEST_PRIORITIES.map((value) => ({
                value,
                label: value.charAt(0).toUpperCase() + value.slice(1),
              }))}
              onChange={setPriority}
              error={fieldErrors.priority}
              data-testid="request-new-priority"
            />
            {fieldErrors.priority && <FieldError field="priority" message={fieldErrors.priority} />}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label htmlFor="request-new-needed-by" style={microLabel}>
              Needed by
            </label>
            {/* @ds ships no date field either — same precedent, same DS-gaps row. */}
            <input
              id="request-new-needed-by"
              ref={neededByRef}
              type="date"
              value={neededBy}
              min={today}
              onChange={(event) => setNeededBy(event.target.value)}
              onFocus={() => setDateFocus(true)}
              onBlur={() => setDateFocus(false)}
              data-testid="request-new-needed-by"
              style={{
                height: 'var(--field-h-lg)',
                width: '100%',
                border: `var(--border-crisp) solid ${
                  fieldErrors.neededBy
                    ? 'var(--error-500)'
                    : dateFocus
                      ? 'var(--accent)'
                      : 'var(--border-strong)'
                }`,
                borderRadius: 'var(--radius-lg)',
                padding: '0 var(--sp-6)',
                fontFamily: 'var(--font-text)',
                fontSize: 'var(--fs-15)',
                color: 'var(--text)',
                background: 'var(--bg-field)',
                outline: 'none',
                boxShadow: dateFocus ? 'var(--shadow-glow-accent)' : 'none',
                transition: 'border-color .15s, box-shadow .15s',
              }}
            />
            {fieldErrors.neededBy && <FieldError field="neededBy" message={fieldErrors.neededBy} />}
          </div>

          <Checkbox
            checked={blocking}
            onChange={setBlocking}
            label="Work is stopped until this is done"
            data-testid="request-new-blocking"
          />

          {formError && (
            <div
              style={{
                fontFamily: 'var(--font-text)',
                fontSize: 'var(--fs-13)',
                color: 'var(--error-500)',
              }}
            >
              {formError}
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
}
