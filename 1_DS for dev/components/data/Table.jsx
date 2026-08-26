import React from 'react';

export function Table({ columns = [], rows = [], rowHref, rowTestId, onRowClick, busy, hideHeader, style }) {
  return (
    // `busy` dims the body and announces itself rather than replacing the table with a
    // spinner: a filterable list that collapsed on every refilter would reflow under the
    // reader, and the result count is the feedback that matters.
    <div aria-busy={busy || undefined} style={{
      background: 'var(--bg-panel)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-2xl)', overflow: 'hidden', ...style,
    }}>
      {/*
        A short list whose columns are self-evident carries its own header badly: three
        rows under an uppercase rule read as a report rather than as a list. `hideHeader`
        drops the rule and keeps the column widths, which is what the two My interviews
        groups need — the grouping label above them already says what they are.
      */}
      {!hideHeader && (
      <div style={{
        display: 'flex', height: 52, padding: '0 18px',
        background: 'var(--bg-header)',
        fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 'var(--fs-11)',
        letterSpacing: 1.2, textTransform: 'uppercase',
        color: 'var(--text-muted)',
      }}>
        {columns.map((c, i) => (
          <div key={i} style={{ flex: c.flex || 1, display: 'flex', alignItems: 'center', justifyContent: c.align || 'flex-start' }}>{c.label}</div>
        ))}
      </div>
      )}
      {rows.map((r, ri) => {
        // A linked row is a real anchor, so middle-click and copy-address work; the
        // caller intercepts onClick to keep navigation client-side.
        const href = typeof rowHref === 'function' ? rowHref(r) : rowHref;
        const Row = href ? 'a' : 'div';
        return (
        <Row key={r.id ?? ri}
          href={href || undefined}
          data-testid={typeof rowTestId === 'function' ? rowTestId(r) : rowTestId}
          onClick={onRowClick ? (e) => onRowClick(r, e) : undefined}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover-bg-tint)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          style={{
            display: 'flex', minHeight: 62, padding: '0 18px', alignItems: 'center',
            borderTop: hideHeader && ri === 0 ? 'none' : '1px solid var(--divider)',
            fontFamily: 'var(--font-text)', fontSize: 'var(--fs-15)', color: 'var(--text)',
            textDecoration: 'none',
            cursor: href || onRowClick ? 'pointer' : 'default',
            opacity: busy ? 0.55 : r.dim ? 0.65 : 1,
            transition: 'background .12s, opacity .12s',
          }}>
          {columns.map((c, ci) => (
            <div key={ci} style={{
              flex: c.flex || 1, minWidth: 0, textAlign: c.align === 'flex-end' ? 'right' : (c.align === 'center' ? 'center' : 'left'),
              display: 'flex', justifyContent: c.align || 'flex-start', alignItems: 'center',
              fontFamily: c.mono ? 'var(--font-display)' : 'var(--font-text)',
              fontWeight: c.mono ? 600 : 400,
            }}>{typeof c.render === 'function' ? c.render(r) : r[c.key]}</div>
          ))}
        </Row>
        );
      })}
    </div>
  );
}
