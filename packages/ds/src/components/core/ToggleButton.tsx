import React from 'react';
import { isKeyboardFocus } from './focus-visible';

export interface ToggleButtonProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  /** Rendered with the global `.input-label` treatment above the control. */
  label?: string;
  value1?: string;
  value2?: string;
  /** Whichever of `value1` / `value2` is currently selected. */
  selectedValue?: string;
  onValue1Click?: () => void;
  onValue2Click?: () => void;
  /** §31 — `data-testid` per segment. The component draws both, so only it can tag them. */
  value1TestId?: string;
  value2TestId?: string;
  /** §31 — style for the root, which carries the 20px of clearance below and the 160px cap. */
  style?: React.CSSProperties;
}

/**
 * ToggleButton — a two-value segmented pill. The track is a 32px `--color-gray-light` capsule at
 * `--radius-pill`; the chosen segment is a white 36px pill lifted out of it by 2px, carrying
 * `--shadow-toggle-active` and one step up in size and weight. The label above takes the
 * system's field-label treatment.
 *
 * §31 — **it is one control, not two buttons.** Two buttons that swap a boolean between them
 * are a single choice with two answers, and a reader met with "24h, button" then "12h, button"
 * is told there are two actions. So it is a `role="radiogroup"` of two `role="radio"` segments,
 * with one tab stop and arrow keys that move and select — the semantics the shape already
 * implies. `data-testid` reaches each segment, because the paint cannot be the only thing
 * saying which one is chosen.
 *
 * Give it a name — `label` if it should be drawn, `aria-label` if it should only be announced.
 *
 * The focus ring is the other half. A group that can be reached and changed by keyboard has to
 * show where the keystrokes land; it takes `--shadow-focus-input`, the ring every control in
 * the system uses.
 */
export function ToggleButton({
  label, value1, value2, selectedValue, onValue1Click, onValue2Click,
  /* §31 — a name for the group as a whole. `label` is drawn; this one is only announced, and is
     what a control sitting in a row of others (a zone select beside a format toggle) needs when
     drawing a caption over it would be noise. */
  'aria-label': ariaLabel,
  value1TestId, value2TestId,
  style, ...rest
}: ToggleButtonProps) {
  const seg: React.CSSProperties = { flex: '1 1 0', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--color-gray-light)', borderRadius: 'var(--radius-pill)', fontSize: 12, color: 'var(--text-primary)', fontFamily: 'var(--font-family-base)', cursor: 'pointer', border: 0 };
  const active: React.CSSProperties = { ...seg, height: 36, fontSize: 13, fontWeight: 'var(--font-weight-medium)', lineHeight: 1, backgroundColor: '#fff', boxShadow: 'var(--shadow-toggle-active)', marginTop: -2, outline: 0 };
  const [focused, setFocused] = React.useState<string | null | undefined>(null);
  const generatedId = React.useId();
  const labelId = label ? `${generatedId}-label` : undefined;

  /* Arrow keys move between the segments and select as they go, which is the radio-group
     behaviour a reader is promised the moment the role is claimed. */
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const back = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    if (!back && !forward) return;
    event.preventDefault();
    const target = selectedValue === value1 ? value2 : value1;
    const move = target === value1 ? onValue1Click : onValue2Click;
    if (move) move();
    const buttons = event.currentTarget.querySelectorAll('button');
    const next = buttons[target === value1 ? 0 : 1];
    if (next) next.focus();
  };

  const segment = (value: string | undefined, onClick: (() => void) | undefined, testId: string | undefined) => {
    const on = selectedValue === value;
    const ring = focused === value ? 'var(--shadow-focus-input)' : null;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={on}
        /* One tab stop for the group: Tab reaches the chosen answer, arrows change it. */
        tabIndex={on ? 0 : -1}
        value={value}
        onClick={onClick}
        data-testid={testId}
        /* §68 — a keyboard's ring, not a pointer's. */
        onFocus={(event) => setFocused(isKeyboardFocus(event.currentTarget) ? value : null)}
        onBlur={() => setFocused((current) => (current === value ? null : current))}
        style={{
          ...(on ? active : seg),
          /* Held in state rather than written onto the node, so a segment that becomes the
             chosen one while focused keeps both its own shadow and the ring. */
          ...(ring ? { boxShadow: on ? `${active.boxShadow}, ${ring}` : ring } : null),
        }}
      >
        {value}
      </button>
    );
  };

  return (
    /* §49 — `width: '100%'` beside the 160px cap, and the width is why. A bare `max-width`
       collapses the moment a caller puts this in a flex row: a flex item sizes to content and
       both segments are `flex-basis: 0`, so the control shrinks to the width of "24h12h" with
       the chosen segment painting over its neighbour. Filling the line first and capping second
       costs nothing in a stacked form — the cap still decides the width there. */
    <div {...rest} style={{ position: 'relative', marginBottom: 20, width: '100%', maxWidth: 160, ...style }}>
      {label && (
        /* The system's field-label treatment, inline because this control draws its own. */
        <label id={labelId} style={{ display: 'inline-block', padding: '10px 0 0 10px', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-xs)', lineHeight: '21px', color: 'var(--text-secondary)', marginBottom: 'var(--space-1)', whiteSpace: 'nowrap', fontFamily: 'var(--font-family-base)' }}>{label}</label>
      )}
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-label={labelId ? undefined : ariaLabel}
        onKeyDown={onKeyDown}
        style={{ display: 'flex', flexWrap: 'nowrap', backgroundColor: 'var(--color-gray-light)', borderRadius: 'var(--radius-pill)', height: 32 }}
      >
        {segment(value1, onValue1Click, value1TestId)}
        {segment(value2, onValue2Click, value2TestId)}
      </div>
    </div>
  );
}
