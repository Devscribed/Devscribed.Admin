'use client';

/**
 * Range picker (spec reports/01 §Filter bar). Single chip that opens a
 * popover carrying a two-month calendar and a preset column. Click day-1 to
 * set the start; click day-2 to set the end (the click auto-closes the
 * popover and commits both). A preset button (Last 7 days, Last 30 days, This
 * month, Last month, Year to date) commits its own range and closes.
 *
 * `data-testid="reports-filter-range"` sits on the trigger wrapper; the
 * trigger button carries `reports-filter-range-input` so an E2E can locate
 * "the thing you click to open the range picker" by the spec-named id.
 *
 * TODO(ds-gap): DS ships no range primitive; promote a shared control into
 * the design system once a second area needs one (Time & Activity, Time Off).
 */

import { useEffect, useMemo, useRef, useState } from 'react';

interface Props {
  startDate: string;
  endDate: string;
  onChange: (next: { startDate: string; endDate: string }) => void;
}

const MONTH_LABEL = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
const DAY_LABEL = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const DAY_YEAR_LABEL = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function toIso(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function addMonths(y: number, m: number, delta: number): { y: number; m: number } {
  const total = y * 12 + m + delta;
  return { y: Math.floor(total / 12), m: ((total % 12) + 12) % 12 };
}
function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}
/** Day-of-week the 1st of (y,m) falls on. Monday-first grid, so 0=Mon … 6=Sun. */
function firstColMondayFirst(y: number, m: number): number {
  const jsDow = new Date(Date.UTC(y, m, 1)).getUTCDay(); // Sun=0
  return (jsDow + 6) % 7;
}

