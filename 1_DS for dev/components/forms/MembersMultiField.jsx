import React from 'react';
import { Select } from './Select.jsx';

/* .membersWrapper{position:relative} > span{position:absolute;top:5px;right:0;cursor:pointer;
   font-size:12px;color:$appBlue} — the same block in AddTimeOff*Form, EditPolicyMembersForm
   and EditHolidayMembersForm. */
export function MembersMultiField({ label = 'Members', placeholder, value, onChange, options = [], selectAllLabel = 'Select all' }) {
  return (
    <div style={{ position: 'relative' }}>
      <Select variant="formik" label={label} placeholder={placeholder} isMulti value={value} onChange={onChange} options={options} />
      <span onClick={() => onChange && onChange(options)} style={{ position: 'absolute', top: 5, right: 0, cursor: 'pointer', fontSize: 12, color: 'var(--color-blue)' }}>{selectAllLabel}</span>
    </div>
  );
}
