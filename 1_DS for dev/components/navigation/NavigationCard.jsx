import React from 'react';

/**
 * NavigationCard — recreated from components/reports/ChapterNavigationCard.
 * Fixed 250px-wide clickable card: headLine6 title + 12px description.
 * Hover: border goes transparent, scale(1.01), and the faint box-shadow paints
 * (the -webkit-box-shadow declared before it never wins — see --shadow-card-hover).
 */
export function NavigationCard({ title, description, onClick }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        backgroundColor: '#fff',
        border: `1px solid ${hover ? 'transparent' : 'var(--border-default)'}`,
        borderRadius: 'var(--radius-l)',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        padding: 'var(--space-6)',
        transition: 'var(--transition-card-hover)',
        width: 250,
        transform: hover ? 'scale(1.01)' : 'none',
        boxShadow: hover ? 'var(--shadow-card-hover)' : 'none',
      }}
    >
      <div style={{ fontFamily: 'var(--font-family-base)', fontWeight: 'var(--headline-6-weight)', fontSize: 'var(--headline-6-size)', lineHeight: 'var(--headline-6-line)', letterSpacing: 'var(--headline-6-tracking)', color: 'var(--text-primary)', marginBottom: 'var(--space-1)' }}>{title}</div>
      <div style={{ fontFamily: 'var(--font-family-base)', fontSize: 'var(--font-size-xs)', lineHeight: 'var(--line-height-base)', color: 'var(--text-secondary)' }}>{description}</div>
    </div>
  );
}
