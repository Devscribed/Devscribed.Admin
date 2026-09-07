'use client';

import type { RequestMessageData } from '../types';

/** '2 Sep, 14:05' in the reader's own locale zone — the thread is a conversation log. */
function formatMoment(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/**
 * The conversation. What people said — never what happened to the request, which is the
 * history's job (requirement 21). Message bodies are plain text on write and rendered as
 * text here, so there is nothing to sanitize and nothing to sandbox.
 */
export function RequestThread({ messages }: { messages: RequestMessageData[] }) {
  return (
    <div
      data-testid="request-detail-thread"
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
    >
      {messages.length === 0 ? (
        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>
          No messages yet.
        </div>
      ) : (
        messages.map((message) => (
          <div
            key={message.id}
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}
          >
            <div
              style={{
                fontFamily: 'var(--font-family-base)',
                fontSize: 'var(--font-size-xs)',
                color: 'var(--text-secondary)',
              }}
            >
              {message.author.displayName ?? 'Former member'} &middot;{' '}
              {formatMoment(message.createdAt)}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-family-base)',
                fontSize: 'var(--font-size-base)',
                color: 'var(--text-primary)',
                whiteSpace: 'pre-wrap',
              }}
            >
              {message.body}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
