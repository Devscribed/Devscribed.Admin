import React from 'react';

/**
 * PageTabs — underline tab row recreated from components/shared/PageTabs.
 */
export function PageTabs({ tabs = [], active, onChange }) {
  const [internal, setInternal] = React.useState(active ?? tabs[0]);
  React.useEffect(() => { setInternal(active ?? tabs[0]); }, [active, tabs.join('|')]);
  const current = active ?? internal;
  return (
    <nav style={{ display: 'flex', flexWrap: 'wrap' }}>
      {tabs.map((tab) => {
        const isActive = tab === current;
        return (
          <a
            key={tab}
            href="#"
            onClick={(e) => { e.preventDefault(); setInternal(tab); onChange && onChange(tab); }}
            style={{ paddingTop: 4, marginRight: 20, cursor: 'pointer' }}
          >
            <span style={{ display: 'block', textTransform: 'uppercase', fontFamily: 'var(--font-family-base)', fontWeight: 'var(--font-weight-medium)', color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)', fontSize: 'var(--font-size-base)', lineHeight: '24px' }}>
              {tab}
            </span>
            {isActive && <div style={{ marginTop: 12, backgroundColor: 'var(--color-blue)', height: 4, borderTopLeftRadius: 6, borderTopRightRadius: 6 }} />}
          </a>
        );
      })}
    </nav>
  );
}
