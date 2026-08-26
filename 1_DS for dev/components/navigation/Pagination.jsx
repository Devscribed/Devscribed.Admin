import React from 'react';

const Chevron = ({ back }) => (
  <svg viewBox="0 0 8 12" width={7} height={10} aria-hidden>
    <path
      d={back ? 'M7 1 L2 6 L7 11' : 'M1 1 L6 6 L1 11'}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * Page numbers with previous and next — Meridian's answer to a list too long to draw.
 *
 * It exists because the alternative does not fit the product: infinite scroll cannot
 * show how many rows match, and "how many?" is the question a filtered list is asked.
 * So the control is numbered, the current page is `aria-current="page"`, and the bounds
 * are disabled rather than hidden — a Previous that vanishes on page 1 moves Next under
 * the cursor.
 *
 * Long ranges are windowed with an ellipsis, and the first and last page always stay
 * reachable: they are the two anybody actually jumps to.
 */
export function Pagination({
  page = 1,
  pageCount = 1,
  onChange,
  label = 'Pagination',
  pageTestId,
  style,
  ...rest
}) {
  const go = (target) => {
    if (target < 1 || target > pageCount || target === page) return;
    onChange && onChange(target);
  };

  return (
    <nav
      {...rest}
      aria-label={label}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, ...style }}
    >
      <Step label="Previous page" disabled={page <= 1} onClick={() => go(page - 1)}>
        <Chevron back />
      </Step>

      {pageWindow(page, pageCount).map((entry, index) =>
        entry === null ? (
          // Decorative: the pages it stands for are still reachable by stepping.
          <span
            key={`gap-${index}`}
            aria-hidden
            style={{ padding: '0 4px', color: 'var(--text-faint)' }}
          >
            …
          </span>
        ) : (
          <Step
            key={entry}
            label={`Page ${entry}`}
            current={entry === page}
            testId={pageTestId && pageTestId(entry)}
            onClick={() => go(entry)}
          >
            {entry}
          </Step>
        ),
      )}

      <Step label="Next page" disabled={page >= pageCount} onClick={() => go(page + 1)}>
        <Chevron />
      </Step>
    </nav>
  );
}

function Step({ label, current, disabled, testId, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-current={current ? 'page' : undefined}
      data-testid={testId}
      onMouseEnter={(e) => {
        if (!disabled && !current) e.currentTarget.style.background = 'var(--hover-bg-tint)';
      }}
      onMouseLeave={(e) => {
        if (!current) e.currentTarget.style.background = 'transparent';
      }}
      style={{
        minWidth: 34,
        height: 34,
        padding: '0 8px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: current ? '1.5px solid var(--accent)' : '1.5px solid transparent',
        borderRadius: 'var(--radius-sm)',
        background: current ? 'var(--accent-soft)' : 'transparent',
        fontFamily: 'var(--font-display)',
        fontWeight: 600,
        fontSize: 'var(--fs-13)',
        color: disabled ? 'var(--text-faint)' : current ? 'var(--accent)' : 'var(--text-sub)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background .12s, color .12s',
      }}
    >
      {children}
    </button>
  );
}

/**
 * Up to seven entries: the first, the last, the current with a neighbour either side,
 * and `null` wherever a run was elided.
 */
function pageWindow(page, pageCount) {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);

  const around = [page - 1, page, page + 1].filter((n) => n > 1 && n < pageCount);
  const pages = [1, ...around, pageCount];

  return pages.flatMap((entry, index) =>
    index > 0 && entry - pages[index - 1] > 1 ? [null, entry] : [entry],
  );
}
