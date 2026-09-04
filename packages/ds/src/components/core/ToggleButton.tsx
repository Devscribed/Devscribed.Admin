import React from 'react';
import { isKeyboardFocus } from './focus-visible';

/** §87 — one segment, when the set is given as a list. */
export interface ToggleButtonOption {
  /** The value handed back to `onChange`, and the segment's label unless `label` is given. */
  value: string;
  label?: string;
  /** §31 — `data-testid` for this segment. The component draws it, so only it can tag it. */
  testId?: string;
}

export interface ToggleButtonProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  /** Rendered with the global `.input-label` treatment above the control. */
  label?: string;
  /**
   * §87 — the segments, when there are not exactly two. Beside `value1` / `value2`, never
   * instead of them: a two-answer control reads better written as two answers.
   */
  options?: ToggleButtonOption[];
  /** §87 — called with the chosen `value`. The `options` form's counterpart to `onValueNClick`. */
  onChange?: (value: string) => void;
  value1?: string;
  value2?: string;
  /** Whichever segment is currently selected — a `value1` / `value2`, or an `options` value. */
  selectedValue?: string;
  onValue1Click?: () => void;
  onValue2Click?: () => void;
  /** §31 — `data-testid` per segment. The component draws both, so only it can tag them. */
  value1TestId?: string;
  value2TestId?: string;
  /** §31 — style for the root, which carries the 20px of clearance below and the width cap. */
  style?: React.CSSProperties;
}

/**
 * ToggleButton — a segmented pill. The track is a 32px `--color-gray-light` capsule at
 * `--radius-pill`; the chosen segment is a white 36px pill lifted out of it by 2px, carrying
 * `--shadow-toggle-active` and one step up in size and weight. The label above takes the
 * system's field-label treatment.
 *
 * §31 — **it is one control, not several buttons.** Buttons that swap a value between them are
 * a single choice with several answers, and a reader met with "24h, button" then "12h, button"
 * is told there are two actions. So it is a `role="radiogroup"` of `role="radio"` segments,
 * with one tab stop and arrow keys that move and select — the semantics the shape already
 * implies. `data-testid` reaches each segment, because the paint cannot be the only thing
 * saying which one is chosen.
 *
 * §87 — **and it takes more than two.** `options` is the list form, beside the `value1` /
 * `value2` pair rather than instead of it: this is §18's and §45's shape, where the object
 * form arrives because a bare pair cannot give a segment a value distinct from its label or a
 * test id of its own, and the two-answer spelling stays because it reads better for the case
 * it was written for. Both normalise to the same segments and the same keyboard, so there is
 * one control here and not two.
 *
 * Give it a name — `label` if it should be drawn, `aria-label` if it should only be announced.
 *
 * The focus ring is the other half. A group that can be reached and changed by keyboard has to
 * show where the keystrokes land; it takes `--shadow-focus-input`, the ring every control in
 * the system uses.
 */
