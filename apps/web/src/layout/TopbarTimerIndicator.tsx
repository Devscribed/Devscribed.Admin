'use client';

import { useRouter } from 'next/navigation';
import {
  TIME_TRACKING_MESSAGES,
  formatDurationHuman,
  formatElapsed,
  timerStoppedToast,
} from '@devscribed/validation';
import { useToast } from '@/toast';
import { StopIcon } from './icons';
import { useSession } from './session-context';
import { useRunningTimer } from './running-timer-context';

/**
 * The topbar running-timer chip (spec 12), living to the LEFT of the account button and
 * visible only while the caller has a running timer. It reads the shared
 * `RunningTimerProvider`, so its elapsed clock is the same source of truth as the TT-page
 * timer bar — starting/stopping in one place reflects in the other with no refetch.
 *
 * Rendered as an amber pill (the Meridian `--tracker` amber family): a pulsing dot, the
 * elapsed time in mono (ticking every second, with a minute-granularity `aria-live` node
 * for screen readers), the truncated project name behind a hairline, and a red stop
 * button. Clicking the time/project navigates to the Time Tracking page.
 */
export function TopbarTimerIndicator() {
  const router = useRouter();
  const session = useSession();
  const { showToast } = useToast();
  const { timer, elapsedSeconds, stop } = useRunningTimer();

  if (!timer) return null;

  const orgId = session.organization.id;
  const projectLabel = timer.projectName ?? 'No project';

  function goToPage(): void {
    router.push(`/org/${orgId}/time-tracking`);
  }

  async function handleStop(): Promise<void> {
    const result = await stop();
    if (result.ok && result.timeEntry) {
      showToast(
        'toast-timer-stopped',
        timerStoppedToast(formatDurationHuman(result.timeEntry.durationMinutes)),
      );
    } else if (!result.ok) {
      showToast('toast-timer-stopped', TIME_TRACKING_MESSAGES.genericError, 'error');
    }
  }

  return (
    <div
      data-testid="topbar-timer-indicator"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        height: 34,
        padding: '0 6px 0 12px',
        background: 'var(--tracker-bg)',
        border: '1px solid var(--tracker-border)',
        borderRadius: 'var(--radius-pill)',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: 'var(--tracker)',
          animation: 'tt-pulse 1.6s ease-in-out infinite',
          flexShrink: 0,
        }}
      />
      {/* Visible ticking clock (every second). */}
      <button
        type="button"
        data-testid="topbar-timer-elapsed"
        onClick={goToPage}
        style={{
          border: 'none',
          background: 'transparent',
          padding: 0,
          cursor: 'pointer',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--fs-14)',
          fontWeight: 600,
          color: 'var(--amber-700)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {formatElapsed(elapsedSeconds)}
      </button>
      {/* Minute-granularity announcement for screen readers (avoids per-second spam). */}
      <span
        aria-live="polite"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
        }}
      >
        {`${Math.floor(elapsedSeconds / 60)} minutes elapsed`}
      </span>
      <span aria-hidden style={{ width: 1, height: 16, background: 'var(--tracker-border)' }} />
      <button
        type="button"
        data-testid="topbar-timer-project"
        onClick={goToPage}
        title={projectLabel}
        style={{
          border: 'none',
          background: 'transparent',
          padding: 0,
          cursor: 'pointer',
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--fs-13)',
          fontWeight: 500,
          color: 'var(--amber-700)',
          maxWidth: 120,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {projectLabel}
      </button>
      <button
        type="button"
        data-testid="topbar-timer-stop-btn"
        aria-label="Stop timer"
        onClick={() => void handleStop()}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 24,
          height: 24,
          border: 'none',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--error-500)',
          color: '#fff',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        <StopIcon />
      </button>
    </div>
  );
}
