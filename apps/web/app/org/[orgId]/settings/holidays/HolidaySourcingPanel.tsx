'use client';

import { Button, Preloader } from '@devscribed/ds';
import { HOLIDAY_SOURCING_MESSAGES } from '@devscribed/validation';

/**
 * Time off spec 02 §Screens — sourcing: the Refresh button and the line that says what a
 * sync is doing.
 *
 * Refresh is REQ-02-008's explicit instruction to re-ask the provider for the year on
 * screen; it is not disabled for validation, the only disabling here being the in-flight
 * guard on a request already sent.
 *
 * PATCH-018 — one horizontal strip, sitting on the year tabs' own line. It was a titled
 * column below them, which left a band of empty screen between the tabs and the summary
 * wide enough to read as a mistake. The `Sourcing` heading went with the column: a heading
 * over a single button names a section that no longer exists.
 *
 * PATCH-012 — the `Include organization country` checkbox stood beside it and is gone with
 * the organization country itself. The set this screen sources is the countries its people
 * are in.
 *
 * The status line carries `syncing` for the whole of a sync **and the re-read that
 * follows it**, so the year tabs and the list stay interactive while it is up.
 */

/**
 * PATCH-016 — the status slot's own width, fixed.
 *
 * The strip is at the end of a row with `margin-left: auto`, so a status line that sizes
 * itself grows the strip leftwards and carries the Refresh button sideways and back. Wide
 * enough for the longer of the two lines the slot can hold — `syncFailedSome`, at 35
 * characters — so neither of them can resize it.
 */
const STATUS_WIDTH = 300;

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
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 'var(--space-5)',
      }}
    >
      {/* PATCH-009 — one slot, reserved whether or not there is anything in it. Both lines
          used to render conditionally, so starting a sync resized the block and moved what
          stood beside it. The slot holds the box; only its contents come and go, and
          `holiday-sourcing-status` is still present exactly while a sync is in flight.

          PATCH-016 — a fixed width and a fixed height rather than minimums, and the line
          does not wrap: a minimum holds only until the content exceeds it, which is the
          moment the box was supposed to survive. `--line-height-m` is a length, and the
          token whose stated purpose is exactly this — a box whose height must not move
          when the text inside it does. `--line-height-base` is a ratio and would not
          resolve here at all. */}
      <div
        style={{
          width: STATUS_WIDTH,
          height: 'var(--line-height-m)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          fontSize: 'var(--font-size-s)',
          color: 'var(--text-secondary)',
          whiteSpace: 'nowrap',
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

      <Button onClick={onRefresh} disabled={syncing} data-testid="holiday-sourcing-refresh-btn">
        {`Refresh ${year}`}
      </Button>
    </div>
  );
}
