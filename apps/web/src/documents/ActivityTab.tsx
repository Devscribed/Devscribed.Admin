'use client';

import { useEffect, useState } from 'react';
import { Badge, Card, Spinner } from '@/ds';
import { apiRequest } from './api';
import {
  envelopeUrl,
  eventLabel,
  formatUtcTimestamp,
  type AuditResponse,
} from './envelopes';

/**
 * The Activity tab — the audit chronology plus the verdict on the hash chain.
 *
 * The chain badge is the point of the tab. An event list on its own says "here is what we
 * recorded"; the badge says "and here is the arithmetic that shows nobody edited it since"
 * (requirements 38–39). When the chain is broken the first divergent event is called out
 * in place rather than only in the badge, because "invalid" without a location is not
 * actionable.
 */
export function ActivityTab({ orgId, envelopeId }: { orgId: string; envelopeId: string }) {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await apiRequest<AuditResponse>(`${envelopeUrl(orgId, envelopeId)}/audit`);
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        setFailed(true);
        return;
      }
      setData(result.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, envelopeId]);

  if (loading) {
    return (
      <Card>
        <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--accent)' }}>
          <Spinner size={24} />
        </div>
      </Card>
    );
  }

  if (failed || !data) {
    return (
      <Card>
        <p style={{ margin: 0, fontSize: 'var(--fs-14)', color: 'var(--text-muted)' }}>
          The activity trail is not available for this document.
        </p>
      </Card>
    );
  }

  // Reverse chronological: the newest thing that happened is what a reader came for.
  const events = [...data.events].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );

  return (
    <Card padded={false}>
      <div style={{ padding: 'var(--sp-8) var(--sp-10)' }}>
        <Badge
          tone={data.chain.valid ? 'active' : 'inactive'}
          data-testid="envelope-chain-status"
        >
          {data.chain.valid ? 'Chain verified' : 'Chain verification failed'}
        </Badge>
      </div>

      <div data-testid="envelope-audit-list">
        {events.length === 0 && (
          <div
            style={{
              padding: 'var(--sp-12) var(--sp-10)',
              borderTop: '1px solid var(--divider)',
              fontSize: 'var(--fs-14)',
              color: 'var(--text-muted)',
            }}
          >
            Nothing has happened to this document yet.
          </div>
        )}

        {events.map((event) => {
          const broken = data.chain.firstInvalidEventId === event.id;
          const actor = event.actor?.name || event.actor?.email || '—';
          return (
            <div
              key={event.id}
              data-testid={`envelope-audit-row-${event.id}`}
              style={{
                display: 'flex',
                gap: 'var(--sp-6)',
                alignItems: 'baseline',
                flexWrap: 'wrap',
                padding: '12px var(--sp-10)',
                borderTop: '1px solid var(--divider)',
                fontSize: 'var(--fs-14)',
                background: broken ? 'var(--status-inactive-bg)' : undefined,
              }}
            >
              <span style={{ width: 200, color: 'var(--text-muted)' }}>
                {formatUtcTimestamp(event.occurredAt)}
              </span>
              <span
                style={{
                  width: 130,
                  fontFamily: 'var(--font-display)',
                  fontWeight: 600,
                  color: 'var(--text)',
                }}
              >
                {eventLabel(event.type)}
              </span>
              <span style={{ flex: 1, minWidth: 160, color: 'var(--text-sub)' }}>{actor}</span>
              <span style={{ width: 140, color: 'var(--text-muted)' }}>
                {event.ipAddress ?? ''}
              </span>
              {broken && (
                <span style={{ width: '100%', color: 'var(--status-inactive-ink)' }}>
                  The chain first diverges here.
                </span>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
