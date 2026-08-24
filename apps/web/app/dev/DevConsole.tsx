'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { NORMALIZED_ROLES } from '@devscribed/validation';
import { Badge, Button, Card, InfoBanner, SectionLabel, Select, Spinner, Table } from '@/ds';

/**
 * LOCAL DEVELOPMENT AFFORDANCE — not part of the product.
 *
 * See the note in `page.tsx`. The outbox half is retired by a real mail transport; the
 * roles half is retired by user-management spec 04.
 *
 * Styling is intentionally flat and label-heavy — monospace ids, no page shell, no
 * illustrations — so nobody can mistake this screen for a product surface. Every value
 * still comes from the Meridian tokens, because a screen that invents its own colours
 * would be the one place in the app that drifts.
 */

/** Short enough that a link appears "while you watch", long enough not to hammer the API. */
const POLL_MS = 3000;

interface MailRow {
  type: string;
  to: string;
  subject: string;
  sentAt: string;
  link: string | null;
}

interface OrganizationRow {
  id: string;
  name: string;
  memberCount: number;
  createdAt: string;
}

interface MemberRow {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
}

/**
 * Three outcomes, not two: a 404 means the endpoints are fenced off (production, or a
 * real mail transport), which is a state this page renders deliberately rather than an
 * error. Anything else is a genuine failure worth showing verbatim.
 */
type Fetched<T> = { state: 'ok'; data: T } | { state: 'fenced' } | { state: 'error' };

async function get<T>(url: string): Promise<Fetched<T>> {
  try {
    const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
    if (response.status === 404) return { state: 'fenced' };
    if (!response.ok) return { state: 'error' };
    return { state: 'ok', data: (await response.json()) as T };
  } catch {
    return { state: 'error' };
  }
}

