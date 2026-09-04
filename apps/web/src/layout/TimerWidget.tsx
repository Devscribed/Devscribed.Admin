'use client';

import { Tracker } from '@devscribed/ds';
import { TIME_TRACKING_MESSAGES, formatDurationHuman, formatElapsed, timerStoppedToast } from '@devscribed/validation';
import { useState } from 'react';
import { useRunningTimer } from './running-timer-context';
import { useToast } from '@/toast';

/**
 * The floating tracker, on whatever screen the caller is on.
 *
 * The bar's `MiniTracker` says *a timer is running*; this says **what** is running and stops
 * it. Splitting them that way is the system's own arrangement — a 144px pill in a bar has no
 * room for a project name, which is why spec 12's design truncated it to fifteen characters
 * and dropped it entirely on a narrow screen — and it is why `MiniTracker` carries a chevron:
 * the pill discloses this.
 *
 * Spec 12's `topbar-timer-project`, `topbar-timer-elapsed` and `topbar-timer-stop-btn` are the
 * three nodes here. They kept their names: they are still the top bar's tracker, reached from
 * the top bar, and a test id is a handle rather than a description of where a node sits.
 *
 * Stopping is the same call the Time Tracking page's own bar makes, through the same provider,
 * so the two cannot disagree about whether a timer is running.
 */
export function TimerWidget({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { timer, elapsedSeconds, stop } = useRunningTimer();
  const { showToast } = useToast();
  const [stopping, setStopping] = useState(false);

  // Nothing to disclose once the timer is gone, and nothing to disclose before the pill that
  // opens this is drawn — both are the same condition.
  if (!open || !timer) return null;

  async function handleStop(): Promise<void> {
    if (stopping) return;
    setStopping(true);
    const result = await stop();
    setStopping(false);
    onClose();
    if (result.ok && result.timeEntry) {
      showToast('toast-timer-stopped', timerStoppedToast(formatDurationHuman(result.timeEntry.durationMinutes)));
    } else {
      showToast('toast-timer-stopped', TIME_TRACKING_MESSAGES.genericError, 'error');
    }
  }

  // The literal "No project" is spec 12 §21's, for a timer started without one.
  const project = timer.projectName ?? 'No project';
  const detail = [timer.task, timer.description].filter(Boolean).join(' · ');

  return (
    <Tracker
      data-testid="topbar-timer-widget"
      project={project}
      projectTestId="topbar-timer-project"
      counter={formatElapsed(elapsedSeconds)}
      counterTestId="topbar-timer-elapsed"
      detail={detail}
      onStop={() => void handleStop()}
      stopping={stopping}
      stopTestId="topbar-timer-stop-btn"
      onClose={onClose}
    />
  );
}
