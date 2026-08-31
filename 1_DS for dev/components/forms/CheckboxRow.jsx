import React from 'react';
import { Checkbox } from './Checkbox.jsx';

/* CustomFormikCheckbox renders only the inline-flex wrapper; in the deployed forms the row it
   sits on measures 42px with the 13px native box centred, which together with the 20px form
   rhythm gives the 62px pitch measured on the policies frames. */
export function CheckboxRow({ label, checked, onChange }) {
  return (
    <div style={{ height: 42, display: 'flex', alignItems: 'center' }}>
      <Checkbox label={label} checked={checked} onChange={onChange} />
    </div>
  );
}
