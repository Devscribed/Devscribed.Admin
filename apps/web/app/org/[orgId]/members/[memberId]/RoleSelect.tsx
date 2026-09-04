'use client';

import { Select } from '@devscribed/ds';
import type { Role } from '@devscribed/validation';

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  manager: 'Manager',
  user: 'User',
  viewer: 'Viewer',
};

/**
 * The Role picker on the member detail form (spec 05 requirement 5). Options come
 * straight from the GET response's `availableRoles` — the server is the single source
 * of truth for which roles a caller may assign to a given target (the admin/manager
 * authority matrix, requirement 8), so this component never re-derives that matrix.
 *
 * `disabled` blocks the picker without hiding it (requirement 9's zero-admin guard — the
 * picker stays rendered per the business spec, just non-interactive). It no longer carries
 * the reason: it used to pass one as a native `title`, which §62 rules out because a
 * `title` is not keyboard-reachable in any major browser — but the fix here is not §62's
 * bubble. The screen already renders the guard message as an `InfoBanner` directly
 * beneath this control, permanently and for every reader, which is what the bubble would
 * have been reaching for. A third copy of one sentence is not an accessibility gain.
 */
export function RoleSelect({
  memberId,
  value,
  availableRoles,
  disabled,
  onChange,
}: {
  memberId: string;
  value: Role;
  availableRoles: Role[];
  disabled: boolean;
  onChange: (role: Role) => void;
}) {
  const options = availableRoles.map((role) => ({ value: role, label: ROLE_LABELS[role] }));
  return (
    <Select
      label="Role"
      value={value}
      onChange={(option) =>
        onChange((typeof option === 'string' ? option : (option as { value: string }).value) as Role)
      }
      options={options}
      isDisabled={disabled}
      variant="formik"
      data-testid={`member-role-select-${memberId}`}
    />
  );
}
