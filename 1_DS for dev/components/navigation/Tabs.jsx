import React from 'react';

/**
 * Bottom-underline tab strip — 3px violet underline on the active tab.
 *
 * A real `tablist`: the tabs were anchors to `#`, which a screen reader announces as
 * links that go nowhere, and this is a control that chooses which panel is shown rather
 * than a set of destinations. Roving focus, so the strip is one tab stop and the arrows
 * move within it — a strip where every tab is tabbable makes the keyboard slower the
 * more tabs there are.
 */
export function Tabs({ items = [], value, onChange, label, style }) {
  const strip = React.useRef(null);

  const values = items.map((item) => (typeof item === 'string' ? item : item.value));
  const active = values.indexOf(value);

  const focusTab = (index) => {
    const at = (index + values.length) % values.length;
    onChange && onChange(values[at]);
    const node = strip.current && strip.current.querySelector(`[data-tab="${values[at]}"]`);
    if (node) node.focus();
  };

  const onKeyDown = (event) => {
    const keys = {
      ArrowRight: () => focusTab(active + 1),
      ArrowLeft: () => focusTab(active - 1),
      Home: () => focusTab(0),
      End: () => focusTab(values.length - 1),
    };
    if (!keys[event.key] || active === -1) return;
    event.preventDefault();
    keys[event.key]();
  };

  return (
    <div
      ref={strip}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      style={{ display: 'flex', gap: 26, borderBottom: '1.5px solid var(--divider)', ...style }}
    >
      {items.map((item) => {
        const itemValue = typeof item === 'string' ? item : item.value;
        const itemLabel = typeof item === 'string' ? item : item.label;
        const selected = itemValue === value;
        return (
          <button
            key={itemValue}
            type="button"
            role="tab"
            data-tab={itemValue}
            data-testid={typeof item === 'string' ? undefined : item.testId}
            aria-selected={selected}
            aria-controls={typeof item === 'string' ? undefined : item.controls}
            // Only the selected tab holds the strip's single tab stop.
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange && onChange(itemValue)}
            style={{
              padding: '0 0 12px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <span
              style={{
                display: 'block',
                fontFamily: 'var(--font-display)',
                fontWeight: selected ? 600 : 500,
                fontSize: 'var(--fs-14)',
                letterSpacing: '.3px',
                color: selected ? 'var(--text)' : 'var(--text-muted)',
                transition: 'color .15s',
              }}
            >
              {itemLabel}
            </span>
            <div
              style={{
                marginTop: 12,
                marginBottom: -1.5,
                height: 3,
                borderRadius: 3,
                background: selected ? 'var(--accent)' : 'transparent',
              }}
            />
          </button>
        );
      })}
    </div>
  );
}
