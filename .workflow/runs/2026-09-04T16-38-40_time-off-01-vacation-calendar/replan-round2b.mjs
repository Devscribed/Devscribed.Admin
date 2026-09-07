/** H-12: every task touching authorization says what it does with both stored role values. */
import { readFileSync, writeFileSync } from 'node:fs';

const path = new URL('./handoff.json', import.meta.url);
const h = JSON.parse(readFileSync(path, 'utf8'));
const task = (id) => h.tasks.find((x) => x.id === id);

task('T4').detail += ' AUTHORIZATION: both capability checks are handed the NORMALIZED role - '
  + "can(normalizeRole(caller.role), 'view-holidays') and can(normalizeRole(caller.role), "
  + "'manage-holidays'). The database stores admin or member; the target set is admin | manager | "
  + "user | viewer. 'admin' normalizes to admin and holds both; a stored 'member' normalizes to "
  + 'user, which holds neither, so it is answered 404 on both halves - the same answer a viewer '
  + 'gets, and the same answer the holiday list beside it already gives that row.';

task('T5').detail += " AUTHORIZATION: this route's gate is shipped and unchanged - "
  + "can(caller.role, 'edit-detail') at members.service.ts:415, which is handed the RAW stored "
  + 'value. Leave it that way: normalizing it here would change who may edit a member, which is '
  + 'no part of this spec. Both stored values reach the same decision under the target set - '
  + "'admin' is spelled identically in both enums and holds edit-detail, and a stored 'member' "
  + "holds it under neither reading (can('member', ...) is false because CAPABILITY_MATRIX has no "
  + "'member' row, and normalizeRole('member') is user, which does not hold edit-detail either). "
  + 'The new field therefore buys no new refusal and no new grant (REQ-01-044).';

writeFileSync(path, `${JSON.stringify(h, null, 2)}\n`);
process.stdout.write('H-12 statements added to T4 and T5\n');
