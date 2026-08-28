'use client';

/**
 * A segmented pill matching the DS `Toggle`'s look (`--bg-sunken` track, `--radius-pill`,
 * the active segment lifted onto `--bg-panel` with `--shadow-toggle`). The DS `Toggle`
 * spreads no props onto its segments, but spec 12's roster needs a `data-testid` on each
 * one (`tt-view-daily`, `tt-entry-mode-timerange`, …), so this thin app-level control
 * carries them. Purely presentational — same tokens, one extra prop.
 */
export interface Segment<T extends string> {
  value: T;
  label: string;
  testId: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  style,
}: {
  options: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        background: 'var(--bg-sunken)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-pill)',
        padding: 3,
        ...style,
      }}
    >
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={on}
            data-testid={option.testId}
            onClick={() => onChange(option.value)}
            style={{
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-display)',
              fontWeight: 500,
              fontSize: 'var(--fs-12)',
              padding: '6px 15px',
              borderRadius: 'var(--radius-seg)',
              background: on ? 'var(--bg-panel)' : 'transparent',
              color: on ? 'var(--text)' : 'var(--text-muted)',
              boxShadow: on ? 'var(--shadow-toggle)' : 'none',
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
