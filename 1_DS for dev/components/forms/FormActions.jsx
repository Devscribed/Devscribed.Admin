import React from 'react';

/**
 * The button row that closes a form. AddProjectForm/AddTimeForm cap it at 240 and push it
 * right (`marginLeft:auto`), buttons splitting the width evenly; EditTimeForm goes full width
 * with a destructive button pushed left via `leading`.
 */
export function FormActions({ children, leading, maxWidth = 240, align = 'right', gap = 10 }) {
  const full = align === 'full' || !!leading;
  return (
    <div style={{ display: 'flex', width: '100%', maxWidth: full ? '100%' : maxWidth, marginLeft: align === 'left' ? 0 : 'auto', gap }}>
      {leading && <div style={{ marginRight: 'auto' }}>{leading}</div>}
      {React.Children.map(children, (child) => (
        <div style={{ flex: full ? '0 0 auto' : 1, minWidth: full ? 100 : 0 }}>{child}</div>
      ))}
    </div>
  );
}
