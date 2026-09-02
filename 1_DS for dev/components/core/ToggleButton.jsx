import React from 'react';
import { isKeyboardFocus } from './focus-visible.js';

/**
 * ToggleButton — two-value segmented control recreated from components/shared/ToggleButton.
 * ToggleButton.module.scss: .root{position:relative;margin-bottom:20px;max-width:160px},
 * .toggleWrapper{display:flex;flex-wrap:nowrap;background:$appGrayLight;border-radius:20px;
 * height:32px}, >button{flex:1 1 0;centered;background:$appGrayLight;border-radius:20px;
 * font-size:12px}, .activeBtn{height:36px;font-size:13px;font-weight:500;line-height:1;
 * background:#fff;box-shadow:0 2px 4px 0 rgb(0 0 0 / 18%);border-radius:20px;
 * margin-top:-2px;outline:0}. The label uses the global `.input-label` rule.
 * The source declares no :hover / :focus / :disabled state for either button.
 *
 * §31 — blue forwards nothing, so `data-testid` and every `aria-*` vanished before the DOM, and
 * the paint was the only thing saying which segment was chosen. Two buttons that swap a boolean
 * between them are **one control**: it is now a `role="radiogroup"` of two `role="radio"`
 * segments, with a roving tab stop and arrow keys, which is what a segmented control is. Prod's
 * markup says none of that, because prod's markup is two `<button>`s — and a reader met with
 * "24h, button" then "12h, button" is told there are two actions rather than one choice with two
 * answers.
 *
 * The focus ring is the second addition. The source declares no `:focus` state at all, which is
 * survivable while nothing is expected to arrive by keyboard; a radio group is. It takes
 * `--shadow-focus-input`, the ring every other blue control uses.
 */
export function ToggleButton({
  label, value1, value2, selectedValue, onValue1Click, onValue2Click,
  /* §31 — a name for the group as a whole. `label` is drawn; this one is only announced, and is
     what a control sitting in a row of others (a zone select beside a format toggle) needs when
     drawing a caption over it would be noise. */
  'aria-label': ariaLabel,
  value1TestId, value2TestId,
  style, ...rest
}) {
  const seg = { flex: '1 1 0', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--color-gray-light)', borderRadius: 'var(--radius-pill)', fontSize: 12, color: 'var(--text-primary)', fontFamily: 'var(--font-family-base)', cursor: 'pointer', border: 0 };
  const active = { ...seg, height: 36, fontSize: 13, fontWeight: 'var(--font-weight-medium)', lineHeight: 1, backgroundColor: '#fff', boxShadow: 'var(--shadow-toggle-active)', marginTop: -2, outline: 0 };
  const [focused, setFocused] = React.useState(null);
  const generatedId = React.useId();
  const labelId = label ? `${generatedId}-label` : undefined;

  /* Arrow keys move between the segments and select as they go, which is the radio-group
     behaviour a reader is promised the moment the role is claimed. */
  const onKeyDown = (event) => {
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

  const segment = (value, onClick, testId) => {
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
    /* §49 — `width: '100%'` beside prod's `max-width: 160px`. In prod this root is a block in a
       stacked form, so it fills its parent and the cap is what limits it; measured as a bare
       `max-width`, it collapses the moment a caller puts it in a flex row, because a flex item
       sizes to content and both segments are `flex-basis: 0`. The control then shrinks to the
       width of "24h12h" with the active segment painting over its neighbour. Restoring the
       block behaviour costs nothing anywhere else — the cap still decides the width. */
    <div {...rest} style={{ position: 'relative', marginBottom: 20, width: '100%', maxWidth: 160, ...style }}>
      {label && (
        /* global .input-label */
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
