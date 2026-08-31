import React from 'react';
import { FieldLabel } from './FormField.jsx';

/* 'hh:mm aa', upper-cased, on 30-minute steps (timeIntervals={30}). */
const pickerLabel = (m) => {
  const h24 = Math.floor(m / 60) % 24;
  const h = ((h24 + 11) % 12) + 1;
  return String(h).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0') + ' ' + (h24 < 12 ? 'AM' : 'PM');
};

/* CustomTimePicker.module.scss: .picker{width:100%;min-width:125px} — the rendered 165px come
   from the input's own intrinsic size (measured in prod-screens/03.png, 2x). Popup:
   .react-datepicker__time-container 120px, header hidden, radius .3rem, time-box padding 5,
   list items radius 6px, selected item $appBlue. filterTime hides times after now on today.
   .nextDayTooltip and .futureError are absolutely positioned inside .picker. */
export function TimeField({ label, value, onChange, isToday, now = new Date().getHours() * 60 + new Date().getMinutes(), error, errorMessage, nextDay, width = 165, inputWidth = '100%' }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);
  const times = [];
  for (let m = 0; m < 1440; m += 30) if (!isToday || m <= now) times.push(m);
  const borderColor = error ? 'var(--status-error)' : open ? 'var(--color-blue)' : 'var(--border-default)';
  return (
    <div ref={ref} style={{ width }}>
      <FieldLabel>{label}</FieldLabel>
      <div style={{ position: 'relative' }}>
        <input
          readOnly
          onClick={() => setOpen((o) => !o)}
          value={typeof value === 'number' ? pickerLabel(value) : value}
          style={{ display: 'block', width: inputWidth, minHeight: 44, fontFamily: 'var(--font-family-base)', fontSize: 'var(--font-size-s)', color: '#000', backgroundColor: '#fff', border: '1.5px solid ' + borderColor, borderRadius: 'var(--radius-l)', padding: 10, outline: 'none', boxShadow: error ? 'var(--shadow-error-glow)' : open ? 'var(--shadow-focus-input)' : 'none', boxSizing: 'border-box', cursor: 'pointer' }}
        />
        {nextDay && (
          <div style={{ position: 'absolute', width: 50, height: 18, top: -12, right: -10, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--color-blue)', color: '#fff', fontSize: 8, fontWeight: 600, borderRadius: 8 }}>Next day</div>
        )}
        {error && errorMessage && (
          <span style={{ position: 'absolute', fontSize: 10, bottom: -20, left: 0, color: 'var(--status-error)' }}>{errorMessage}</span>
        )}
        {open && (
          <div style={{ position: 'absolute', top: '100%', marginTop: 4, zIndex: 20, background: '#fff', border: '1px solid var(--border-default)', boxShadow: '0 6px 12px rgb(0 0 0 / 18%)', width: 120, borderRadius: '0.3rem', padding: 5, maxHeight: 200, overflowY: 'auto' }}>
            {times.map((m) => {
              const isSelected = m === value;
              return (
                <div key={m} onClick={() => { onChange && onChange(m); setOpen(false); }}
                  style={{ padding: '5px 10px', borderRadius: 6, fontSize: 12.8, fontFamily: 'var(--font-family-base)', color: isSelected ? '#fff' : '#1B1B1B', backgroundColor: isSelected ? 'var(--color-blue)' : 'transparent', cursor: 'pointer' }}>{pickerLabel(m)}</div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
