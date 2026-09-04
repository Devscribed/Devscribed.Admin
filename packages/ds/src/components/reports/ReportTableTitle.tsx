import React from 'react';
import { Button } from '../core/Button';
import { PageTitle } from '../core/PageTitle';
import { CloudDownloadOutlineIcon } from '../icons/Icon';

export interface ReportTableTitleProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  /** The report's name. A node, so a screen can tag part of it. */
  title?: React.ReactNode;
  /** §80 — the heading is drawn here, so only this component can tag it. */
  titleTestId?: string;
  /** The line beside the title: a zone, a range, a currency. Never a second heading. */
  caption?: React.ReactNode;
  captionTestId?: string;
  /** Omit to draw no export control at all — a caller who may not export passes nothing. */
  onExport?: () => void;
  exportLabel?: string;
  /** Swapped in while `exporting`, because a render can take seconds and the label is the
   *  only place that says so. */
  exportBusyLabel?: string;
  exporting?: boolean;
  exportTestId?: string;
  /** Actions before the export control — a scope switch, a saved-view menu. */
  children?: React.ReactNode;
}

/**
 * ReportTableTitle — the header row every report screen opens with: the report's name, a
 * caption beside it, and the export control pushed to the end of the line.
 *
 * §80 — **the caption sits beside the title, not under it.** A report's caption is the range
 * and the currency the figures below are in — a qualifier on the name, not a second line of
 * page copy — and setting it under the heading builds a two-line block that reads as a page
 * intro. `PageTitle` steps its own size with the viewport (§17), so the caption follows the
 * heading's baseline rather than a fixed offset from the top of the screen.
 *
 * The export control is a `Button`, not a text link, because it is the only action on the row
 * and it has three states the row has to show: idle, in flight, and refused. `preloader` and
 * the swapped label carry the second; a caller who cannot export passes no `onExport` and the
 * button is not drawn — rule 3's "shown, blocked, and says why" is about an action the caller
 * *could* take, and one they have no capability for is not on this screen at all.
 */
export function ReportTableTitle({
  title, titleTestId, caption, captionTestId,
  onExport, exportLabel = 'Export', exportBusyLabel, exporting, exportTestId,
  children, style, ...rest
}: ReportTableTitleProps) {
  return (
    <div
      {...rest}
      style={{
        display: 'flex', alignItems: 'center', flexWrap: 'wrap',
        gap: 'var(--space-5)', marginBottom: 'var(--space-7)',
        ...style,
      }}
    >
      <PageTitle data-testid={titleTestId}>{title}</PageTitle>
      {caption != null && caption !== '' && (
        <div
          data-testid={captionTestId}
          style={{
            fontFamily: 'var(--font-family-base)', fontSize: 'var(--font-size-xs)',
            lineHeight: 'var(--line-height-xs)', color: 'var(--text-secondary)',
          }}
        >
          {caption}
        </div>
      )}
      {(children || onExport) && (
        /* `margin-left: auto` rather than `space-between`: the title and its caption are one
           group whose gap must stay 12px however wide the row gets. */
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--space-5)' }}>
          {children}
          {onExport && (
            <Button
              variant="primary"
              icon={<CloudDownloadOutlineIcon width="20" height="20" />}
              preloader={exporting}
              disabled={exporting}
              onClick={onExport}
              data-testid={exportTestId}
            >
              {exporting && exportBusyLabel ? exportBusyLabel : exportLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
