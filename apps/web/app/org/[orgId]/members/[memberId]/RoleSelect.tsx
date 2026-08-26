'use client';

import { Select } from '@/ds';
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
 * `guarded` disables the picker without hiding it (requirement 9's zero-admin guard —
 * the picker stays rendered per the business spec, just non-interactive), and carries
 * the guard message as a native `title` tooltip via `Select`'s prop pass-through —
 * see the design doc's DS gaps for why that is a pass-through rather than a first-class
 * `Select` tooltip prop.
 */
export function RoleSelect({
  memberId,
  value,
  availableRoles,
  disabled,
  guardMessage,
  onChange,
}: {
  memberId: string;
  value: Role;
  availableRoles: Role[];
  disabled: boolean;
  guardMessage?: string;
  onChange: (role: Role) => void;
}) {
  const options = availableRoles.map((role) => ({ value: role, label: ROLE_LABELS[role] }));
  return (
    <Select
      label="Role"
      value={value}
      onChange={(next: string) => onChange(next as Role)}
      options={options}
      disabled={disabled}
      title={disabled ? guardMessage : undefined}
      data-testid={`member-role-select-${memberId}`}
    />
  );
}
