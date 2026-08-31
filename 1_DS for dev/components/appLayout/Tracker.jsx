import React from 'react';
import { CloseIcon } from '../icons/Icon.jsx';
import { Select } from '../forms/Select.jsx';

/**
 * Floating time tracker (components/tracker). Fixed to the top-right of the viewport.
 * START is disabled until a project is chosen; running swaps the panel to the blue fill.
 */
export function Tracker({ project, setProject, onClose, options = ['Marketing site', 'Mobile app', 'Internal tools'] }) {
  const [active, setActive] = React.useState(false);
  const bg = active ? 'var(--color-tracker-blue)' : '#fff';
  const fg = active ? '#fff' : 'var(--text-primary)';
  return (
    <div style={{ position: 'fixed', top: 100, right: 40, maxWidth: 450, width: 380, background: '#fff', boxShadow: 'var(--shadow-tracker)', borderRadius: 6, zIndex: 9000 }}>
      <button onClick={onClose} style={{ position: 'absolute', top: 10, right: 10, color: 'var(--text-secondary)', width: 14, height: 14, display: 'flex' }}><CloseIcon /></button>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: 30, background: bg, color: fg, borderTopLeftRadius: 6, borderTopRightRadius: 6 }}>
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
          <div onClick={() => { if (project) setActive(!active); }}
            style={{ width: 62, height: 62, minWidth: 62, marginRight: 15, borderRadius: '50%', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: project ? 'pointer' : 'not-allowed', opacity: project ? 1 : 0.6, background: active ? '#fff' : 'var(--color-tracker-blue)', color: active ? 'var(--color-tracker-blue)' : '#fff' }}>
            {active ? 'STOP' : 'START'}
          </div>
          <label style={{ fontSize: 24, marginRight: 10, fontFamily: 'var(--font-family-base)' }}>{project ? (project.label || project) : '-'}</label>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', width: 100 }}>
          <div style={{ fontSize: 24, fontFamily: 'var(--font-family-base)' }}>00:00:00</div>
          <div style={{ fontSize: 12 }}>Today: 00:00:00</div>
        </div>
      </div>
      <div style={{ padding: '25px 0 40px 0', margin: '0 30px', borderTop: '1px solid #eff1f5' }}>
        <Select label="Project" placeholder="Select a project" value={project} onChange={setProject} options={options} isSearchable />
      </div>
    </div>
  );
}
