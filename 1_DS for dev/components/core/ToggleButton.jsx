import React from 'react';

/**
 * ToggleButton — two-value segmented control recreated from components/shared/ToggleButton.
 * ToggleButton.module.scss: .root{position:relative;margin-bottom:20px;max-width:160px},
 * .toggleWrapper{display:flex;flex-wrap:nowrap;background:$appGrayLight;border-radius:20px;
 * height:32px}, >button{flex:1 1 0;centered;background:$appGrayLight;border-radius:20px;
 * font-size:12px}, .activeBtn{height:36px;font-size:13px;font-weight:500;line-height:1;
 * background:#fff;box-shadow:0 2px 4px 0 rgb(0 0 0 / 18%);border-radius:20px;
 * margin-top:-2px;outline:0}. The label uses the global `.input-label` rule.
 * The source declares no :hover / :focus / :disabled state for either button.
 */
export function ToggleButton({ label, value1, value2, selectedValue, onValue1Click, onValue2Click }) {
  const seg = { flex: '1 1 0', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--color-gray-light)', borderRadius: 'var(--radius-pill)', fontSize: 12, color: 'var(--text-primary)', fontFamily: 'var(--font-family-base)', cursor: 'pointer', border: 0 };
  const active = { ...seg, height: 36, fontSize: 13, fontWeight: 'var(--font-weight-medium)', lineHeight: 1, backgroundColor: '#fff', boxShadow: 'var(--shadow-toggle-active)', marginTop: -2, outline: 0 };
  return (
    <div style={{ position: 'relative', marginBottom: 20, maxWidth: 160 }}>
      {label && (
        /* global .input-label */
        <label style={{ display: 'inline-block', padding: '10px 0 0 10px', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-xs)', lineHeight: '21px', color: 'var(--text-secondary)', marginBottom: 'var(--space-1)', whiteSpace: 'nowrap', fontFamily: 'var(--font-family-base)' }}>{label}</label>
      )}
      <div style={{ display: 'flex', flexWrap: 'nowrap', backgroundColor: 'var(--color-gray-light)', borderRadius: 'var(--radius-pill)', height: 32 }}>
        <button type="button" value={value1} onClick={onValue1Click} style={selectedValue === value1 ? active : seg}>{value1}</button>
        <button type="button" value={value2} onClick={onValue2Click} style={selectedValue === value2 ? active : seg}>{value2}</button>
      </div>
    </div>
  );
}
