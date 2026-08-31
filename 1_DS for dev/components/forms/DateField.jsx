import React from 'react';
import { FieldLabel } from './FormField.jsx';

/* CustomDatePicker.module.scss: wrapper 140px, react-datepicker popup, day radius 3px,
   selected day blue bg + white 13px/600 text, today 13px/600.
   width is 140 from the module; CustomFormikDatePicker overrides it inline with 200px.
   maxToday is the add/edit-time call site only (minDate now-6mo, maxDate now) — the holiday
   picker passes neither, so no day is disabled there. */
export function DateField({ label, value = 'Mar 18, 2026', width = 140, maxToday = false, today = new Date().getDate() }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);
  /* the popup shows the month of the selected date; calendarStartDay=1 -> Monday first */
  const parsed = new Date(String(value).replace(/^[A-Za-z]{3},\s*/, ''));
  const year = parsed.getFullYear(), month = parsed.getMonth();
  const days = Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, i) => i + 1);
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const monthLabel = parsed.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const selected = parsed.getDate();
  return (
    <div ref={ref} style={{ width, position: 'relative' }}>
      <FieldLabel>{label}</FieldLabel>
      <input
        readOnly
        onClick={() => setOpen((o) => !o)}
        value={value}
        style={{ display: 'block', width: '100%', minHeight: 44, fontFamily: 'var(--font-family-base)', fontSize: 'var(--font-size-s)', color: '#000', backgroundColor: '#fff', border: '1.5px solid ' + (open ? 'var(--color-blue)' : 'var(--border-default)'), borderRadius: 'var(--radius-l)', padding: 10, outline: 'none', boxShadow: open ? 'var(--shadow-focus-input)' : 'none', boxSizing: 'border-box', cursor: 'pointer' }}
      />
      {open && (
        <div style={{ position: 'absolute', top: '100%', marginTop: 4, zIndex: 20, background: '#fff', border: '1px solid var(--border-default)', boxShadow: '0 6px 12px rgb(0 0 0 / 18%)', padding: 8, width: 220, fontFamily: 'var(--font-family-base)' }}>
          <div style={{ textAlign: 'center', fontWeight: 500, color: '#1B1B1B', padding: '4px 0 8px', borderBottom: '1px solid #64748B', marginBottom: 6 }}>{monthLabel}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <div key={i} style={{ textAlign: 'center', fontSize: 12, fontWeight: 450, color: '#1B1B1B' }}>{d}</div>)}
            {Array.from({ length: offset }).map((_, i) => <div key={'b' + i} />)}
            {days.map((d) => {
              const isSelected = d === selected, isToday = maxToday && d === today;
              /* minDate = now - 6 months, maxDate = now -> future days are disabled:
                 $appGrayLight background, opacity .5, not-allowed. */
              const disabled = maxToday && d > today;
              return (
                <div key={d} style={{
                  textAlign: 'center', padding: '4px 0', borderRadius: 3, cursor: disabled ? 'not-allowed' : 'pointer',
                  backgroundColor: isSelected ? 'var(--color-blue)' : disabled ? 'var(--color-gray-light)' : 'transparent',
                  opacity: disabled ? 0.5 : 1,
                  fontSize: isSelected || isToday ? 13 : 12, fontWeight: isSelected || isToday ? 600 : 400,
                  color: isSelected ? '#fff' : '#1B1B1B',
                }}>{d}</div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
