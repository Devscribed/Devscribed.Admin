'use client';

import { notFound } from 'next/navigation';
import { use, useCallback, useEffect, useRef, useState } from 'react';
import { hasCapability } from '@devscribed/validation';
import { Badge, Button, Card, InfoBanner, Select, Preloader, Table } from '@devscribed/ds';
import { PageHeader } from '@/layout/PageHeader';
import { optionFor, valueOf } from '@/select';
import { useSession } from '@/layout/session-context';
import { apiRequest } from '@/documents/api';

/**
 * What went out — the outbox for an environment that simulates mail instead of sending it.
 *
 * Everything about this screen follows from one fact: there is no mail provider yet, so a
 * signing invitation is written, recorded, and delivered nowhere, and the signing link
 * exists nowhere but inside it. Without somewhere to read that back, "send the envelope and
 * open what the signer got" is not a thing anybody can do on a deployed environment.
 *
 * It shows only this organization's mail, and only to the roles that already decide who
 * signs — the API enforces both; see `mail/outbox.controller.ts`. Password resets are
 * absent on purpose: a reset link is an account takeover, and it has no business being one
 * click away from a colleague.
 *
 * The screen does not exist where mail is real. `GET /api/me` reports `features.mailOutbox`
 * and the sidebar draws nothing when it is false, which is the repository rule about dead
 * controls rather than a special case for this page.
 */

interface OutboxMessage {
  type: string;
  to: string;
  subject: string;
  sentAt: string;
  link: string | null;
  envelopeTitle: string | null;
  recipientName: string | null;
}

interface OutboxResponse {
  messages: OutboxMessage[];
}

const TYPE_OPTIONS = [
  { value: 'all', label: 'All messages' },
  { value: 'signing_invitation', label: 'Signing invitations' },
  { value: 'signing_reminder', label: 'Reminders' },
  { value: 'envelope_completed', label: 'Completions' },
  { value: 'envelope_declined', label: 'Declines' },
  { value: 'envelope_voided', label: 'Voids' },
];

const TYPE_LABEL: Record<string, string> = {
  signing_invitation: 'Invitation',
  signing_reminder: 'Reminder',
  envelope_completed: 'Completed',
  envelope_declined: 'Declined',
  envelope_voided: 'Voided',
};

/** The design system's own tones — no new ones invented for this screen. */
const TYPE_TONE: Record<string, 'active' | 'inactive' | 'warning' | 'info' | 'neutral'> = {
  signing_invitation: 'info',
  signing_reminder: 'warning',
  envelope_completed: 'active',
  envelope_declined: 'inactive',
  envelope_voided: 'inactive',
};

/**
 * Short enough that sending an envelope in one tab and watching it land here in another
 * feels immediate, long enough not to hammer a single-task API. The manual button is still
 * there for anyone who would rather not wait four seconds.
 */
const POLL_MS = 4000;

export default function OutboxPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  return <OutboxScreen orgId={orgId} />;
}

function OutboxScreen({ orgId }: { orgId: string }) {
  const { role, features } = useSession();

  const [messages, setMessages] = useState<OutboxMessage[]>([]);
  const [type, setType] = useState('all');
  const [loading, setLoading] = useState(true);
  const [gone, setGone] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // Read by the poller so it always asks for the filter currently on screen without being
  // torn down and rebuilt every time the filter changes.
  const wanted = useRef(type);
  wanted.current = type;

  const load = useCallback(async (): Promise<void> => {
    const query = wanted.current === 'all' ? '' : `?type=${wanted.current}`;
    const result = await apiRequest<OutboxResponse>(
      `/api/organizations/${orgId}/outbox${query}`,
    );
    if (!result.ok) {
      // 403 (wrong role) and 404 (no sink here, or a foreign org) are the same answer to
      // the caller: this screen does not exist for you.
      if (result.failure.status === 403 || result.failure.status === 404) setGone(true);
      setLoading(false);
      return;
    }
    setMessages(result.data.messages);
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load, type]);

  useEffect(() => {
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  if (gone || !features.mailOutbox || !hasCapability(role, 'ManageEnvelopes')) notFound();

  async function copy(link: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(link);
      setTimeout(() => setCopied((current) => (current === link ? null : current)), 2000);
    } catch {
      // A clipboard the browser refuses is not an error worth a banner — the link is on
      // screen and selectable either way.
    }
  }

  return (
    <div data-testid="outbox-page">
      <PageHeader
        title="Outbox"
        subtitle="Mail this environment simulated instead of sending"
        action={
          <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center' }}>
            <Select
              data-testid="outbox-type-filter"
              value={optionFor(TYPE_OPTIONS, type)}
              onChange={(option) => setType(valueOf(option))}
              options={TYPE_OPTIONS}
            />
            <Button data-testid="outbox-refresh-btn" onClick={() => void load()}>
              Refresh
            </Button>
          </div>
        }
      />

      <InfoBanner variant="info" data-testid="outbox-explainer">
        No mail provider is connected yet, so nothing here was delivered. These are the
        messages the application produced, with the links they carry — the same links a
        recipient would click. Only this organization&apos;s mail is listed.
      </InfoBanner>

      {loading && messages.length === 0 && (
        <div
          data-testid="outbox-loading"
          style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-12)' }}
        >
          <Preloader size={28} />
        </div>
      )}

      {!loading && messages.length === 0 && (
        <Card data-testid="outbox-empty">
          <div style={{ padding: 'var(--space-10)', color: 'var(--text-secondary)' }}>
            Nothing sent yet. Send an envelope and it will appear here within a few seconds.
          </div>
        </Card>
      )}

      {messages.length > 0 && (
        <Card padded={false}>
          <Table<OutboxMessage>
            data-testid="outbox-table"
            columns={[
              {
                label: 'Sent',
                flex: 1,
                align: 'flex-start',
                render: (message) => (
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {formatSentAt(message.sentAt)}
                  </span>
                ),
              },
              {
                label: 'Type',
                flex: 1,
                align: 'flex-start',
                render: (message) => (
                  <Badge status={TYPE_TONE[message.type] ?? 'info'}>
                    {TYPE_LABEL[message.type] ?? message.type}
                  </Badge>
                ),
              },
              {
                label: 'To',
                flex: 2,
                align: 'flex-start',
                render: (message) => (
                  <span style={{ wordBreak: 'break-all' }} data-testid="outbox-to">
                    {message.to}
                  </span>
                ),
              },
              {
                label: 'Document',
                flex: 2,
                align: 'flex-start',
                render: (message) => <span>{message.envelopeTitle ?? '—'}</span>,
              },
              {
                label: 'Link',
                flex: 3,
                align: 'flex-start',
                maxWidth: 'none',
                render: (message) =>
                  message.link ? (
                    <span
                      style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', width: '100%' }}
                    >
                      <a
                        data-testid="outbox-link"
                        href={message.link}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: 'var(--action-primary)', wordBreak: 'break-all', flex: 1 }}
                      >
                        {message.link}
                      </a>
                      <Button data-testid="outbox-copy-btn" onClick={() => void copy(message.link!)}>
                        {copied === message.link ? 'Copied' : 'Copy'}
                      </Button>
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-secondary)' }}>No link in this message</span>
                  ),
              },
            ]}
            rows={messages}
            rowKey={(message) => `${message.sentAt}-${message.to}`}
            rowTestId="outbox-row"
          />
        </Card>
      )}
    </div>
  );
}

/** Date and time, because an outbox is read by "what did I just send". */
function formatSentAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
