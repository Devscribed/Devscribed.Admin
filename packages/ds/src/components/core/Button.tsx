import React from 'react';

/**
 * @startingPoint section="Core" subtitle="Primary, neutral and delete buttons" viewport="700x200"
 */
export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  /** Visual style. Omit for the default outlined neutral button. */
  variant?: 'primary' | 'delete';
  /** §71 — chosen, for a button that is one of a set: the 12% tint of the emphasis colour,
   *  a border in it, ink in it, and `aria-pressed`. Composes over the default variant. */
  pressed?: boolean;
  /** Optional leading icon element. */
  icon?: React.ReactNode;
  /** Shows a spinning loader in place of the icon slot. Does not disable the button. */
  preloader?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  type?: 'button' | 'submit';
  /** §38 — the element to render. `a` keeps the paint and gives up `type` and `disabled`, which
   *  an anchor does not have; a `disabled` anchor still paints disabled and gets `aria-disabled`.
   *  Use it for a control that navigates or downloads, so the browser's own handling survives. */
  as?: 'button' | 'a';
  /** §38 — anchor attributes, meaningful only with `as="a"`. */
  href?: string;
  download?: string | boolean;
  target?: string;
  rel?: string;
}

/**
 * §2 — every other attribute reaches the element; `style` merges over the painted one, and the
 * `ref` lands on whichever element `as` chose.
 *
 * The rendered tag is a union of two intrinsics, which JSX cannot check against one prop set —
 * `type` and `disabled` exist on one side and `href` on the other. The implementation widens
 * `as` to `ElementType` for that reason alone; `ButtonProps` above is the contract callers see,
 * restored by the annotation on the export.
 */
type ButtonInternalProps = Omit<ButtonProps, 'as'> & { as?: React.ElementType };

/* The icon slot is a rule rather than an inline style because it applies to whatever `<svg>` a
   caller puts in the slot, and a component cannot style a child it did not render. The box is
   20px and centred. */
const spinKeyframes = `@keyframes ds-btn-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.ds-btn-title { display: flex; align-items: center; justify-content: center; }
.ds-btn-title > svg { width: 20px; height: 20px; fill: #fff; }`;

/* Injected once into <head> rather than rendered next to the button: a sibling <style> is a
   real element, so it breaks a consumer's `button + button` rules and :nth-child counts. */
if (typeof document !== 'undefined' && !document.getElementById('ds-btn-style')) {
  const el = document.createElement('style');
  el.id = 'ds-btn-style';
  el.textContent = spinKeyframes;
  document.head.appendChild(el);
}

function base(variant: ButtonProps['variant'], disabled: boolean | undefined): React.CSSProperties {
  const common: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    /* §1 — no `width: '100%'`. A button that cannot be narrower than its parent has no way to
       sit next to anything, and a control's own paint is the wrong place to decide how much of
       a row it takes. The two compositions that want a full-width button say so themselves:
       `ConfirmDialog` passes the width, `FormActions` stretches its slot with a grid. */
    padding: '0 8px',
    height: 44,
    border: '1.5px solid transparent',
    borderRadius: 'var(--radius-l)',
    fontFamily: 'var(--font-family-base)',
    fontSize: 16,
    fontWeight: 'var(--font-weight-button)',
    lineHeight: '24px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    transition: 'var(--transition-opacity-hover), var(--transition-filter-hover)',
    boxSizing: 'border-box',
  };
  if (variant === 'primary') {
    return { ...common, backgroundColor: 'var(--action-primary)', borderColor: 'var(--action-primary)', color: 'var(--action-primary-text)' };
  }
  if (variant === 'delete') {
    return { ...common, backgroundColor: 'var(--action-danger)', borderColor: 'var(--action-danger)', color: 'var(--action-danger-text)' };
  }
  return { ...common, backgroundColor: 'var(--surface-card)', borderColor: 'var(--border-default)', color: 'var(--action-neutral-text)' };
}

