import React from 'react';

/** A tab is a bare string, or an object carrying the parts prod never had to name. */
const valueOf = (tab) => (typeof tab === 'object' && tab !== null ? tab.value : tab);
const labelOf = (tab) => (typeof tab === 'object' && tab !== null ? tab.label : tab);

/**
 * PageTabs — underline tab row recreated from components/shared/PageTabs.
 *
 * §45 — blue's tabs were `<a href="#">`, which a screen reader announces as links that go
 * nowhere, and clicking one calls `preventDefault` and swaps a panel: they are a control that
 * chooses what is shown, not a set of destinations. Prod gets away with it because prod's tab
 * rows are three words on a members screen and nothing arrives at them by keyboard. They are
 * `role="tab"` buttons now, inside a `role="tablist"`, with `aria-selected`, `aria-controls`,
 * a single tab stop and arrow keys — the semantics the role promises the moment it is claimed,
 * which is §31's argument on `ToggleButton` and §21's on `Select`.
 *
 * The object form is §18's shape on `Table`: prod builds these from a `string[]` because
 * prod's tab labels *are* strings, and a strip whose items need a value distinct from their
 * label, a node for a label, a test id, or the id of the panel they control cannot say so.
 * Both forms still work and the paint is untouched — every value below is blue's own.
 *
 * There is deliberately **no `count` prop**. A count composes into the item's `label` node,
 * and a strip that grew one would then need a badge for it, and an icon.
 */
export function PageTabs({
  tabs = [],
  active,
  onChange,
  /** §45 — the tablist's accessible name. Blue draws the row and names nothing. */
  label,
  style,
  ...rest
}) {
  const values = tabs.map(valueOf);
  const [internal, setInternal] = React.useState(active ?? values[0]);
  React.useEffect(() => { setInternal(active ?? values[0]); }, [active, values.join('|')]);
  const current = active ?? internal;

  const select = (value) => {
    setInternal(value);
    if (onChange) onChange(value);
  };

  /* Arrow keys move between tabs and select as they go — the tab's own panel is already
     rendered, so selection following focus is what the pattern asks for and what stops a
     keyboard user having to press twice for what a pointer does once. */
  const onKeyDown = (event) => {
    const at = values.indexOf(current);
    let next = null;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = values[at - 1];
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = values[at + 1];
    else if (event.key === 'Home') next = values[0];
    else if (event.key === 'End') next = values[values.length - 1];
    if (next === null || next === undefined) return;
    event.preventDefault();
    select(next);
    const buttons = event.currentTarget.querySelectorAll('[role="tab"]');
    const move = buttons[values.indexOf(next)];
    if (move) move.focus();
  };

  return (
    <div
      {...rest}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      style={{ display: 'flex', flexWrap: 'wrap', ...style }}
    >
      {tabs.map((tab) => {
        const value = valueOf(tab);
        const isActive = value === current;
        return (
          <TabButton
            key={value}
            value={value}
            isActive={isActive}
            testId={tab && tab.testId}
            controls={tab && tab.controls}
            onSelect={() => select(value)}
          >
            {labelOf(tab)}
          </TabButton>
        );
      })}
    </div>
  );
}

function TabButton({ value, isActive, testId, controls, onSelect, children }) {
  const [focused, setFocused] = React.useState(false);
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      aria-controls={controls}
      /* One tab stop for the strip: Tab reaches the chosen tab, arrows change it. */
      tabIndex={isActive ? 0 : -1}
      data-testid={testId}
      onClick={onSelect}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        /* Prod's `<a>` carried no background, border or padding of its own; a button does, so
           those are zeroed and only prod's own three values are set. */
        background: 'none',
        border: 0,
        paddingLeft: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingTop: 4,
        marginRight: 20,
        cursor: 'pointer',
        /* §45 — the source declares no `:focus` state, which is survivable while nothing is
           expected to arrive by keyboard. A tablist is not. `--shadow-focus-input` is the ring
           every other blue control takes. */
        boxShadow: focused ? 'var(--shadow-focus-input)' : undefined,
        borderRadius: focused ? 'var(--radius-s)' : undefined,
      }}
    >
      <span
        style={{
          display: 'block',
          textTransform: 'uppercase',
          fontFamily: 'var(--font-family-base)',
          fontWeight: 'var(--font-weight-medium)',
          color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
          fontSize: 'var(--font-size-base)',
          lineHeight: '24px',
        }}
      >
        {children}
      </span>
      {isActive && (
        <div
          style={{
            marginTop: 12,
            backgroundColor: 'var(--color-blue)',
            height: 4,
            borderTopLeftRadius: 6,
            borderTopRightRadius: 6,
          }}
        />
      )}
    </button>
  );
}
