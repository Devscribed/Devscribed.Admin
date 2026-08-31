'use client';

import { Badge, Radio } from '@/ds';
import type { SigningProviderOption } from '@/documents/envelopes';

/**
 * One selectable provider row.
 *
 * The design system ships **no selectable option row** — a bordered row carrying a radio,
 * a title, a description, a trailing status pill and a disabled state — so this is
 * composed from the primitives that do exist: `Radio` (which already takes `disabled`)
 * and `Badge` (whose `warning` tone is the DS's own reserved amber), with every spacing
 * and colour value from a token. The gap is recorded rather than improvised silently —
 * in the implementing run's handoff (`dsGaps`), because no spec in the documents
 * area carries a DS gaps table — so the second screen that needs one promotes it into
 * the design system as an `OptionRow` instead of copying this.
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
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--sp-7)',
        padding: 'var(--sp-8)',
        borderTop: '1px solid var(--divider)',
      }}
    >
      <Radio
        checked={selected}
        disabled={!selectable}
        name="signing-provider"
        value={option.key}
        onChange={() => onSelect(option.key)}
        label={
          <span style={{ display: 'block' }}>
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--sp-6)',
                flexWrap: 'wrap',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 600,
                  fontSize: 'var(--fs-16)',
                  color: 'var(--text)',
                }}
              >
                {option.name}
              </span>
              <StatusPill option={option} active={active} />
            </span>
            <span
              style={{
                display: 'block',
                marginTop: 'var(--sp-4)',
                fontSize: 'var(--fs-14)',
                color: 'var(--text-sub)',
              }}
            >
              {option.description}
            </span>
            {option.configured ? (
              <span
                style={{
                  display: 'block',
                  marginTop: 'var(--sp-4)',
                  fontSize: 'var(--fs-13)',
                  color: 'var(--text-muted)',
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
                  marginTop: 'var(--sp-4)',
                  fontSize: 'var(--fs-13)',
                  color: 'var(--text-muted)',
                }}
              >
                Missing: {option.missing.join(', ')}. Set them in the environment, then
                reload this page.
              </span>
            )}
          </span>
        }
        style={{ alignItems: 'flex-start' }}
      />
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
      style={{ display: 'inline-flex', gap: 'var(--sp-4)', flexWrap: 'wrap' }}
    >
      {!option.configured && <Badge tone="neutral">Not configured</Badge>}
      {option.configured && active && <Badge tone="active">Active</Badge>}
      {option.configured && option.testMode && <Badge tone="warning">Test mode</Badge>}
      {option.configured && !active && !option.testMode && (
        <Badge tone="neutral">Available</Badge>
      )}
    </span>
  );
}