/* §71 — the chosen one of a set. Most buttons *do* something and none of them stay down
   afterwards, so a pressed state is a different kind of thing and needs a paint of its own. A
   booking page is a grid of times where exactly one is picked, and painting that with
   `variant="primary"` — the only other selected-looking treatment — made the chosen slot look
   like the page's primary action while `Book`, a few rows below, looked the same. Two solid
   blue buttons, one of which submits.

   The paint is the system's one reading of *chosen*: the emphasis colour at 12% behind ink and
   a border in the colour itself, which is exactly how a selected calendar day reads (§30). It
   composes over the default variant, so the box, the height and the radius are unchanged, and
   it sets `aria-pressed` — a control that says it is chosen has to say so to a reader too. */
const pressedPaint: React.CSSProperties = {
  backgroundColor: 'color-mix(in oklch, var(--action-primary) 12%, transparent)',
  borderColor: 'var(--action-primary)',
  color: 'var(--action-primary)',
};

/**
 * Button — the primary action control.
 * Variants: default (outlined neutral), primary (solid blue), delete (solid red).
 * Hover: default fades to 60% opacity; primary/delete brighten via filter — never darken with a
 * new colour, so hover adds no value to the palette.
 */
export const Button: React.ForwardRefExoticComponent<
  ButtonProps & React.RefAttributes<HTMLButtonElement | HTMLAnchorElement>
> = React.forwardRef(function Button(
  /* §2 — everything not named here reaches the element: `data-testid`, `ref`, `aria-*`,
     `className` and `style`. A control that swallows them is one a test cannot find and a
     caller cannot place. */
  { variant, icon, preloader, disabled, children, onClick, type = 'button', style, onMouseEnter, onMouseLeave,
    /* §71 — chosen, for a button that is one of a set. Also sets `aria-pressed`. */
    pressed,
    /* §38 — the element, so a control that *navigates* can be a real `<a>` wearing this paint.
       A `<button onClick={() => location.assign(...)}>` loses middle-click, copy-address,
       open-in-new-tab and the browser's own download handling, none of which any amount of
       script gets back. `Table` already makes this exact swap for a row that navigates
       (§18: `const Row = href ? 'a' : 'div'`), and this is that, on a button. */
    as: Tag = 'button',
    ...rest }: ButtonInternalProps,
  ref: React.Ref<HTMLButtonElement | HTMLAnchorElement>,
) {
  const [hover, setHover] = React.useState(false);
  const link = Tag === 'a';
  const painted = base(variant, disabled);
  if (pressed) Object.assign(painted, pressedPaint);
  if (hover && !disabled) {
    if (variant === 'primary' || variant === 'delete') painted.filter = 'brightness(90%)';
    else painted.opacity = 0.6;
  }
  return (
    <Tag
      {...rest}
      ref={ref}
      /* An anchor has neither attribute. `disabled` still paints — the caller asked for the
         disabled treatment — so it says so where a reader can hear it rather than only looking
         unavailable. */
      {...(link ? { 'aria-disabled': disabled || undefined } : { type, disabled })}
      /* §2 — a button that has swapped its label for "Signing in" and started a request is busy,
         and a screen reader has no other way to know. */
      aria-busy={preloader ? true : undefined}
      /* §71 — the state the paint is only the picture of. */
      aria-pressed={pressed === undefined ? undefined : Boolean(pressed)}
      onClick={onClick}
      onMouseEnter={(e: React.MouseEvent<HTMLElement>) => { setHover(true); if (onMouseEnter) onMouseEnter(e as React.MouseEvent<HTMLButtonElement>); }}
      onMouseLeave={(e: React.MouseEvent<HTMLElement>) => { setHover(false); if (onMouseLeave) onMouseLeave(e as React.MouseEvent<HTMLButtonElement>); }}
      style={{ ...painted, ...(link ? { textDecoration: 'none' } : null), ...style }}
    >
      {(icon || preloader) && <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, flexShrink: 0 }}>{icon}</span>}
      <span className="ds-btn-title" style={{ margin: '0 10px' }}>{children}</span>
      {(icon || preloader) && (
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, flexShrink: 0 }}>
          {preloader && (
            <span style={{ display: 'flex', width: 20, height: 20, animation: 'ds-btn-spin 2s linear infinite' }}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="3">
                <circle cx="12" cy="12" r="9" opacity="0.25" />
                <path d="M21 12a9 9 0 0 0-9-9" />
              </svg>
            </span>
          )}
        </span>
      )}
    </Tag>
  );
});
