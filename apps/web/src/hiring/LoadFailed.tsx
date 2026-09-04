'use client';

import type { ReactNode } from 'react';
import { Button, EmptyState } from '@devscribed/ds';

/**
 * A list, a card or a board that could not be read.
 *
 * The toast announces the failure and leaves; this is what stays. A screen whose only
 * report of a failed load was a message that withdrew itself after a few seconds would be a
 * blank page with nothing saying why, so the failure is drawn where the content would have
 * been — on the page's own ground, in the shape the candidate database gives an empty list,
 * with the way back inside the state rather than under it (decisions §65).
 *
 * One composition for every hiring screen that needs it — the two lists, the vacancy screen, the
 * card and the board — so the retry sits at the same distance under the same sentence on each.
 */
export function LoadFailed({
  message,
  retryLabel,
  onRetry,
  retryTestId,
  ...rest
}: {
  message: ReactNode;
  retryLabel: string;
  onRetry: () => void;
  /** The retry's own id; the state's id arrives through `data-testid` like any other attribute. */
  retryTestId: string;
  'data-testid'?: string;
}) {
  return (
    <EmptyState {...rest}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'var(--space-7)',
        }}
      >
        <div>{message}</div>
        {/* 160px is what stops a one-word button reading as an afterthought beside a 20px
            sentence — the same floor the candidate database gives `Clear filters`. */}
        <div style={{ minWidth: 160 }}>
          <Button onClick={onRetry} data-testid={retryTestId}>
            {retryLabel}
          </Button>
        </div>
      </div>
    </EmptyState>
  );
}
