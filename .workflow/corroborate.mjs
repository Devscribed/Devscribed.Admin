/* Which findings more than one independent arm raised.
   A three-item ground truth ranks recall against three defects; it says nothing about the
   other four to seven blockers an arm returns. Independent agreement is the cheapest
   available evidence that a finding is real: arms share the diff and the spec, not a session. */
import { readFileSync, existsSync } from 'node:fs';

const ARMS = [
  ['E1', 'D:/git_repos/ds-lab-e1/.workflow/runs/lab-E1/review.verdict.json'],
  ['E2', 'D:/git_repos/ds-lab-e2/.workflow/runs/lab-E2/review.verdict.json'],
  ['E3', 'D:/git_repos/ds-lab-e3/.workflow/runs/lab-E3/review.verdict.json'],
  ['E4', 'D:/git_repos/ds-lab-e4/.workflow/runs/lab-E4/review.verdict.json'],
  ['E5', 'D:/git_repos/ds-lab-e5/.workflow/runs/lab-E5/review.verdict.json'],
  ['E6', 'D:/git_repos/ds-lab-e6/.workflow/runs/lab-E6/review.verdict.json'],
  ['E7', 'D:/git_repos/ds-lab-e7/.workflow/runs/lab-E7/review.verdict.json'],
  ['E8', 'D:/git_repos/ds-lab-e8/.workflow/runs/lab-E8/review.verdict.json'],
  ['E9', 'D:/git_repos/ds-lab-e9/.workflow/runs/lab-E9/review.verdict.json'],
  ['E10', 'D:/git_repos/ds-lab-e10/.workflow/runs/lab-E10/review.verdict.json'],
  ['E11', 'D:/git_repos/ds-lab-e11/.workflow/runs/lab-E11/review.verdict.json'],
  ['E12', 'D:/git_repos/ds-lab-e12/.workflow/runs/lab-E12/review.verdict.json'],
  ['E13', 'D:/git_repos/ds-lab-e13/.workflow/runs/lab-E13/review.verdict.json'],
  ['E14', 'D:/git_repos/ds-lab-e14/.workflow/runs/lab-E14/review.verdict.json'],
  ['A3', 'D:/git_repos/ds-lab-review/.workflow/runs/lab-A3/review.verdict.json'],
  ['B3', 'D:/git_repos/ds-lab-slice/.workflow/runs/lab-B3/review.verdict.json'],
];

const STOP = new Set(
  'the a an and or of to in is are was were be been it its this that for on at by with from as not no but if then than so such which what when where who whom whose all any each every some none one two three there here into onto over under between within without across after before during while does do did done has have had having can could may might must shall should will would'.split(
    ' ',
  ),
);
const words = (s) =>
  new Set(
    (s || '')
      .toLowerCase()
      .split(/[^a-z0-9_]+/)
      .filter((w) => w.length > 3 && !STOP.has(w)),
  );
const jaccard = (a, b) => {
  let hit = 0;
  for (const w of a) if (b.has(w)) hit++;
  return hit / (a.size + b.size - hit || 1);
};

const all = [];
for (const [arm, p] of ARMS) {
  if (!existsSync(p)) continue;
  const v = JSON.parse(readFileSync(p, 'utf8'));
  for (const f of v.findings ?? [])
    all.push({
      arm,
      id: f.id,
      sev: f.severity === 'note' || f.severity === 'info' ? 'note' : 'BLOCK',
      target: f.target,
      file: (f.file || '?').split('/').pop(),
      claim: (f.claim || '').replace(/\s+/g, ' '),
      w: words(`${f.file} ${f.symbol} ${f.claim}`),
    });
}

const clusters = [];
for (const f of all) {
  const hit = clusters.find(
    (c) => c.members.some((m) => m.file === f.file && m.arm !== f.arm && jaccard(m.w, f.w) > 0.22),
  );
  if (hit) hit.members.push(f);
  else clusters.push({ members: [f] });
}

const armsOf = (c) => [...new Set(c.members.map((m) => m.arm))];
clusters.sort((a, b) => armsOf(b).length - armsOf(a).length || b.members.length - a.members.length);

const present = ARMS.filter(([, p]) => existsSync(p)).map(([a]) => a);
console.log(`${all.length} findings across ${present.length} arms: ${present.join(' ')}\n`);

let corroborated = 0;
for (const c of clusters) {
  const as = armsOf(c);
  if (as.length < 2) continue;
  corroborated++;
  const blockedBy = c.members.filter((m) => m.sev === 'BLOCK').map((m) => m.arm);
  console.log(`${'●'.repeat(as.length)} ${as.length} arms · ${c.members[0].file}`);
  console.log(`   ${c.members[0].claim.slice(0, 150)}`);
  console.log(`   blocked by: ${blockedBy.length ? [...new Set(blockedBy)].join(' ') : '(nobody — note everywhere)'}`);
  console.log(`   raised by:  ${c.members.map((m) => `${m.arm}/${m.id}/${m.sev}`).join(' ')}\n`);
}

console.log(`— ${corroborated} clusters seen by two or more arms; ${clusters.length - corroborated} seen once.\n`);
/* Blockers are what retry the loop; notes only reach the human at the end. An arm's blocker
   precision is the number that decides how much work a wrong verdict creates. */
console.log('arm    blockers  agreed  alone');
for (const a of present) {
  const bl = clusters.filter((c) => c.members.some((m) => m.arm === a && m.sev === 'BLOCK'));
  const agreed = bl.filter((c) => armsOf(c).length >= 2);
  console.log(`${a.padEnd(5)} ${String(bl.length).padStart(8)}  ${String(agreed.length).padStart(6)}  ${String(bl.length - agreed.length).padStart(5)}`);
}
console.log('');

const tbl = present.map((a) => {
  const mine = clusters.filter((c) => armsOf(c).length >= 2 && c.members.some((m) => m.arm === a));
  const solo = clusters.filter((c) => armsOf(c).length === 1 && c.members[0].arm === a);
  return { a, found: mine.length, of: corroborated, solo: solo.length };
});
console.log('arm    agreed   solo   agreed:solo');
for (const r of tbl)
  console.log(
    `${r.a.padEnd(5)} ${String(r.found).padStart(5)}/${r.of}  ${String(r.solo).padStart(5)}   ${(r.solo ? r.found / r.solo : r.found).toFixed(2).padStart(6)}`,
  );
console.log([
  '',
  'Solo findings are unconfirmed: either the one arm that saw it looked hardest, or nobody else',
  'agrees. The ratio is the cheapest available proxy for precision.',
].join(String.fromCharCode(10)));
