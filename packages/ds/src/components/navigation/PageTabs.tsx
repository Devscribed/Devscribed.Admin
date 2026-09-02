import React from 'react';
import { isKeyboardFocus } from '../core/focus-visible';

/**
 * §45 — the object form, beside a plain `string[]`. `Table` (§18) takes column objects for the
 * same reason and in the same shape: a bare list of labels is what a demo passes, and a real
 * strip needs a value distinct from its label, a test id, and the panel each tab controls.
 *
 * There is no `count` — a count composes into `label`, and a strip that grew one would then
 * need a badge for it, and an icon.
 */
export interface TabItem {
  /** What `onChange` hands back and what `active` is compared against. */
  value: string;
  /** Drawn inside the uppercase span, so a node composes freely. Defaults to nothing. */
  label?: React.ReactNode;
  /** §45 — the tab is drawn by the component, so a caller has no other way to name it. */
  testId?: string;
  /** `id` of the panel this tab shows, wired as `aria-controls`. */
  controls?: string;
}

export interface PageTabsProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  tabs?: Array<string | TabItem>;
  /** The chosen tab's value. Omit to let the component hold its own. */
  active?: string;
  onChange?: (value: string) => void;
  /** §45 — accessible name for the tablist. A strip of tabs is a control, and named. */
  label?: string;
}

interface TabButtonProps {
  value: string;
  isActive: boolean;
  testId?: string;
  controls?: string;
  onSelect: () => void;
  children?: React.ReactNode;
}

/** A tab is a bare string, or an object carrying the parts a string cannot say. */
const valueOf = (tab: string | TabItem): string => (typeof tab === 'object' && tab !== null ? tab.value : tab);
const labelOf = (tab: string | TabItem): React.ReactNode => (typeof tab === 'object' && tab !== null ? tab.label : tab);

/**
 * PageTabs — the underline tab row.
 *
 * §45 — **tabs are buttons, not links.** A tab chooses what is shown; it is not a destination,
 * and an `<a href="#">` that calls `preventDefault` and swaps a panel is announced as a link
 * that goes nowhere. These are `role="tab"` buttons inside a `role="tablist"`, with
 * `aria-selected`, `aria-controls`, a single tab stop and arrow keys — the semantics the role
 * promises the moment it is claimed, which is §31's argument on `ToggleButton` and §21's on
 * `Select`.
 *
 * The object form is §18's shape on `Table`: a bare `string[]` cannot give a tab a value
 * distinct from its label, a node for a label, a test id, or the id of the panel it controls.
 * Both forms work.
 *
 * There is deliberately **no `count` prop**. A count composes into the item's `label` node,
 * and a strip that grew one would then need a badge for it, and an icon.
 */
export function PageTabs({
  tabs = [],
  active,
  onChange,
  /** §45 — the tablist's accessible name. A strip of tabs is a control, and named. */
  label,
  style,
  ...rest
}: PageTabsProps) {
  const values = tabs.map(valueOf);
  const [internal, setInternal] = React.useState<string | undefined>(active ?? values[0]);
  React.useEffect(() => { setInternal(active ?? values[0]); }, [active, values.join('|')]);
  const current = active ?? internal;

  const select = (value: string) => {
    setInternal(value);
    if (onChange) onChange(value);
  };

  /* Arrow keys move between tabs and select as they go — the tab's own panel is already
     rendered, so selection following focus is what the pattern asks for and what stops a
     keyboard user having to press twice for what a pointer does once. */
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const at = values.indexOf(current as string);
    let next: string | null | undefined = null;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = values[at - 1];
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = values[at + 1];
    else if (event.key === 'Home') next = values[0];
    else if (event.key === 'End') next = values[values.length - 1];
    if (next === null || next === undefined) return;
    event.preventDefault();
    select(next);
    const buttons = event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]');
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
            testId={tab && (tab as TabItem).testId}
            controls={tab && (tab as TabItem).controls}
            onSelect={() => select(value)}
          >
            {labelOf(tab)}
          </TabButton>
        );
      })}
    </div>
  );
}

function TabButton({ value, isActive, testId, controls, onSelect, children }: TabButtonProps) {
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
      /* §68 — a keyboard's ring, not a pointer's. A click focuses the button too, and the
         glow it left sat on the tab until something else was clicked. */
      onFocus={(event) => setFocused(isKeyboardFocus(event.currentTarget))}
      onBlur={() => setFocused(false)}
      style={{
        /* A `<button>` brings a background, a border and padding of its own; the tab has none
           of those, so they are zeroed and only the row's three real values are set. */
        background: 'none',
        border: 0,
        paddingLeft: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingTop: 'var(--space-1)',
        marginRight: 'var(--space-7)',
        cursor: 'pointer',
        /* §58 — a column, so the label sits at the top of the box and the bar under it.
           A `<button>` centres its content, and a chosen tab is 16px taller than an unchosen
           one, so centring pushed every unchosen label 8px down and moved the whole row when
           the choice changed. Both halves are fixed here: the column stops the centring, and
           the bar below is always rendered. */
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        /* §45 — a tablist is walked by keyboard, so it needs a visible focus. It takes
           `--shadow-focus-input`, the ring every control in the system uses. */
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
          lineHeight: 'var(--line-height-m)',
        }}
      >
        {children}
      </span>
      {/* §58 — drawn on every tab and only *painted* on the chosen one. Rendering it
          conditionally is what made the strip 16px taller the moment a tab was picked, so
          the labels in it moved; a bar that is always there and sometimes transparent
          costs one element and holds the row still. `aria-hidden` because `aria-selected`
          on the button already says which tab this is. */}
      <div
        aria-hidden
        style={{
          marginTop: 'var(--space-5)',
          backgroundColor: isActive ? 'var(--color-blue)' : 'transparent',
          height: 4,
          borderTopLeftRadius: 'var(--radius-m)',
          borderTopRightRadius: 'var(--radius-m)',
        }}
      />
    </button>
  );
}