export function DevConsole() {
  // `fenced` is tracked once for the whole screen: the two controllers share one gate
  // (NODE_ENV), so if either 404s the walkthrough this page exists for is unavailable.
  const [fenced, setFenced] = useState(false);

  const [mail, setMail] = useState<MailRow[]>([]);
  const [mailLoaded, setMailLoaded] = useState(false);
  const [organizations, setOrganizations] = useState<OrganizationRow[]>([]);
  const [orgId, setOrgId] = useState('');
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [busyMember, setBusyMember] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const loadMail = useCallback(async () => {
    const result = await get<MailRow[]>('/api/test/mail');
    if (result.state === 'fenced') setFenced(true);
    if (result.state === 'ok') setMail(result.data);
    setMailLoaded(true);
  }, []);

  const loadOrganizations = useCallback(async () => {
    const result = await get<{ organizations: OrganizationRow[] }>('/api/test/memberships');
    if (result.state === 'fenced') setFenced(true);
    if (result.state !== 'ok') return;

    setOrganizations(result.data.organizations);
    // Preselecting the only organization is the common case locally; it removes a click
    // from every walkthrough without hiding the picker when there are several.
    setOrgId((current) => current || (result.data.organizations[0]?.id ?? ''));
  }, []);

  const loadMembers = useCallback(async (id: string) => {
    if (!id) {
      setMembers([]);
      return;
    }
    const result = await get<{ members: MemberRow[] }>(
      `/api/test/memberships?orgId=${encodeURIComponent(id)}`,
    );
    if (result.state === 'fenced') setFenced(true);
    if (result.state === 'ok') setMembers(result.data.members);
  }, []);

  useEffect(() => {
    void loadMail();
    void loadOrganizations();
  }, [loadMail, loadOrganizations]);

  useEffect(() => {
    void loadMembers(orgId);
  }, [orgId, loadMembers]);

  // The poll is the reason this panel is worth having: the second signer's link appears
  // the moment the first party signs, with nothing to re-run by hand. It stops once the
  // endpoints are fenced, so a production build does not poll a 404 forever.
  useEffect(() => {
    if (fenced) return;
    const timer = setInterval(() => void loadMail(), POLL_MS);
    return () => clearInterval(timer);
  }, [fenced, loadMail]);

  const setRole = async (member: MemberRow, role: string) => {
    setBusyMember(member.id);
    setNote(null);
    try {
      const response = await fetch('/api/test/role', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: member.email, role }),
      });
      if (response.status === 404) {
        setFenced(true);
        return;
      }
      if (!response.ok) {
        setNote(`Could not set ${member.email} to ${role}.`);
        return;
      }
      setNote(`${member.email} is now ${role}. Reload the app tab to pick up the new role.`);
      await loadMembers(orgId);
    } catch {
      setNote('The API did not answer.');
    } finally {
      setBusyMember(null);
    }
  };

  if (fenced) {
    return (
      <Shell>
        <InfoBanner tone="warning">
          Not available. The development endpoints answer only outside production, and the
          outbox additionally only while the in-memory mail sink is the transport in use.
        </InfoBanner>
      </Shell>
    );
  }

  return (
    <Shell>
      <div style={{ display: 'grid', gap: 'var(--sp-16)' }}>
        <Card
          title="Outbox"
          action={
            <Button size="sm" variant="secondary" onClick={() => void loadMail()}>
              Refresh
            </Button>
          }
        >
          <p style={{ margin: 0, marginBottom: 'var(--sp-10)', color: 'var(--text-muted)' }}>
            Every message the in-memory sink holds, newest first. Refreshes every{' '}
            {POLL_MS / 1000}s. Open a signing link in a new tab to act as that recipient.
          </p>
          {!mailLoaded ? (
            <Spinner />
          ) : mail.length === 0 ? (
            <Empty>Nothing sent yet. Send an envelope, or request a password reset.</Empty>
          ) : (
            <Table
              rows={mail.map((row, index) => ({ ...row, id: `${row.sentAt}-${index}` }))}
              columns={[
                {
                  label: 'Sent',
                  flex: 2,
                  render: (row: MailRow) => <Mono>{clockOf(row.sentAt)}</Mono>,
                },
                {
                  label: 'To',
                  flex: 3,
                  render: (row: MailRow) => <Mono>{row.to}</Mono>,
                },
                {
                  label: 'Type',
                  flex: 3,
                  render: (row: MailRow) => <Badge tone={toneOf(row.type)}>{row.type}</Badge>,
                },
                { label: 'Subject', flex: 4, render: (row: MailRow) => row.subject },
                {
                  label: 'Link',
                  flex: 3,
                  render: (row: MailRow) =>
                    row.link ? (
                      // A real anchor, new tab: the whole point is to become the recipient
                      // in a second tab while the sender's session stays signed in here.
                      <a href={row.link} target="_blank" rel="noreferrer">
                        Open
                      </a>
                    ) : (
                      <span style={{ color: 'var(--text-faint)' }}>none</span>
                    ),
                },
              ]}
            />
          )}
        </Card>

        <Card title="Roles">
          <p style={{ margin: 0, marginBottom: 'var(--sp-10)', color: 'var(--text-muted)' }}>
            Signup always creates an admin and there is no invite flow yet, so this is how
            the manager, user, and viewer views are reached. Retired by user-management
            spec 04.
          </p>
          <OrgPicker organizations={organizations} value={orgId} onChange={setOrgId} />
          {note ? (
            <div style={{ marginTop: 'var(--sp-10)' }}>
              <InfoBanner tone="info">{note}</InfoBanner>
            </div>
          ) : null}
          <div style={{ marginTop: 'var(--sp-10)' }}>
            {members.length === 0 ? (
              <Empty>No members. Sign up to create an organization.</Empty>
            ) : (
              <Table
                rows={members}
                columns={[
                  {
                    label: 'Member',
                    flex: 4,
                    render: (row: MemberRow) => (
                      <span>
                        {row.name} <Mono>{row.email}</Mono>
                      </span>
                    ),
                  },
                  {
                    label: 'Status',
                    flex: 2,
                    render: (row: MemberRow) => (
                      <Badge tone={row.status === 'active' ? 'active' : 'inactive'}>
                        {row.status}
                      </Badge>
                    ),
                  },
                  {
                    label: 'Role',
                    flex: 5,
                    render: (row: MemberRow) => (
                      <div style={{ display: 'flex', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
                        {NORMALIZED_ROLES.map((role) => (
                          <Button
                            key={role}
                            size="sm"
                            // The current role is the pressed one, so the row states the
                            // fact and offers the change in the same control.
                            variant={row.role === role ? 'primary' : 'secondary'}
                            disabled={busyMember === row.id}
                            onClick={() => void setRole(row, role)}
                          >
                            {role}
                          </Button>
                        ))}
                      </div>
                    ),
                  },
                ]}
              />
            )}
          </div>
        </Card>

        <Card title="Shortcuts">
          <p style={{ margin: 0, marginBottom: 'var(--sp-10)', color: 'var(--text-muted)' }}>
            Every organization that exists, so no id is ever copied by hand.
          </p>
          {organizations.length === 0 ? (
            <Empty>No organizations yet.</Empty>
          ) : (
            <div style={{ display: 'grid', gap: 'var(--sp-10)' }}>
              {organizations.map((org) => (
                <div
                  key={org.id}
                  style={{
                    border: 'var(--border-hair) solid var(--border)',
                    borderRadius: 'var(--radius-xl)',
                    padding: 'var(--sp-10)',
                  }}
                >
                  <div style={{ font: 'var(--type-h3)' }}>{org.name}</div>
                  <Mono>{org.id}</Mono>
                  <div
                    style={{
                      display: 'flex',
                      gap: 'var(--sp-12)',
                      marginTop: 'var(--sp-6)',
                      flexWrap: 'wrap',
                    }}
                  >
                    <a href={`/org/${org.id}/documents/templates`}>Templates</a>
                    <a href={`/org/${org.id}/documents`}>Documents</a>
                    <a href={`/org/${org.id}/members`}>Members</a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </Shell>
  );
}

function OrgPicker({
  organizations,
  value,
  onChange,
}: {
  organizations: OrganizationRow[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <Select
      label="Organization"
      value={value}
      onChange={onChange}
      placeholder="Select an organization"
      options={organizations.map((org) => ({
        value: org.id,
        label: `${org.name} (${org.memberCount})`,
      }))}
    />
  );
}

/**
 * The page frame. Not the application shell on purpose — no sidebar, no top bar, no
 * session — so this screen cannot be reached by navigating and cannot be mistaken for
 * one of the product's.
 */
function Shell({ children }: { children: ReactNode }) {
  return (
    <main
      style={{
        // A plain pixel cap, matching SigningLayout — the DS has no page-width token.
        maxWidth: 1100,
        margin: '0 auto',
        padding: 'var(--sp-24) var(--sp-16)',
      }}
    >
      <header style={{ marginBottom: 'var(--sp-16)' }}>
        <SectionLabel>Development console</SectionLabel>
        <p style={{ margin: 'var(--sp-4) 0 0', color: 'var(--text-muted)' }}>
          Local scaffolding, never shipped. Nothing here is linked from the application.
        </p>
      </header>
      {children}
    </main>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p style={{ margin: 0, color: 'var(--text-faint)' }}>{children}</p>;
}

/** Ids, addresses, and timestamps are things you compare character by character. */
function Mono({ children }: { children: ReactNode }) {
  return (
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-12)' }}>{children}</span>
  );
}

/** Time only: everything in a local walkthrough happened in the last few minutes. */
function clockOf(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleTimeString();
}

function toneOf(type: string): 'active' | 'warning' | 'info' | 'neutral' {
  if (type === 'envelope_completed') return 'active';
  if (type === 'envelope_declined' || type === 'envelope_voided') return 'warning';
  if (type === 'signing_invitation' || type === 'signing_reminder') return 'info';
  return 'neutral';
}
