'use client';

import { useEffect, useState } from 'react';
import { SIGNING_PROVIDER_MESSAGES } from '@devscribed/validation';
import { Button, Card } from '@/ds';

/**
 * The provider's widget, hosted on **our** origin.
 *
 * That is the whole point of the arrangement (requirement 12): the counterparty never
 * leaves our page, the invitation came from our address, and the link cannot outlive our
 * access control. SignWell owns the rectangle and nothing else.
 *
 * It is a plain `<iframe>` and **not** the vendor's `SignWellEmbed` SDK. Loading a
 * third-party script onto the one page in the product that renders author-controlled HTML
 * without a session is not something this spec authorises, and it would mean widening
 * `script-src` on the `/sign/*` policy; the frame only needs `frame-src`. The consequence
 * is that we listen for the widget's `postMessage` ourselves — see below.
 */
export interface EmbeddedSigningProps {
  /** Fetched per request, never persisted and never cached (requirement 6). */
  url: string | null;
  /** Set when the provider could not be reached. The token was **not** consumed. */
  error: boolean;
  loading: boolean;
  onRetry: () => void;
  /** Fired when the widget claims the signer finished. A hint, never a fact. */
  onCompleted: () => void;
}

/**
 * The height the frame reserves before it arrives, so the page does not reflow when the
 * iframe loads. The loading block, the frame and the error card all occupy it.
 */
/**
 * The widget scrolls a whole page of a contract inside itself, so height is the difference
 * between reading a paragraph at a time and seeing the document. `clamp` rather than a flat
 * `vh`: on a laptop 78vh is most of the screen and right, on a tall display it would leave
 * the signer scrolling the page to reach the frame's own scrollbar, and on a short one a
 * floor keeps the widget usable at all. The frame is never taller than the viewport.
 */
const FRAME_HEIGHT = 'clamp(420px, 78vh, 900px)';

/**
 * How long a frame may take to say it arrived before the signer is told it will not.
 * Generous, because the cost of being early is an error card in front of a widget that
 * was merely slow, and the cost of being late is only a longer wait before the truth.
 */
const FRAME_LOAD_TIMEOUT_MS = 15_000;

export function EmbeddedSigning({
  url,
  error,
  loading,
  onRetry,
  onCompleted,
}: EmbeddedSigningProps) {
  const [origin, setOrigin] = useState<string | null>(null);
  /** Set by the frame's own `load`, so the skeleton yields to a widget that is really there. */
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!url) {
      setOrigin(null);
      return;
    }
    try {
      setOrigin(new URL(url).origin);
    } catch {
      setOrigin(null);
    }
    setReady(false);
  }, [url]);

  /**
   * A frame the browser refuses fires **no** `error` event — `X-Frame-Options` and a
   * `frame-ancestors` refusal are handled before the element ever hears about them — so
   * `onLoad` alone cannot tell "still arriving" from "will never arrive". Without a clock
   * the signer keeps the loading skeleton forever, which is what BUG-003 reported.
   *
   * The timer is the whole guard: it starts when a URL arrives, and the frame's own `load`
   * clears it. `refused` is what turns the skeleton into the error card the component
   * already knows how to draw.
   */
  const [refused, setRefused] = useState(false);
  useEffect(() => {
    if (!url) {
      setRefused(false);
      return;
    }
    setRefused(false);
    if (ready) return;
    const timer = setTimeout(() => setRefused(true), FRAME_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [url, ready]);

  /**
   * Edge case 20 — **`event.origin` is checked before anything is read.** A message from
   * an unexpected origin is ignored outright rather than parsed and then judged, because
   * parsing is already reading.
   *
   * Edge case 19 — and what arrives is a *hint from a frame*, never a fact. It is never
   * written to the database and never sent anywhere: at most it swaps our own
   * confirmation in. The envelope converges on the next read or sweep regardless, so a
   * widget that sends no message at all costs the signer a moment of reassurance and
   * costs the record nothing.
   */
  useEffect(() => {
    if (!origin) return;

    const listener = (event: MessageEvent) => {
      if (event.origin !== origin) return;
      const data = event.data as { action?: string; type?: string } | string | null;
      const action =
        typeof data === 'string' ? data : (data?.action ?? data?.type ?? '');
      if (typeof action === 'string' && action.toLowerCase().includes('complet')) {
        onCompleted();
      }
    };

    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [origin, onCompleted]);

  if (error || refused) {
    return (
      <Card>
        <div
          data-testid="sign-embedded-error"
          style={{
            minHeight: FRAME_HEIGHT,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: 'var(--sp-6)',
          }}
        >
          <p
            style={{
              margin: 0,
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: 'var(--fs-21)',
              color: 'var(--text)',
            }}
          >
            {SIGNING_PROVIDER_MESSAGES.signing.providerUnavailable}
          </p>
          <div>
            <Button variant="primary" data-testid="sign-embedded-retry" onClick={onRetry}>
              Retry
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card padded={!ready}>
      {/* Both are in the DOM; exactly one is visible. The skeleton holds the frame's
          reserved height until the widget has actually arrived, so the page does not
          reflow when it does — which is what the spec's "Embedded loading" state asks
          for, rather than a spinner that disappears before the frame is drawable. */}
      {!refused && (!ready || loading || !url) && placeholder()}
      {url && (
        <iframe
          data-testid="sign-embedded-frame"
          src={url}
          title="Signing"
          onLoad={() => setReady(true)}
          style={{
            width: '100%',
            height: FRAME_HEIGHT,
            border: 0,
            display: ready && !loading ? 'block' : 'none',
          }}
          allow="camera; microphone; clipboard-write"
        />
      )}
    </Card>
  );
}

/**
 * The DS ships no Skeleton primitive — a carried gap, recorded in the implementing run's
 * handoff (`dsGaps`), because no spec in the documents area carries a DS gaps
 * table. Static token-coloured blocks, the same shape the members screen uses, rather
 * than a per-screen shimmer nobody specified.
 */
function placeholder() {
  return (
    <div
      data-testid="sign-embedded-loading"
      style={{
        minHeight: FRAME_HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--sp-6)',
        padding: 'var(--sp-8)',
      }}
    >
      <span style={block('40%', 14)} />
      <span style={block('100%', '100%')} />
      <p style={{ margin: 0, fontSize: 'var(--fs-15)', color: 'var(--text-sub)' }}>
        {SIGNING_PROVIDER_MESSAGES.signing.loading}
      </p>
    </div>
  );
}

function block(width: string | number, height: string | number) {
  return {
    display: 'block',
    width,
    height,
    flex: height === '100%' ? 1 : undefined,
    borderRadius: 'var(--radius-md)',
    background: 'var(--bg-field)',
  } as const;
}
