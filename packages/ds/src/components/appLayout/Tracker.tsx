import React from 'react';
import { CloseIcon } from '../icons/Icon';

export interface TrackerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** What the running timer is against — a project name, or what stands in for one. */
  project?: React.ReactNode;
  /** Elapsed time, already formatted. The widget does not tick; whatever owns the clock does. */
  counter?: string;
  /** A second line under the head: the task, the description — what the timer is *for*. */
  detail?: React.ReactNode;
  /** Stops the timer. The circle is the control, and it is the widget's only action. */
  onStop?: () => void;
  /** The stop request is in flight: the circle is blocked and says so. */
  stopping?: boolean;
  onClose?: () => void;
  /** §89 — test ids for the three nodes the widget draws itself. */
  projectTestId?: string;
  counterTestId?: string;
  stopTestId?: string;
}

/**
 * Tracker — §89. The floating timer widget: fixed to the top-right of the viewport, a 380px
 * card lifted on `--shadow-tracker`, its head filled with `--color-tracker-blue` and carrying a
 * circular **STOP**, the project the timer is running against, and the elapsed clock.
 *
 * This is the widget the palette was drawn for. `--color-tracker-blue`, `--shadow-tracker` and
 * `--radius-circle`'s "tracker start/stop button" were all in the system before anything
 * rendered them, and the reason they sat unspent was that the branch they arrived on had no
 * timesheets. It does now.
 *
 * **It represents a timer that is running, and its one action is to stop it.** The bar's
 * `MiniTracker` is what opens it and is drawn only while a timer runs, so a start control here
 * would be one nothing could ever reach; the project is *stated* rather than chosen for the
 * same reason the counter is handed in — the shell that hosts this widget holds a timer, not a
 * catalogue of projects, and fetching one on every screen to fill a select would be a request
 * paid everywhere for a choice already offered on the screen that logs the time.
 *
 * Two accessibility facts the shape does not give for itself. The panel is a
 * `role="complementary"` with a name, because it floats over whatever screen the reader was on
 * and needs to be findable as its own region; and the clock is `aria-live="polite"`, since a
 * number that changes every second is the whole of what this says.
 */
export function Tracker({
  project, counter = '00:00:00', detail, onStop, stopping, onClose,
  /* §89 — the circle, the project line and the clock are all drawn here, so only this component
     can tag them. §16's `nameTestId` / `menuTestId` and §37's `removeTestId` are the same rule
     in the same shape: whoever renders a node owns its test id. */
  projectTestId, counterTestId, stopTestId,
  style, ...rest
}: TrackerProps) {
  const [closeHover, setCloseHover] = React.useState(false);
  return (
    <div
      {...rest}
      role="complementary"
      aria-label="Running timer"
      style={{
        /* @literal the widget's own placement and size: 100px down and 40px in from the
           top-right corner, 380px wide. None of the three is a scale step — they are where this
           one panel hangs, measured against the bar it drops out of. */
        position: 'fixed', top: 100, right: 40, width: 380, maxWidth: 'calc(100vw - var(--space-7))',
        zIndex: 900,
        background: 'var(--surface-card)', boxShadow: 'var(--shadow-tracker)',
        borderRadius: 'var(--radius-m)',
        fontFamily: 'var(--font-family-base)',
        ...style,
      }}
    >
      {onClose && (
        /* The close mark scales rather than filling on hover — `IconButton`'s rule (§10),
           inline here because this shell draws its own, exactly as `Modal` does. */
        <button
          type="button"
          onClick={onClose}
          aria-label="Close tracker"
          onMouseEnter={() => setCloseHover(true)}
          onMouseLeave={() => setCloseHover(false)}
          style={{
            /* @literal a 13px mark inset 10px from the panel's corner; the pair is one
               measurement, and the same one `Modal` and `ConfirmDialog` use. */
            position: 'absolute', top: 10, right: 10, zIndex: 1,
            display: 'flex', width: 13, height: 13, background: 'transparent', border: 0,
            color: 'var(--text-on-accent)',
            transform: closeHover ? 'scale(1.1)' : 'none', transition: 'transform var(--duration-hover)',
          }}
        >
          <CloseIcon />
        </button>
      )}

      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 'var(--space-6)', padding: 'var(--space-10)',
          background: 'var(--color-tracker-blue)', color: 'var(--text-on-accent)',
          borderTopLeftRadius: 'var(--radius-m)', borderTopRightRadius: 'var(--radius-m)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-6)', minWidth: 0 }}>
          <button
            type="button"
            onClick={onStop}
            disabled={stopping}
            aria-label="Stop timer"
            data-testid={stopTestId}
            style={{
              /* @literal the 62px circle is the widget's own: it is the one control on a panel
                 that has no others, and `--control-height` is the height of a control standing
                 in a row of them. */
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              width: 62, height: 62, border: 0, borderRadius: 'var(--radius-circle)',
              background: 'var(--surface-card)', color: 'var(--color-tracker-blue)',
              fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-medium)',
              fontFamily: 'var(--font-family-base)',
              cursor: stopping ? 'progress' : 'pointer', opacity: stopping ? 0.6 : 1,
            }}
          >
            STOP
          </button>
          <span
            data-testid={projectTestId}
            style={{
              minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              fontSize: 'var(--font-size-l)',
            }}
          >
            {project}
          </span>
        </div>
        <span
          data-testid={counterTestId}
          /* A number that changes every second is the whole of what this widget says, so it is
             announced. `polite`, not `assertive`: it is a readout, not an interruption. */
          aria-live="polite"
          style={{ flexShrink: 0, fontSize: 'var(--font-size-l)', fontVariantNumeric: 'tabular-nums' }}
        >
          {counter}
        </span>
      </div>

      {/* Drawn only when there is something to say. An empty second section under a filled head
          is a divider promising a row that is not there. */}
      {detail != null && detail !== '' && (
        <div
          style={{
            padding: 'var(--space-6) var(--space-10)',
            fontSize: 'var(--font-size-s)', color: 'var(--text-secondary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {detail}
        </div>
      )}
    </div>
  );
}
