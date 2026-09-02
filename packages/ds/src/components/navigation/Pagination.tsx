import React from 'react';
import { ArrowIcon } from '../icons/Icon';

/**
 * §53 — page controls, for a list that does not scroll to its end.
 */
export interface PaginationProps extends Omit<React.HTMLAttributes<HTMLElement>, 'onChange'> {
  /** 1-based. A page beyond `pageCount` still renders, so the strip never lies about where it is. */
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
  /** The `<nav>`'s accessible name. Defaults to `Pagination`. */
  label?: string;
  previousLabel?: string;
  nextLabel?: string;
  /** The component draws the buttons, so only it can tag them. */
  pageTestId?: (page: number) => string | undefined;
}

/**
 * Pagination — page controls for a list that does not scroll to its end.
 *
 * §53 — every value is borrowed from the system's *small* controls rather than invented: the
 * 36px target `IconButton` and the calendar's navigation already use, `--radius-s`, a 1px
 * `--border-default` hairline, and `--color-blue` filled with `--text-on-accent` for the
 * current page, which is how `Calendar` marks a chosen day.
 *
 * Three behaviours are the component's own and are the reason it is a component:
 *
 * - **Compression.** Only the first page, the last, and the current page's neighbours are
 *   drawn; the rest collapse into a `…` that is `aria-hidden`, because "there are pages
 *   here you cannot see" is not a fact a reader can act on and the numbers either side
 *   already say it.
 * - **`aria-current="page"`.** The fill is the paint; this is the statement. A reader
 *   walking the strip is told which one they are on without being told a colour.
 * - **One page draws nothing at all.** A control offering one choice is not a choice —
 *   the same rule the candidate database's scope strip follows when a caller may see one
 *   scope (03 §08.41).
 *
 * Presentational: it knows the page, the count and a callback, and nothing about what is
 * being paged. `page` is 1-based, and a caller is expected to clamp it — a page beyond the
 * count still renders, so the strip never disagrees with the list it sits under.
 */
export function Pagination({
  page,
  pageCount,
  onChange,
  /** The `<nav>`'s accessible name; there may be more than one landmark on a screen. */
  label = 'Pagination',
  previousLabel = 'Previous page',
  nextLabel = 'Next page',
  /** `(n) => string` — the design system draws the buttons, so only it can tag them. */
  pageTestId,
  style,
  ...rest
}: PaginationProps) {
  if (!(pageCount > 1)) return null;

  /* First, last, and the current page's immediate neighbours. `…` is pushed only once per
     gap, which is what keeps `1 … 4 5 6 … 20` from becoming `1 … … 4`. */
  const entries: Array<number | string> = [];
  for (let candidate = 1; candidate <= pageCount; candidate += 1) {
    if (candidate === 1 || candidate === pageCount || Math.abs(candidate - page) <= 1) {
      entries.push(candidate);
    } else if (entries[entries.length - 1] !== '…') {
      entries.push('…');
    }
  }

  const cell = (extra: React.CSSProperties): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 36,
    height: 36,
    padding: '0 8px',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-s)',
    backgroundColor: 'var(--surface-card)',
    fontFamily: 'var(--font-family-base)',
    fontSize: 'var(--font-size-s)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    ...extra,
  });

  const step = (name: string, to: number, blocked: boolean) => (
    <button
      type="button"
      aria-label={name}
      disabled={blocked}
      onClick={() => onChange(to)}
      style={cell({
        color: blocked ? 'var(--text-secondary)' : 'var(--text-primary)',
        opacity: blocked ? 0.5 : 1,
        cursor: blocked ? 'default' : 'pointer',
      })}
    >
      {/* One glyph, rotated. The set has a single chevron and no left/right pair — rotating it
          is what `Calendar`'s navigation does with the same mark, and leaving the intrinsic
          12×8 alone is what keeps the stroke weight matching everywhere else. */}
      <span
        aria-hidden="true"
        style={{ display: 'flex', transform: `rotate(${to < page ? -90 : 90}deg)` }}
      >
        <ArrowIcon />
      </span>
    </button>
  );

  return (
    <nav
      {...rest}
      aria-label={label}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: 'var(--space-5) 0',
        ...style,
      }}
    >
      {step(previousLabel, page - 1, page <= 1)}
      {entries.map((entry, index) =>
        entry === '…' ? (
          <span
            key={`gap-${index}`}
            aria-hidden="true"
            style={{ padding: '0 4px', color: 'var(--text-secondary)' }}
          >
            …
          </span>
        ) : (
          <button
            key={entry}
            type="button"
            data-testid={pageTestId ? pageTestId(entry as number) : undefined}
            aria-current={entry === page ? 'page' : undefined}
            onClick={() => onChange(entry as number)}
            style={cell(
              entry === page
                ? {
                    backgroundColor: 'var(--color-blue)',
                    borderColor: 'var(--color-blue)',
                    color: 'var(--text-on-accent)',
                    fontWeight: 'var(--font-weight-medium)',
                  }
                : {},
            )}
          >
            {entry}
          </button>
        ),
      )}
      {step(nextLabel, page + 1, page >= pageCount)}
    </nav>
  );
}
