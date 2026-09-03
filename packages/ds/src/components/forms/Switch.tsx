import React from 'react';
import { isKeyboardFocus } from '../core/focus-visible';

export interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'onChange' | 'value'> {
  /** On or off. Controlled: the caller owns the value and is told when it should change. */
  checked?: boolean;
  onChange?: (next: boolean) => void;
  /**
   * §88 — the text beside the knob. Drawn inside the control, so it is part of the accessible
   * name; omit it and give the control an `aria-label` instead, for a row that already has a
   * caption of its own.
   */
  label?: React.ReactNode;
  disabled?: boolean;
}

/**
 * Switch — §88. A boolean that **takes effect where it is pressed**, drawn as a knob that
 * slides across a track and states its own name beside it.
 *
 * It is not a `Checkbox` and not a `ToggleButton`, and both distinctions are the reason it
 * exists rather than a matter of taste.
 *
 * - A `Checkbox` is a value collected now and applied when the form is submitted, and the box
 *   is the platform's to draw (§79). Three of the four things this control does happen
 *   immediately: flipping a running timer's billable flag `PUT`s it mid-run.
 * - A `ToggleButton` is a `radiogroup` — one choice with several answers, each of which stays
 *   on screen (§31). A switch has one answer that is either taken or not, and the reader
 *   presses *the same node* to undo it. That is `role="switch"` with `aria-checked`, and a
 *   radio group cannot express it: unchecking a radio means checking a different node.
 *
 * The system was silent here because it had never drawn a mid-flight boolean. The silence was
 * an omission rather than a decision, which is what lets this be added at all.
 *
 * Paint: the track is `--surface-sunken` off and `--action-primary` on, at `--radius-pill`,
 * with the knob on `--surface-card`. Focus takes `--shadow-focus-input`, and takes it for a
 * keyboard and not for a pointer (§68).
 */
export function Switch({
  checked = false, onChange, label, disabled,
  /* §88 — everything not named here reaches the `<button>`: `data-testid`, `aria-describedby`,
     `aria-label` and the rest. A control that is nothing but a state has to be findable by a
     test and nameable to a reader; that is rule 3's first clause, and the same call §79 made
     on `Checkbox` and §75 on `MiniTracker`. */
  style, onFocus, onBlur, ...rest
}: SwitchProps) {
  const [focused, setFocused] = React.useState(false);
  return (
    <button
      {...rest}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => { if (!disabled && onChange) onChange(!checked); }}
      onFocus={(event) => { setFocused(isKeyboardFocus(event.currentTarget)); if (onFocus) onFocus(event); }}
      onBlur={(event) => { setFocused(false); if (onBlur) onBlur(event); }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-4)',
        padding: 0,
        background: 'transparent',
        border: 0,
        borderRadius: 'var(--radius-l)',
        fontFamily: 'var(--font-family-base)',
        fontSize: 'var(--font-size-s)',
        color: 'var(--text-primary)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        boxShadow: focused ? 'var(--shadow-focus-input)' : 'none',
        ...style,
      }}
    >
      <span
        aria-hidden
        style={{
          /* @literal the switch's own geometry: a 42x24 track holding an 18px knob with 2px of
             clearance and 1px of border. Four numbers measured against each other rather than
             against the page, and none of them is a scale step anything else reads. */
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: checked ? 'flex-end' : 'flex-start',
          flexShrink: 0,
          width: 42,
          height: 24,
          padding: 2,
          boxSizing: 'border-box',
          borderRadius: 'var(--radius-pill)',
          border: 'var(--border-width-hairline) solid var(--border-default)',
          background: checked ? 'var(--action-primary)' : 'var(--surface-sunken)',
          transition: 'background var(--duration-fast) var(--ease-standard)',
        }}
      >
        <span
          style={{
            /* @literal see the track's note above. */
            display: 'block', width: 18, height: 18, borderRadius: 'var(--radius-circle)',
            background: 'var(--surface-card)', boxShadow: 'var(--shadow-toggle-active)',
          }}
        />
      </span>
      {label != null && label !== '' && <span>{label}</span>}
    </button>
  );
}
