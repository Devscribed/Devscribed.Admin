'use client';

/**
 * Owner-scope segmented control (spec reports/01 §Screens · Right actions).
 * DS ships no segmented control — this is the mockup's `.seg` / `.seg-item`
 * geometry translated to tokens (sunken pill background, panel-colored active
 * cell). Kept local to `src/reports/` because it is the only surface that
 * needs it; the day a second screen wants it, it moves out to the DS with a
 * matching DS-gap entry in whichever spec adds it.
 *
 * TODO(ds-gap): promote a Segmented control into the design system so multiple
 * screens can share it without re-implementing the same token composition.
 */

export interface SegmentedItem<Value extends string> {
  value: Value;
  label: string;
  testId?: string;
}

export function SegmentedControl<Value extends string>({
  items,
  value,
  onChange,
  testId,
  ariaLabel,
}: {
  items: readonly SegmentedItem<Value>[];
  value: Value;
  onChange: (next: Value) => void;
  testId?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      data-testid={testId}
      style={{
        display: 'inline-flex',
        padding: 3,
        background: 'var(--bg-sunken)',
        borderRadius: 'var(--radius-lg)',
        gap: 2,
      }}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            data-testid={item.testId}
            onClick={() => {
              if (!active) onChange(item.value);
            }}
            style={{
              padding: '6px 14px',
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: 'var(--fs-13)',
              color: active ? 'var(--text)' : 'var(--text-muted)',
              background: active ? 'var(--bg-panel)' : 'transparent',
              border: 'none',
              borderRadius: 'calc(var(--radius-lg) - 2px)',
              boxShadow: active ? 'var(--shadow-card)' : 'none',
              cursor: active ? 'default' : 'pointer',
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
