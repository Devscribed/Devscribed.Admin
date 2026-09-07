'use client';

import { Button, Preloader } from '@devscribed/ds';
import { HOLIDAY_SOURCING_MESSAGES } from '@devscribed/validation';

/**
 * Time off spec 02 §Screens — the sourcing panel, at the end of the control row.
 *
 * One control and one status line. Refresh is REQ-02-008's explicit instruction to re-ask
 * the provider for the year on screen; it is not disabled for validation, the only
 * disabling here being the in-flight guard on a request already sent.
 *
 * PATCH-012 — the `Include organization country` checkbox stood beside it and is gone with
 * the organization country itself. The set this screen sources is the countries its people
 * are in.
 *
 * The status line carries `syncing` for the whole of a sync **and the re-read that
 * follows it**, so the year tabs and the list stay interactive while it is up and the
 * summary's own wait ends at the same moment this does.
 */
export function HolidaySourcingPanel({
  year,
  syncing,
  failedSome,
  onRefresh,
}: {
  year: number;
  syncing: boolean;
  /** A sync answered `200` and left at least one country unsourced (REQ-02-009). */
  failedSome: boolean;
  onRefresh: () => void;
}) {
  return (
    <div
      data-testid="holiday-sourcing-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 'var(--space-3)',
        minWidth: 220,
      }}
    >
      <div
        style={{
          fontSize: 'var(--font-size-s)',
          fontWeight: 'var(--font-weight-medium)',
          color: 'var(--text-primary)',
        }}
      >
        Sourcing
      </div>

      <Button onClick={onRefresh} disabled={syncing} data-testid="holiday-sourcing-refresh-btn">
        {`Refresh ${year}`}
      </Button>

      {/* PATCH-009 — one slot, reserved whether or not there is anything in it. Both lines
          used to render conditionally, so starting a sync grew the panel by a line and the
          row above — which aligns its children on their bottom edges — moved the picker and
          the Save button down and back up again. The slot holds the height; only its
          contents come and go, and `holiday-sourcing-status` is still present exactly while
          a sync is in flight. */}
      <div
        style={{
          /* `--line-height-m` is a length, and the token whose stated purpose is exactly
             this: a box whose height must not move when the text inside it does. It clears
             both the 14px line and the inline preloader's row. `--line-height-base` is a
             ratio and would not resolve here at all. */
          minHeight: 'var(--line-height-m)',
          fontSize: 'var(--font-size-s)',
          color: 'var(--text-secondary)',
        }}
      >
        {syncing ? (
          <div
            data-testid="holiday-sourcing-status"
            role="status"
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}
          >
            {/* The in-row size the system names — 8/5 — not the 12/7 that stands in for a
                whole screen. This waits beside a line of text. */}
            <Preloader size={8} margin={5} />
            <span>{HOLIDAY_SOURCING_MESSAGES.syncing}</span>
          </div>
        ) : failedSome ? (
          /* The sync came back and some country is still unsourced. The banner above the
             summary names which ones; this says that the run itself was partial. */
          <span>{HOLIDAY_SOURCING_MESSAGES.syncFailedSome}</span>
        ) : null}
      </div>
    </div>
  );
}
