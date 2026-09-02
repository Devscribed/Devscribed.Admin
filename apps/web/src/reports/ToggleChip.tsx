'use client';

/**
 * Chip-shaped on/off toggle (spec reports/01 §Filter bar — "Sum date ranges"
 * and "Detailed" chips). The mockup's `.toggle-chip.on` treatment: accent-soft
 * background + accent border when on, panel + strong-border when off. DS
 * ships a `Toggle`, but that's a switch — the reports filter bar needs a
 * chip-shaped affordance instead.
 *
 * TODO(ds-gap): DS has no filter-chip primitive; when a second area needs it,
 * promote into the design system.
 */

export function ToggleChip({
  label,
  active,
  onChange,
  testId,
}: {
  label: string;
  active: boolean;
  onChange: (next: boolean) => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      data-testid={testId}
      onClick={() => onChange(!active)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 36,
        padding: '0 12px',
        borderRadius: 'var(--radius-pill)',
        border: `1.5px solid ${active ? 'var(--accent-border)' : 'var(--border-strong)'}`,
        background: active ? 'var(--accent-soft)' : 'var(--bg-panel)',
        color: active ? 'var(--accent)' : 'var(--text-sub)',
        fontFamily: 'var(--font-display)',
        fontWeight: 500,
        fontSize: 'var(--fs-12)',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}