export function DateRangeInput({ startDate, endDate, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ y: number; m: number }>(() => {
    const d = parseIso(startDate);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
  });
  /** After first click the picker holds the pending start until the second click commits both. */
  const [pendingStart, setPendingStart] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const handleClick = (event: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
        setPendingStart(null);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        setPendingStart(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const triggerLabel = useMemo(() => formatRange(startDate, endDate), [startDate, endDate]);

  function commit(next: { startDate: string; endDate: string }) {
    // Auto-swap if the user picked the end first.
    const [s, e] = next.startDate <= next.endDate
      ? [next.startDate, next.endDate]
      : [next.endDate, next.startDate];
    onChange({ startDate: s, endDate: e });
    setPendingStart(null);
    setOpen(false);
  }

  function onDayClick(iso: string) {
    if (pendingStart === null) {
      setPendingStart(iso);
      return;
    }
    commit({ startDate: pendingStart, endDate: iso });
  }

  function applyPreset(preset: PresetKey) {
    commit(computePreset(preset));
  }

  const rightMonth = addMonths(anchor.y, anchor.m, 1);

  return (
    <div
      ref={wrapperRef}
      data-testid="reports-filter-range"
      style={{ position: 'relative', display: 'inline-block' }}
    >
      <button
        type="button"
        data-testid="reports-filter-range-input"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((p) => !p)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          height: 36,
          padding: '0 12px',
          border: '1.5px solid var(--border-strong)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-panel)',
          fontFamily: 'var(--font-display)',
          fontWeight: 500,
          fontSize: 'var(--fs-13)',
          color: 'var(--text)',
          cursor: 'pointer',
        }}
      >
        <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>Range:</span>
        <span>{triggerLabel}</span>
        <span
          aria-hidden
          style={{
            display: 'inline-block',
            width: 0,
            height: 0,
            borderLeft: '4px solid transparent',
            borderRight: '4px solid transparent',
            borderTop: '5px solid var(--text-muted)',
            marginLeft: 2,
          }}
        />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Pick a date range"
          style={{
            position: 'absolute',
            top: 44,
            left: 0,
            zIndex: 10,
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-modal)',
            padding: 12,
            display: 'flex',
            gap: 12,
          }}
        >
          <PresetColumn onPick={applyPreset} />
          <div>
            <div style={{ display: 'flex', gap: 16 }}>
              <MonthGrid
                year={anchor.y}
                month={anchor.m}
                startIso={pendingStart ?? startDate}
                endIso={pendingStart ?? endDate}
                onDayClick={onDayClick}
                onPrev={() => setAnchor(addMonths(anchor.y, anchor.m, -1))}
                onNext={undefined}
              />
              <MonthGrid
                year={rightMonth.y}
                month={rightMonth.m}
                startIso={pendingStart ?? startDate}
                endIso={pendingStart ?? endDate}
                onDayClick={onDayClick}
                onPrev={undefined}
                onNext={() => setAnchor(addMonths(anchor.y, anchor.m, 1))}
              />
            </div>
            <div
              style={{
                marginTop: 10,
                fontSize: 'var(--fs-12)',
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-display)',
              }}
            >
              {pendingStart
                ? `Start: ${DAY_YEAR_LABEL.format(parseIso(pendingStart))}. Pick end date.`
                : 'Click a day to pick the start, then a second day to pick the end.'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

function MonthGrid({
  year,
  month,
  startIso,
  endIso,
  onDayClick,
  onPrev,
  onNext,
}: {
  year: number;
  month: number;
  startIso: string;
  endIso: string;
  onDayClick: (iso: string) => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const first = firstColMondayFirst(year, month);
  const days = daysInMonth(year, month);
  const cells: Array<number | null> = [];
  for (let i = 0; i < first; i += 1) cells.push(null);
  for (let d = 1; d <= days; d += 1) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 6,
        }}
      >
        {onPrev ? <NavArrow direction="prev" onClick={onPrev} /> : <span style={{ width: 24 }} />}
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: 'var(--fs-13)',
            color: 'var(--text)',
          }}
        >
          {MONTH_LABEL.format(new Date(Date.UTC(year, month, 1)))}
        </span>
        {onNext ? <NavArrow direction="next" onClick={onNext} /> : <span style={{ width: 24 }} />}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 32px)',
          gap: 2,
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--fs-11)',
          color: 'var(--text-muted)',
        }}
      >
        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => (
          <div key={d} style={{ textAlign: 'center', padding: '4px 0' }}>
            {d}
          </div>
        ))}
        {cells.map((d, idx) => {
          if (d === null) return <span key={idx} />;
          const iso = toIso(year, month, d);
          const inRange = iso >= startIso && iso <= endIso;
          const isEdge = iso === startIso || iso === endIso;
          return (
            <button
              type="button"
              key={idx}
              onClick={() => onDayClick(iso)}
              style={{
                width: 32,
                height: 30,
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--fs-13)',
                cursor: 'pointer',
                background: isEdge
                  ? 'var(--accent)'
                  : inRange
                  ? 'var(--accent-soft)'
                  : 'transparent',
                color: isEdge ? 'var(--on-accent)' : 'var(--text)',
                fontWeight: isEdge ? 600 : 400,
              }}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NavArrow({ direction, onClick }: { direction: 'prev' | 'next'; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={direction === 'prev' ? 'Previous month' : 'Next month'}
      onClick={onClick}
      style={{
        width: 24,
        height: 24,
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        color: 'var(--text-muted)',
        fontSize: 'var(--fs-14)',
        lineHeight: 1,
      }}
    >
      {direction === 'prev' ? '‹' : '›'}
    </button>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

type PresetKey = 'last-7' | 'last-30' | 'this-month' | 'last-month' | 'ytd';

function PresetColumn({ onPick }: { onPick: (k: PresetKey) => void }) {
  const items: Array<{ key: PresetKey; label: string }> = [
    { key: 'last-7', label: 'Last 7 days' },
    { key: 'last-30', label: 'Last 30 days' },
    { key: 'this-month', label: 'This month' },
    { key: 'last-month', label: 'Last month' },
    { key: 'ytd', label: 'Year to date' },
  ];
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        paddingRight: 12,
        borderRight: '1px solid var(--divider)',
        minWidth: 130,
      }}
    >
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          onClick={() => onPick(it.key)}
          style={{
            textAlign: 'left',
            padding: '8px 10px',
            border: 'none',
            background: 'transparent',
            borderRadius: 'var(--radius-sm)',
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--fs-13)',
            color: 'var(--text)',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover-bg-tint)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

function computePreset(k: PresetKey): { startDate: string; endDate: string } {
  const now = new Date();
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const iso = (d: Date) => toIso(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  switch (k) {
    case 'last-7': {
      const start = new Date(today);
      start.setUTCDate(start.getUTCDate() - 6);
      return { startDate: iso(start), endDate: iso(today) };
    }
    case 'last-30': {
      const start = new Date(today);
      start.setUTCDate(start.getUTCDate() - 29);
      return { startDate: iso(start), endDate: iso(today) };
    }
    case 'this-month': {
      const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      return { startDate: iso(start), endDate: iso(today) };
    }
    case 'last-month': {
      const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
      const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
      return { startDate: iso(start), endDate: iso(end) };
    }
    case 'ytd': {
      const start = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
      return { startDate: iso(start), endDate: iso(today) };
    }
  }
}

function formatRange(startIso: string, endIso: string): string {
  const s = parseIso(startIso);
  const e = parseIso(endIso);
  const sameYear = s.getUTCFullYear() === e.getUTCFullYear();
  if (sameYear) {
    return `${DAY_LABEL.format(s)} – ${DAY_LABEL.format(e)}, ${e.getUTCFullYear()}`;
  }
  return `${DAY_YEAR_LABEL.format(s)} – ${DAY_YEAR_LABEL.format(e)}`;
}
