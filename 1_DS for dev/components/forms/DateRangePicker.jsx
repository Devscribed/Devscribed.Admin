import React from 'react';

/**
 * DateRangePicker — recreated from components/shared/forms/CustomDateRangePicker: a
 * react-datepicker 4.x range picker whose trigger is CustomDatePickerInput, i.e. a
 * `<button class="form-control" style="color:black">` showing `MMM dd, yyyy - MMM dd, yyyy`.
 * DatePicker props in source: selectsRange, showPopperArrow={false}, monthsShown={1},
 * maxDate={new Date()}, popperPlacement="bottom-start", dateFormat="MMM dd, yyyy".
 *
 * Everything below that CustomDateRangePicker.module.scss does NOT set is the react-datepicker
 * default, reproduced rather than redesigned: .react-datepicker font-size .8rem, radius .3rem;
 * .react-datepicker__day / __day-name width 1.7rem, line-height 1.7rem, margin .166rem;
 * .react-datepicker__month margin .4rem; header padding 8px 0; __current-month .944rem;
 * navigation 32x32 at top 2px with a 9px chevron in #ccc; week starts Sunday (Su…Sa).
 * The overrides it does set: container color $appBlack + 1px $appGrayLight border +
 * `0 6px 12px rgb(0 0 0 / 18%)`; header background #fff + 1px $appGray bottom border;
 * __current-month font-weight 500; __day-name $appBlack / 450; __day radius 3px;
 * __day--in-range / --in-selecting-range / --selected background $appBlue, white 13px/600 text;
 * __day--keyboard-selected transparent; __day--disabled $appGrayLight background, $appBlack
 * text, radius 3px, opacity .5, not-allowed.
 */
const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmt = (d) => `${SHORT[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}, ${d.getFullYear()}`;
const same = (a, b) => a && b && a.toDateString() === b.toDateString();

export function DateRangePicker({ start, end, maxDate, onChange }) {
  const today = maxDate || new Date();
  const [open, setOpen] = React.useState(false);
  const [view, setView] = React.useState(new Date((start || today).getFullYear(), (start || today).getMonth(), 1));
  const ref = React.useRef(null);
  React.useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);

  /* the visible grid always starts on the Sunday of the week containing the 1st */
  const first = new Date(view.getFullYear(), view.getMonth(), 1);
  const gridStart = new Date(first);
  gridStart.setDate(1 - first.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(gridStart); d.setDate(gridStart.getDate() + i); return d; });
  const weeks = Array.from({ length: 6 }, (_, w) => cells.slice(w * 7, w * 7 + 7)).filter((week) => week.some((d) => d.getMonth() === view.getMonth()));
  const nextDisabled = new Date(view.getFullYear(), view.getMonth() + 1, 1) > today;

  const cell = { width: '1.7rem', lineHeight: '1.7rem', margin: '0.166rem', textAlign: 'center', display: 'inline-block', boxSizing: 'content-box' };
  const nav = { position: 'absolute', top: 2, height: 32, width: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', padding: 0, cursor: 'pointer', zIndex: 1 };
  const chev = (dir) => ({ display: 'block', width: 9, height: 9, borderColor: '#ccc', borderStyle: 'solid', borderWidth: '3px 3px 0 0', transform: dir === 'prev' ? 'rotate(225deg)' : 'rotate(45deg)' });

  return (
    <div ref={ref} style={{ position: 'relative', fontFamily: 'var(--font-family-base)' }}>
      <button className="form-control" style={{ color: 'black', textAlign: 'left' }} onClick={() => setOpen((o) => !o)}>
        {start && end ? `${fmt(start)} - ${fmt(end)}` : start ? fmt(start) : ''}
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 20, display: 'inline-block', fontSize: '0.8rem', background: '#fff', color: 'var(--text-primary)', border: '1px solid var(--color-gray-light)', borderRadius: '0.3rem', boxShadow: '0 6px 12px rgb(0 0 0 / 18%)' }}>
          <div style={{ position: 'relative', textAlign: 'center', background: '#fff', borderBottom: '1px solid var(--color-gray)', borderTopLeftRadius: '0.3rem', borderTopRightRadius: '0.3rem', padding: '8px 0' }}>
            <button aria-label="Previous month" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))} style={{ ...nav, left: 2 }}><span style={chev('prev')} /></button>
            <div style={{ marginTop: 0, color: 'var(--text-primary)', fontWeight: 500, fontSize: '0.944rem' }}>{MONTHS[view.getMonth()]} {view.getFullYear()}</div>
            {!nextDisabled && <button aria-label="Next month" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))} style={{ ...nav, right: 2 }}><span style={chev('next')} /></button>}
            <div style={{ whiteSpace: 'nowrap', marginTop: 4 }}>
              {DAY_NAMES.map((d, i) => <span key={i} style={{ ...cell, color: 'var(--text-primary)', fontWeight: 450 }}>{d}</span>)}
            </div>
          </div>
          <div style={{ margin: '0.4rem', textAlign: 'center' }}>
            {weeks.map((week, wi) => (
              <div key={wi} style={{ whiteSpace: 'nowrap' }}>
                {week.map((d) => {
                  const disabled = d > today;
                  const inRange = start && end && d >= start && d <= end;
                  const selected = same(d, start) || same(d, end);
                  const on = inRange || selected;
                  return (
                    <span
                      key={d.toISOString()}
                      onClick={() => { if (disabled) return; if (!start || (start && end)) onChange && onChange([d, null]); else onChange && onChange(d < start ? [d, start] : [start, d]); }}
                      style={{
                        ...cell, borderRadius: 3, cursor: disabled ? 'not-allowed' : 'pointer',
                        backgroundColor: on ? 'var(--color-blue)' : disabled ? 'var(--color-gray-light)' : 'transparent',
                        color: on ? '#fff' : 'var(--text-primary)', opacity: disabled ? 0.5 : 1,
                        fontSize: on ? 13 : undefined, fontWeight: on ? 600 : undefined,
                      }}
                    >
                      {d.getDate()}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
