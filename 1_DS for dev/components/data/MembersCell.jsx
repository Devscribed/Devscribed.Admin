import React from 'react';

/** Table cell for a member list: first name plus a "+N" bubble. */
export function MembersCell({ names = [], emptyLabel = 'No members' }) {
  if (!names.length) return <span style={{ color: 'var(--text-secondary)' }}>{emptyLabel}</span>;
  if (names.length === 1) return <span>{names[0]}</span>;
  return (
    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0, overflow: 'hidden' }}>
      <span>{names[0]}</span>
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', width: 32, height: 32, fontSize: 12, backgroundColor: 'rgba(0,0,0,0.08)', marginLeft: 10 }}>+{names.length - 1}</span>
    </span>
  );
}
