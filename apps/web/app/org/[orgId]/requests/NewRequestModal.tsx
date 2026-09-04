'use client';

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { Button, Checkbox, FormActions, Modal, Select, TextArea, TextInput } from '@devscribed/ds';
import { optionFor, valueOf } from '@/select';
import { useSession } from '@/layout/session-context';
import {
  REQUEST_MESSAGES,
  REQUEST_PRIORITIES,
  REQUEST_TOPIC_MESSAGES,
  requestNeededByMax,
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
 * for. The client's name is the option's `hint`, which the design system draws as the
 * row's second line, so the two-line option needs no new primitive.
 */
interface ContactOption {
  id: string;
  displayName: string;
  clientId: string;
  clientName: string;
}

/** Which kind of addressee the request is for. Starts unset — PATCH-003. */
type AssigneeKind = 'member' | 'client';

const ASSIGNEE_KIND_OPTIONS: { value: AssigneeKind; label: string }[] = [
  { value: 'member', label: 'Colleague' },
  { value: 'client', label: 'Client' },
];

const microLabel: CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-family-base)',
  fontSize: 'var(--font-size-xs)',
  textTransform: 'uppercase',
  color: 'var(--text-secondary)',
  marginBottom: 'var(--space-3)',
};

/**
 * The order errors are reported in, which is also the order the first invalid field is
 * looked for in. Clicking an invalid form shows every error and moves focus to the first
 * one (AC-10); the submit control is never disabled for validation. The addressee kind
 * itself is not in this list — PATCH-003 checks it before any of these run, since every
 * field below it is disabled until it is answered.
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

/** Inline field error. Only the fields the specs name carry a test id. */
function FieldError({ field, message }: { field: string; message: string }) {
  const testId =
    field === 'title'
      ? 'request-new-error-title'
      : field === 'topicId'
        ? 'request-new-error-topic'
        : field === 'assigneeMembershipId' || field === 'assigneeClientMembershipId'
          ? 'request-new-error-assignee'
          : field === 'assigneeKind'
            ? 'request-new-error-assignee-kind'
            : undefined;
  return (
    <div
      id={`request-new-error-${field}`}
      data-testid={testId}
      style={{
        fontFamily: 'var(--font-family-base)',
        fontSize: 'var(--font-size-xs)',
        color: 'var(--status-error)',
        marginTop: 'var(--space-1)',
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
 * PATCH-003 — the addressee kind is asked first and starts unset, everything that reads
 * from it (About, Title, Description, Project, For) is disabled until it is answered, the
 * project now chooses the contact rather than the reverse, and Needed by opens seeded with
 * today and bounded by `requestNeededByMax`.
 *
 * One DS gap is still filled here with a token-carrying native element: there is no date
 * primitive. The textarea gap the spec's table also recorded is closed — the system ships
 * `TextArea` — so `Description` is the system's field like every other one on this form.
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
  // Unset until the caller answers it — PATCH-003. Nothing else in the form is read or
  // enabled before this is chosen.
  const [assigneeKind, setAssigneeKind] = useState<AssigneeKind | ''>('');
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
  const [dateFocus, setDateFocus] = useState(false);

  const assigneeKindRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const assigneeRef = useRef<HTMLDivElement>(null);
  const priorityRef = useRef<HTMLDivElement>(null);
  const projectRef = useRef<HTMLDivElement>(null);
  const topicRef = useRef<HTMLDivElement>(null);
  const neededByRef = useRef<HTMLInputElement | null>(null);

  // Re-seed clean whenever the modal opens, and load the addressee choices. Needed by is
  // seeded with today (PATCH-003) rather than left empty.
  useEffect(() => {
    if (!open) return;
    setTopicId('');
    setTitle('');
    setDescription('');
    setProjectId('');
    setAssigneeKind('');
    setAssigneeMembershipId('');
    setAssigneeClientMembershipId('');
    setPriority('normal');
    setBlocking(false);
    setNeededBy(today);
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
  }, [open, orgId, today]);

  /* The picker's own read: the addressee's audience, and active only — `staff` for a
     colleague and `client` for a client contact, re-issued when the kind is switched
     (REQ-03-024). Neither an archived topic nor one of the other audience is ever offered
     here. The list's topic FILTER reads the same route with `status=all`, which is a
     different question and deliberately a second read (REQ-02-031). PATCH-003 — while no
     kind is chosen yet, no read is issued at all. */
  useEffect(() => {
    if (!open || assigneeKind === '') return;
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
     session is not offered stale. PATCH-003 narrows which of these are OFFERED to the
     selected project's client, client-side, over this same read — see `contactOptions`
     below. */
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
   * Switching the addressee kind clears the chosen topic and project — a topic of the
   * other audience and a project chosen under the other kind's rules are both ones the
   * server will refuse — and leaves the title, description, priority, needed-by and
   * blocking values exactly where they are.
   */
  function chooseAssigneeKind(value: string): void {
    const kind: AssigneeKind = value === 'client' ? 'client' : 'member';
    if (kind === assigneeKind) return;
    setAssigneeKind(kind);
    setTopicId('');
    setProjectId('');
    setFieldErrors({});
  }

  /**
   * `[role="combobox"]` rather than `button`: the system's `Select` is a `tabIndex=0` box
   * carrying that role, and its only `<button>` is the clear-all a multi-select draws. A
   * selector looking for a button finds nothing here and fails silently — the form would
   * report its errors and move focus nowhere.
   */
  const comboboxIn = (wrapper: HTMLDivElement | null): HTMLElement | null =>
    wrapper?.querySelector<HTMLElement>('[role="combobox"]') ?? null;

  function focusFirstInvalid(errors: Record<string, string>): void {
    const first = FIELD_ORDER.find((field) => errors[field]);
    const target: Record<string, HTMLElement | null> = {
      topicId: comboboxIn(topicRef.current),
      title: titleRef.current?.querySelector('input') ?? null,
      description: descriptionRef.current,
      projectId: comboboxIn(projectRef.current),
      assigneeMembershipId: comboboxIn(assigneeRef.current),
      assigneeClientMembershipId: comboboxIn(assigneeRef.current),
      priority: comboboxIn(priorityRef.current),
      neededBy: neededByRef.current,
    };
    if (first) target[first]?.focus();
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (saving) return;

    // PATCH-003 — the addressee kind is checked before anything that depends on it is
    // even read: every other field is disabled while it is unset, so this is the only
    // error a submission with no kind chosen can raise.
    if (assigneeKind === '') {
      setFieldErrors({ assigneeKind: REQUEST_MESSAGES.assigneeInvalid });
      setFormError(null);
      comboboxIn(assigneeKindRef.current)?.focus();
      return;
    }

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

  // While no addressee kind is chosen, every field below it is disabled — PATCH-003.
  const fieldsDisabled = assigneeKind === '';

  // Only once the read has actually come back: a picker that has not been filled yet is
  // not an empty catalogue. Evaluated PER AUDIENCE, so switching to a kind whose
  // catalogue is empty replaces the picker and withdraws the submit control, and
  // switching back restores both (REQ-03-024, edge case 20). While no kind is chosen the
  // catalogue is never read (PATCH-003), so this never reports empty for an unset kind.
  const topics = assigneeKind === '' ? null : topicsByAudience[assigneeKind];
  const pickerEmpty = topics !== null && topics.length === 0;

  // PATCH-003 — a client-addressed request offers only projects that belong to a client;
  // the narrowing to the addressee's own client moved to `For`, below.
  const projectOptions =
    assigneeKind === 'client' ? projects.filter((project) => project.clientId !== null) : projects;

  // PATCH-003 — the project chooses the contact, not the reverse: `For` offers only the
  // active contacts of the selected project's client, and nothing until a project is
  // chosen.
  const selectedProject = projects.find((project) => project.id === projectId);
  const contactOptions =
    assigneeKind === 'client' && selectedProject
      ? contacts.filter((contact) => contact.clientId === selectedProject.clientId)
      : [];
  const clientForPlaceholder = !projectId
    ? 'Choose a project first'
    : contactOptions.length === 0
      ? "No contacts on this project's client"
      : 'Choose a contact';

  /**
   * `Select` deals in options rather than in the values behind them, and `value` is matched
   * against the very option objects in `options` — so each list is built once here and both
   * props read the same array. Built inline in the markup they would be a fresh set of
   * objects on every render, and nothing would ever match.
   */
  const topicOptions = (topics ?? []).map((topic) => ({ value: topic.id, label: topic.name }));
  const projectSelectOptions = projectOptions.map((project) => ({
    value: project.id,
    label: project.name,
  }));
  // The client's name is the option's `hint` — the system's own second line on a row —
  // rather than a `ReactNode` label, which `SelectOption.label` no longer accepts.
  const contactSelectOptions = contactOptions.map((contact) => ({
    value: contact.id,
    label: contact.displayName,
    hint: contact.clientName,
  }));
  const memberSelectOptions = members.map((member) => ({
    value: member.id,
    label: member.fullName,
  }));
  const priorityOptions = REQUEST_PRIORITIES.map((value) => ({
    value,
    label: value.charAt(0).toUpperCase() + value.slice(1),
  }));

  return (
    <Modal
      open={open}
      title="New request"
      onClose={() => {
        if (!saving) onClose();
      }}
      data-testid="request-new-modal"
    >
      <form id="request-new-form" onSubmit={submit} noValidate>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-7)' }}>
          {/* The addressee kind, first — PATCH-003. Everything below reads from it, so it
              is asked before anything it feeds. A labelled `Select` like every other
              field of this modal — a segmented control among them would read as a view
              switch rather than a field. */}
          <div ref={assigneeKindRef}>
            <Select
              label="To"
              value={optionFor(ASSIGNEE_KIND_OPTIONS, assigneeKind)}
              placeholder="Choose a recipient"
              options={ASSIGNEE_KIND_OPTIONS}
              onChange={(option) => chooseAssigneeKind(valueOf(option))}
              error={fieldErrors.assigneeKind != null}
              errorMessage={fieldErrors.assigneeKind}
              errorId="request-new-error-assignee-kind"
              data-testid="request-new-assignee-kind"
            />
          </div>

          {/* About — the only classifier a caller supplies. When the addressee's audience
              has no active topic the picker is replaced by the empty-catalogue copy and
              no submit control is drawn at all: the form says why it cannot be used,
              instead of failing when it is used (REQ-02-017). Not evaluated at all while
              no addressee kind is chosen (PATCH-003). */}
          {pickerEmpty ? (
            <div
              data-testid="request-new-topic-empty"
              style={{
                fontFamily: 'var(--font-family-base)',
                fontSize: 'var(--font-size-s)',
                color: 'var(--text-secondary)',
              }}
            >
              {REQUEST_TOPIC_MESSAGES.pickerEmpty}
            </div>
          ) : (
            <div ref={topicRef}>
              <Select
                label="About"
                value={optionFor(topicOptions, topicId)}
                placeholder="Choose a topic"
                isDisabled={fieldsDisabled}
                options={topicOptions}
                onChange={(option) => setTopicId(valueOf(option))}
                error={fieldErrors.topicId != null}
                errorMessage={fieldErrors.topicId}
                errorId="request-new-error-topic"
                data-testid="request-new-topic"
              />
            </div>
          )}

          <div ref={titleRef}>
            <TextInput
              label="Title"
              value={title}
              disabled={fieldsDisabled}
              onChange={(event) => setTitle(event.target.value)}
              error={fieldErrors.title}
              errorId="request-new-error-title"
              data-testid="request-new-title"
            />
          </div>

          {/* The system ships the multi-line field now, so the hand-drawn box and the
              focus flag that painted it are gone; the DS-gaps row this recorded is closed. */}
          <TextArea
            id="request-new-description"
            ref={descriptionRef}
            label="Description"
            value={description}
            disabled={fieldsDisabled}
            onChange={(event) => setDescription(event.target.value)}
            data-testid="request-new-description"
            error={fieldErrors.description}
            errorId="request-new-error-description"
          />

          <div ref={projectRef}>
            <Select
              label="Project"
              value={optionFor(projectSelectOptions, projectId)}
              placeholder={assigneeKind === 'client' ? 'Choose a project' : 'Any'}
              isDisabled={fieldsDisabled}
              options={projectSelectOptions}
              onChange={(option) => {
                setProjectId(valueOf(option));
                // PATCH-003 — the project chooses the contact now, so a contact chosen
                // under the previous project does not survive a change of project.
                setAssigneeClientMembershipId('');
              }}
              error={fieldErrors.projectId != null}
              errorMessage={fieldErrors.projectId}
              errorId="request-new-error-projectId"
              data-testid="request-new-project"
            />
          </div>

          <div ref={assigneeRef}>
            {assigneeKind === 'client' ? (
              <Select
                label="For"
                value={optionFor(contactSelectOptions, assigneeClientMembershipId)}
                placeholder={clientForPlaceholder}
                isDisabled={fieldsDisabled}
                options={contactSelectOptions}
                onChange={(option) => setAssigneeClientMembershipId(valueOf(option))}
                error={fieldErrors.assigneeClientMembershipId != null}
                errorMessage={fieldErrors.assigneeClientMembershipId}
                errorId="request-new-error-assignee"
                data-testid="request-new-assignee-client"
              />
            ) : (
              <Select
                label="For"
                value={optionFor(memberSelectOptions, assigneeMembershipId)}
                placeholder="Choose a person"
                isDisabled={fieldsDisabled}
                options={memberSelectOptions}
                onChange={(option) => setAssigneeMembershipId(valueOf(option))}
                error={fieldErrors.assigneeMembershipId != null}
                errorMessage={fieldErrors.assigneeMembershipId}
                errorId="request-new-error-assignee"
                data-testid="request-new-assignee-member"
              />
            )}
          </div>

          <div ref={priorityRef}>
            <Select
              label="Priority"
              value={optionFor(priorityOptions, priority)}
              options={priorityOptions}
              onChange={(option) => setPriority(valueOf(option))}
              error={fieldErrors.priority != null}
              errorMessage={fieldErrors.priority}
              errorId="request-new-error-priority"
              data-testid="request-new-priority"
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label htmlFor="request-new-needed-by" style={microLabel}>
              Needed by
            </label>
            {/* The system ships no date field, which is the one DS-gaps row this modal
                still stands on. The native control, painted in the system's own control
                tokens. Seeded with today and bounded by `requestNeededByMax` (PATCH-003,
                PATCH-002). */}
            <input
              id="request-new-needed-by"
              ref={neededByRef}
              type="date"
              value={neededBy}
              min={today}
              max={requestNeededByMax(today)}
              onChange={(event) => setNeededBy(event.target.value)}
              onFocus={() => setDateFocus(true)}
              onBlur={() => setDateFocus(false)}
              data-testid="request-new-needed-by"
              style={{
                height: 'var(--control-height)',
                width: '100%',
                border: `var(--border-width-control) solid ${
                  fieldErrors.neededBy
                    ? 'var(--status-error)'
                    : dateFocus
                      ? 'var(--action-primary)'
                      : 'var(--border-default)'
                }`,
                borderRadius: 'var(--radius-l)',
                padding: '0 var(--space-4)',
                fontFamily: 'var(--font-family-base)',
                fontSize: 'var(--font-size-s)',
                color: 'var(--text-primary)',
                background: 'var(--surface-card)',
                outline: 'none',
                boxShadow: dateFocus ? 'var(--shadow-focus-input)' : 'none',
                transition: 'var(--transition-border-focus)',
                boxSizing: 'border-box',
              }}
            />
            {fieldErrors.neededBy && <FieldError field="neededBy" message={fieldErrors.neededBy} />}
          </div>

          <Checkbox
            checked={blocking}
            onChange={(event) => setBlocking(event.target.checked)}
            label="Work is stopped until this is done"
            data-testid="request-new-blocking"
          />

          {formError && (
            <div
              style={{
                fontFamily: 'var(--font-family-base)',
                fontSize: 'var(--font-size-xs)',
                color: 'var(--status-error)',
              }}
            >
              {formError}
            </div>
          )}

          <FormActions>
            <Button type="button" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            {/* Disabled only while the request is in flight — never for validation. Not
                drawn at all when the catalogue offers nothing (REQ-02-017). */}
            {!pickerEmpty && (
              <Button
                type="submit"
                variant="primary"
                preloader={saving}
                disabled={saving}
                data-testid="request-new-submit"
              >
                {saving ? 'Creating' : 'Create request'}
              </Button>
            )}
          </FormActions>
        </div>
      </form>
    </Modal>
  );
}