export function ToggleButton({
  label, value1, value2, selectedValue, onValue1Click, onValue2Click,
  /* §87 — the list form and its single handler. */
  options, onChange,
  /* §31 — a name for the group as a whole. `label` is drawn; this one is only announced, and is
     what a control sitting in a row of others (a zone select beside a format toggle) needs when
     drawing a caption over it would be noise. */
  'aria-label': ariaLabel,
  value1TestId, value2TestId,
  style, ...rest
}: ToggleButtonProps) {
  /* §87 — the segments carry their own horizontal padding, and that is what makes the cap
     below computable: a track sized to its content is only as wide as the labels in it plus
     the room around them, and without the padding "content" is bare text touching the pill's
     edge. `white-space: nowrap` because a segment that wraps is a segment that is too narrow,
     and the cap exists so that never happens. */
  const seg: React.CSSProperties = { flex: '1 1 0', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 var(--space-6)', whiteSpace: 'nowrap', backgroundColor: 'var(--color-gray-light)', borderRadius: 'var(--radius-pill)', fontSize: 'var(--font-size-xs)', color: 'var(--text-primary)', fontFamily: 'var(--font-family-base)', cursor: 'pointer', border: 0 };
  /* @literal 13px and the -2px lift are the chosen segment's own: it steps out of the track it
     sits in, and neither number is a scale step anything else uses. */
  const active: React.CSSProperties = { ...seg, height: 36, fontSize: 13, fontWeight: 'var(--font-weight-medium)', lineHeight: 1, backgroundColor: 'var(--surface-card)', boxShadow: 'var(--shadow-toggle-active)', marginTop: -2, outline: 0 };
  const [focused, setFocused] = React.useState<string | null | undefined>(null);
  const generatedId = React.useId();
  const labelId = label ? `${generatedId}-label` : undefined;

  /* §87 — both spellings become one list, so everything below this line — the paint, the
     keyboard, the ring, the cap — is written once and cannot differ between them. */
  const segments: ToggleButtonOption[] = options
    ? options
    : [{ value: value1 as string, testId: value1TestId }, { value: value2 as string, testId: value2TestId }];
  const handlers: Array<(() => void) | undefined> = options
    ? options.map((option) => (onChange ? () => onChange(option.value) : undefined))
    : [onValue1Click, onValue2Click];

  /* Arrow keys move between the segments and select as they go, which is the radio-group
     behaviour a reader is promised the moment the role is claimed. §87 — it steps by one and
     wraps, which is what "the other one" already meant when there were only two. */
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const back = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    if (!back && !forward) return;
    event.preventDefault();
    const current = segments.findIndex((segment) => segment.value === selectedValue);
    const from = current === -1 ? 0 : current;
    const next = (from + (forward ? 1 : -1) + segments.length) % segments.length;
    const move = handlers[next];
    if (move) move();
    const buttons = event.currentTarget.querySelectorAll('button');
    const node = buttons[next];
    if (node) node.focus();
  };

  const segment = (option: ToggleButtonOption, index: number) => {
    const on = selectedValue === option.value;
    const ring = focused === option.value ? 'var(--shadow-focus-input)' : null;
    return (
      <button
        key={option.value}
        type="button"
        role="radio"
        aria-checked={on}
        /* One tab stop for the group: Tab reaches the chosen answer, arrows change it. */
        tabIndex={on ? 0 : -1}
        value={option.value}
        onClick={handlers[index]}
        data-testid={option.testId}
        /* §68 — a keyboard's ring, not a pointer's. */
        onFocus={(event) => setFocused(isKeyboardFocus(event.currentTarget) ? option.value : null)}
        onBlur={() => setFocused((current) => (current === option.value ? null : current))}
        style={{
          ...(on ? active : seg),
          /* Held in state rather than written onto the node, so a segment that becomes the
             chosen one while focused keeps both its own shadow and the ring. */
          ...(ring ? { boxShadow: on ? `${active.boxShadow}, ${ring}` : ring } : null),
        }}
      >
        {option.label ?? option.value}
      </button>
    );
  };

  return (
    /* §49 — `width: '100%'` beside the width cap, and the width is why. A bare `max-width`
       collapses the moment a caller puts this in a flex row: a flex item sizes to content and
       every segment is `flex-basis: 0`, so the control shrinks to the width of "24h12h" with
       the chosen segment painting over its neighbour. Filling the line first and capping second
       costs nothing in a stacked form — the cap still decides the width there.

       §87 — the cap is `max-content`, where §49 wrote 160px. That number was measured from
       two three-character labels and it does not survive a third segment or a longer word:
       every segment is `flex-basis: 0`, so they split the cap evenly and `Duration only` set
       inside 80px is a label with its end cut off. `max-content` on a flex container whose
       items all grow equally resolves to **the widest segment times the number of them**,
       which is the same rule 160px was an instance of — stated once, and correct for labels
       the component has never seen. */
    <div {...rest} style={{ position: 'relative', marginBottom: 'var(--space-7)', width: '100%', maxWidth: 'max-content', ...style }}>
      {label && (
        /* The system's field-label treatment, inline because this control draws its own. */
        <label id={labelId} style={{ display: 'inline-block', padding: 'var(--space-4) 0 0 var(--space-4)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-xs)', lineHeight: 'var(--line-height-label)', color: 'var(--text-secondary)', marginBottom: 'var(--space-1)', whiteSpace: 'nowrap', fontFamily: 'var(--font-family-base)' }}>{label}</label>
      )}
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-label={labelId ? undefined : ariaLabel}
        onKeyDown={onKeyDown}
        style={{ display: 'flex', flexWrap: 'nowrap', backgroundColor: 'var(--color-gray-light)', borderRadius: 'var(--radius-pill)', height: 32 }}
      >
        {segments.map(segment)}
      </div>
    </div>
  );
}
