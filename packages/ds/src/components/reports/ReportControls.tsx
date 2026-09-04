import React from 'react';

export interface ReportControlsProps extends React.HTMLAttributes<HTMLFieldSetElement> {
  /** The group's name, announced and not drawn. Every report's controls are "Filters". */
  legend?: string;
  /** The left slot: which slice of the organization the report covers. */
  scope?: React.ReactNode;
  /** The filters themselves — ranges, pickers, selects — in the order the screen wants them. */
  children?: React.ReactNode;
  /** The right slot: the switches that change how the rows are *aggregated*, not which rows. */
  aggregations?: React.ReactNode;
  /** Inline refusals, drawn under the bar and outside it. */
  messages?: React.ReactNode;
}

/* A `<legend>` cannot be `display: none` and still be announced, so it is clipped instead —
   the one caption in the system that is read and never drawn.
   @literal the 1px box and the -1px pull are the clip idiom itself, not spacing: they exist to
   take the node out of the layout while leaving it in the accessibility tree. */
const clipped: React.CSSProperties = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
  overflow: 'hidden', clip: 'rect(0 0 0 0)', border: 0, whiteSpace: 'nowrap',
};

/**
 * ReportControls — the row of controls every report screen carries above its table.
 *
 * §81 — **it is a `<fieldset>`, and that is the point of the component.** A filter bar is a
 * group of controls that only mean anything together: eight bare inputs in a row are announced
 * one at a time with nothing saying they belong to each other, and a reader arriving at
 * "Members, combobox" has no way to know it filters the table below rather than editing
 * something. The fieldset and its clipped legend are the only thing that says so, and they are
 * exactly the part a screen forgets when it hand-builds the row — so the component owns them
 * and a screen cannot ship the row without them.
 *
 * Three slots, because a report's controls are three different kinds of question and they read
 * in that order: **scope** (whose rows), the **filters** (which rows), and the
 * **aggregations** (how the rows are gathered). The aggregations are pushed to the end of the
 * line rather than sitting in the flow, so a report with one filter and a report with five
 * still put the same switches in the same place.
 *
 * Layout only. It draws no control of its own and holds no state; what goes in the slots is
 * the screen's, and every one of them is a system component in its own right.
 */
export function ReportControls({
  legend = 'Filters', scope, children, aggregations, messages, style, ...rest
}: ReportControlsProps) {
  return (
    <fieldset {...rest} style={{ border: 0, margin: 0, padding: 0, minWidth: 0, ...style }}>
      <legend style={clipped}>{legend}</legend>
      <div
        style={{
          /* `flex-end`, so a control carrying a caption and one that does not still sit on the
             same line — the captions differ in height and the controls under them do not. */
          display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end',
          gap: 'var(--space-5)', marginBottom: 'var(--space-7)',
        }}
      >
        {scope}
        {children}
        {aggregations && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            {aggregations}
          </div>
        )}
      </div>
      {messages}
    </fieldset>
  );
}
