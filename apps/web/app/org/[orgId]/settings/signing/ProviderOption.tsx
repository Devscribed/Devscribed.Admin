'use client';

import { Badge } from '@devscribed/ds';
import type { SigningProviderOption } from '@/documents/envelopes';

/**
 * One selectable provider row.
 *
 * **The design system has no `Radio`, and this screen is the only thing that wants one.**
 * The previous system's was read before this was written and is not restorable: it painted
 * its own circle and hid the real input behind `opacity: 0`, which is exactly what §79
 * rejected for `Checkbox` — "the box itself is the browser's own: it is one of the few
 * controls an operating system draws better than a stylesheet can, and a hand-painted one
 * loses the platform's focus, contrast and high-contrast-mode behaviour." So the control
 * here is a **native `<input type="radio">`**, taking the system's ink through
 * `accent-color` and its geometry from tokens, and it stays local: one consumer is a
 * composition wearing a component's name, and it moves into the package on the day a
 * second screen wants it — rule 4, the same call `MembersLoadingSkeleton` carries.
 *
 * The row itself is a `<label>`, so the whole thing is the control's hit area and a click
 * anywhere on it selects — which is also what the suite presses.
 *
 * An **unconfigured provider is rendered, visible, with its radio disabled and the
 * missing items named.** Deliberately not hidden: the admin needs to know the option
 * exists and what is absent, which is the one case where "a control nobody can use is not
 * drawn" gives way to "an option nobody can choose still has to be explainable".
 */
export function ProviderOption({
  option,
  selected,
  active,
  readOnly,
  onSelect,
}: {
  option: SigningProviderOption;
  selected: boolean;
  /** The provider the organization is on right now, whatever the radio currently shows. */
  active: boolean;
  /** A manager sees the page and cannot change it. */
  readOnly: boolean;
  onSelect: (key: string) => void;
}) {
  const selectable = option.configured && !readOnly;

  return (
    <div
      data-testid={`signing-provider-option-${option.key}`}
      style={{
        borderTop: 'var(--border-width-hairline) solid var(--border-subtle)',
      }}
    >
      <label
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 'var(--space-7)',
          padding: 'var(--space-6)',
          cursor: selectable ? 'pointer' : 'not-allowed',
          userSelect: 'none',
        }}
      >
        <input
          type="radio"
          checked={selected}
          disabled={!selectable}
          name="signing-provider"
          value={option.key}
          onChange={() => onSelect(option.key)}
          style={{
            width: 18,
            height: 18,
            margin: 0,
            flexShrink: 0,
            // The platform draws the mark; this only tells it which ink to draw it in.
            accentColor: 'var(--action-primary)',
            cursor: selectable ? 'pointer' : 'not-allowed',
          }}
        />
        <span style={{ display: 'block', opacity: selectable ? 1 : 0.55 }}>
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-5)',
                flexWrap: 'wrap',
              }}
            >
              <span
                style={{
                  fontWeight: 'var(--headline-6-weight)',
                  fontSize: 'var(--font-size-base)',
                  color: 'var(--text-primary)',
                }}
              >
                {option.name}
              </span>
              <StatusPill option={option} active={active} />
            </span>
            <span
              style={{
                display: 'block',
                marginTop: 'var(--space-3)',
                fontSize: 'var(--font-size-s)',
                color: 'var(--text-tertiary)',
              }}
            >
              {option.description}
            </span>
            {option.configured ? (
              <span
                style={{
                  display: 'block',
                  marginTop: 'var(--space-3)',
                  fontSize: 'var(--font-size-s)',
                  color: 'var(--text-secondary)',
                }}
              >
                {/* Live checks, shown beside the option and never a gate on it: no
                    deployed environment has a public address the provider can reach, and
                    a provider whose webhook is unregistered works — it is merely slower. */}
                Connection: {option.reachable ? '✓ reachable' : '— unreachable'}
                {option.webhookRegistered === undefined
                  ? ''
                  : ` · Webhook: ${option.webhookRegistered ? '✓ registered' : '— not registered'}`}
              </span>
            ) : (
              <span
                data-testid={`signing-provider-missing-${option.key}`}
                style={{
                  display: 'block',
                  marginTop: 'var(--space-3)',
                  fontSize: 'var(--font-size-s)',
                  color: 'var(--text-secondary)',
                }}
              >
                Missing: {option.missing.join(', ')}. Set them in the environment, then
                reload this page.
              </span>
            )}
        </span>
      </label>
    </div>
  );
}

/**
 * Status is never colour-only: every pill carries its words.
 *
 * Two facts can be true at once — a provider can be the active one *and* be in test mode
 * — so the element the spec names is a container and the badges inside it are what say
 * which. A single pill would have had to drop one of the two, and the one it would have
 * dropped is the one that says a signed document has no legal weight.
 *
 * The test-mode pill uses the DS's existing `warning` tone rather than introducing a
 * colour: amber is already reserved for warnings, and a bespoke "test mode" tone would be
 * a new colour for a state the design system has no opinion about.
 */
function StatusPill({ option, active }: { option: SigningProviderOption; active: boolean }) {
  return (
    <span
      data-testid={`signing-provider-status-${option.key}`}
      style={{ display: 'inline-flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}
    >
      {!option.configured && <Badge status="neutral">Not configured</Badge>}
      {option.configured && active && <Badge status="active">Active</Badge>}
      {option.configured && option.testMode && <Badge status="warning">Test mode</Badge>}
      {option.configured && !active && !option.testMode && (
        <Badge status="neutral">Available</Badge>
      )}
    </span>
  );
}
