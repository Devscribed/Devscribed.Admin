#!/usr/bin/env node
/**
 * Writes teams and people in different countries **straight into the database**, local or
 * remote.
 *
 * This is the seeder `seed-teams.mjs` is not. That one drives the product's own API — invite,
 * accept, PUT — which is the better way to build a demo and the reason its docstring argues
 * against this file existing: a seeder that inserts rows can produce states the product
 * cannot, and then the demo is of the seeder. It is written down here rather than in a
 * commit message because the next person to reach for this file should know which one they
 * wanted. What this buys, and what it was asked for, is the case the API route cannot serve:
 * putting people into an organization that already exists, on a database nobody is running a
 * web server against.
 *
 * It stays as close to the product as an insert can. Roles are the four the product accepts,
 * passwords are bcrypt hashes made by the same library the signup service uses, and every row
 * it writes is one the API itself would have written — no statuses, no columns and no
 * combinations that no route can produce.
 *
 *   # local, against apps/api/.env
 *   node scripts/seed-db.mjs --org-name "Acme Software BY"
 *
 *   # remote — the URL is the whole mechanism, and a non-local host must be confirmed
 *   node scripts/seed-db.mjs --database-url "postgresql://…@ep-x.neon.tech/db?sslmode=require" \
 *     --org-name "Acme" --yes
 *
 *   SEED_DATABASE_URL=… node scripts/seed-db.mjs --list   # what organizations are there
 *
 * Re-running it is safe: people are keyed by a fixed address and projects by name, so a
 * second run updates the rows it made rather than making a second set.
 */

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';

const HERE = dirname(fileURLToPath(import.meta.url));
const API = resolve(HERE, '..', 'apps', 'api');
/* The client, the adapter and bcrypt all come from the API's own node_modules — the same
   copies the server runs, so a hash this writes is one that server verifies. */
const req = createRequire(resolve(API, 'package.json'));

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const [key, inline] = process.argv[i].split('=', 2);
  if (!key.startsWith('--')) continue;
  const name = key.slice(2);
  const next = process.argv[i + 1];
  if (inline !== undefined) args.set(name, inline);
  else if (next === undefined || next.startsWith('--')) args.set(name, 'true');
  else { args.set(name, next); i += 1; }
}

/** `DATABASE_URL="…"` out of an env file, without pulling in a parser. */
function fromEnvFile(path) {
  try {
    const line = readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .find((row) => row.startsWith('DATABASE_URL='));
    if (!line) return '';
    return line.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '');
  } catch {
    return '';
  }
}

const URL_ =
  args.get('database-url') ||
  process.env.SEED_DATABASE_URL ||
  process.env.DATABASE_URL ||
  fromEnvFile(resolve(API, '.env'));

if (!URL_) {
  process.stderr.write('\nNo database. Pass --database-url, or set SEED_DATABASE_URL.\n\n');
  process.exit(1);
}

const HOST = (() => {
  try { return new URL(URL_).host; } catch { return 'unreadable'; }
})();
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(HOST);

const PASSWORD = args.get('password') ?? 'Teammerly2026';
const DOMAIN = args.get('domain') ?? 'seed.teammerly.test';

/* ------------------------------------------------------------------ *
 * What it writes
 * ------------------------------------------------------------------ */

/**
 * Five countries and one absence of one, chosen for what each makes reachable rather than
 * for variety: four the holiday provider covers, one it does not, and one person who states
 * none.
 */
const PEOPLE = [
  { firstName: 'Anna', lastName: 'Nowak', local: 'anna', role: 'user', countryCode: 'PL', jobTitle: 'Frontend engineer' },
  { firstName: 'Piotr', lastName: 'Kowalski', local: 'piotr', role: 'user', countryCode: 'PL', jobTitle: 'QA engineer' },
  { firstName: 'James', lastName: 'Carter', local: 'james', role: 'manager', countryCode: 'US', jobTitle: 'Account manager' },
  { firstName: 'Lena', lastName: 'Fischer', local: 'lena', role: 'user', countryCode: 'DE', jobTitle: 'Designer' },
  { firstName: 'Marta', lastName: 'Sousa', local: 'marta', role: 'user', countryCode: 'PT', jobTitle: 'Support' },
  /* The provider covers no holidays for India — this row is what the `could not be sourced`
     warning is drawn for, and without it that state is unreachable by hand. */
  { firstName: 'Priya', lastName: 'Sharma', local: 'priya', role: 'user', countryCode: 'IN', jobTitle: 'Data engineer' },
  /* States none: PATCH-012's person, who receives the global holidays and nothing else. */
  { firstName: 'Sam', lastName: 'Okafor', local: 'sam', role: 'user', countryCode: null, jobTitle: 'Contractor' },
];

/**
 * Absences, so the calendar has bands and the load strip has something to subtract. Offsets
 * are days from today, so a run in any month lands them inside the month it is run in and the
 * next: approved and pending together, one that straddles a month boundary, and one already
 * past — the row that proves a window shows what it holds rather than everything.
 */
const ABSENCES = [
  { local: 'anna', from: 3, to: 9, status: 'approved' },
  { local: 'piotr', from: 10, to: 12, status: 'pending' },
  { local: 'james', from: -6, to: -2, status: 'approved' },
  { local: 'lena', from: 1, to: 20, status: 'approved' },
  { local: 'marta', from: 14, to: 18, status: 'pending' },
  { local: 'priya', from: 24, to: 28, status: 'pending' },
];

/** Overlapping on purpose, and one person on nothing: `Unassigned` has to collect somebody. */
const TEAMS = [
  { name: 'Platform', key: 'PLAT', members: ['anna', 'piotr', 'james'] },
  { name: 'Design & Support', key: 'DES', members: ['lena', 'marta', 'piotr'] },
  { name: 'Data', key: 'DATA', members: ['priya', 'james'] },
];

/* ------------------------------------------------------------------ *
 * Run
 * ------------------------------------------------------------------ */

const step = (message) => process.stdout.write(`  ${message}\n`);

/** `n` days from today at UTC midnight — a `@db.Date` column stores a day, not an instant. */
function dayFromToday(offset) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset));
}

/** Mon–Fri in an inclusive range, which is what `workingDays` freezes at submission. */
function workingDaysBetween(start, end) {
  let count = 0;
  for (const day = new Date(start); day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
    const weekday = day.getUTCDay();
    if (weekday !== 0 && weekday !== 6) count += 1;
  }
  return count;
}

const ymd = (date) => date.toISOString().slice(0, 10);

async function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((done) => rl.question(question, done));
  rl.close();
  return answer.trim().toLowerCase() === 'yes';
}

async function main() {
  const { PrismaClient } = req('@prisma/client');
  const { PrismaPg } = req('@prisma/adapter-pg');
  const bcrypt = req('bcryptjs');

  process.stdout.write(`\nDatabase: ${HOST}${LOCAL ? ' (local)' : '  ** NOT LOCAL **'}\n\n`);

  // A remote database is somebody's real data. `--yes` is for a script that already knows;
  // a person at a terminal is asked, and the default is no.
  if (!LOCAL && args.get('yes') !== 'true') {
    const ok = process.stdin.isTTY
      ? await confirm(`Write seed rows into ${HOST}? Type "yes" to continue: `)
      : false;
    if (!ok) {
      process.stderr.write('\nStopped. Re-run with --yes to write to a non-local database.\n\n');
      process.exit(1);
    }
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL_ }) });

  try {
    const organizations = await prisma.organization.findMany({
      select: { id: true, name: true, _count: { select: { memberships: true } } },
      orderBy: { createdAt: 'desc' },
    });

    if (args.get('list') === 'true') {
      process.stdout.write('Organizations\n');
      for (const org of organizations) {
        step(`${org.id}  ${org._count.memberships} member(s)  ${org.name}`);
      }
      process.stdout.write('\n');
      return;
    }

    const wantedId = args.get('org');
    const wantedName = args.get('org-name');
    let matches = organizations;
    if (wantedId) matches = organizations.filter((org) => org.id === wantedId);
    else if (wantedName) {
      const needle = wantedName.toLowerCase();
      matches = organizations.filter((org) => org.name.toLowerCase().includes(needle));
    }

    if (matches.length !== 1) {
      process.stderr.write(
        `\n${matches.length} organizations match. Name one with --org <id>, or list them with --list:\n\n`,
      );
      for (const org of matches.slice(0, 20)) {
        process.stderr.write(`  ${org.id}  ${org._count.memberships} member(s)  ${org.name}\n`);
      }
      process.stderr.write('\n');
      process.exit(1);
    }

    const org = matches[0];
    process.stdout.write(`Organization\n`);
    step(`${org.name} — ${org.id}`);

    // Whoever is the admin there already owns everything this writes: `createdByAccountId`
    // and `assignedByAccountId` are audit columns and must name a real account of this
    // organization, never an account this script invents.
    const owner = await prisma.membership.findFirst({
      where: { organizationId: org.id, role: { in: ['admin'] }, status: 'active' },
      include: { account: { select: { id: true, email: true } } },
      orderBy: { joinedAt: 'asc' },
    });
    if (!owner) throw new Error(`${org.name} has no active admin to attribute the rows to`);
    step(`attributing to ${owner.account.email}`);

    const passwordHash = await bcrypt.hash(PASSWORD, 10);

    process.stdout.write('\nPeople\n');
    const byLocal = new Map();
    for (const person of PEOPLE) {
      const email = `${person.local}@${DOMAIN}`;
      const account = await prisma.account.upsert({
        where: { email },
        create: {
          email,
          passwordHash,
          firstName: person.firstName,
          lastName: person.lastName,
          timezone: 'Europe/Warsaw',
        },
        update: { firstName: person.firstName, lastName: person.lastName },
        select: { id: true },
      });

      // `accountId` is unique on Membership: one account belongs to one organization, which
      // is the product's own rule and the reason this upserts on it rather than creating.
      const membership = await prisma.membership.upsert({
        where: { accountId: account.id },
        create: {
          accountId: account.id,
          organizationId: org.id,
          role: person.role,
          status: 'active',
          jobTitle: person.jobTitle,
          countryCode: person.countryCode,
        },
        update: {
          organizationId: org.id,
          role: person.role,
          status: 'active',
          jobTitle: person.jobTitle,
          countryCode: person.countryCode,
        },
        select: { id: true },
      });

      byLocal.set(person.local, membership.id);
      step(`${person.firstName} ${person.lastName} — ${email} — ${person.role} — ${person.countryCode ?? 'no country'}`);
    }

    process.stdout.write('\nTeams\n');
    for (const team of TEAMS) {
      const existing = await prisma.project.findFirst({
        where: { organizationId: org.id, name: team.name },
        select: { id: true },
      });
      const project = existing
        ? existing
        : await prisma.project.create({
          data: {
            organizationId: org.id,
            name: team.name,
            status: 'active',
            key: team.key,
            createdByAccountId: owner.account.id,
          },
          select: { id: true },
        });

      for (const local of team.members) {
        const membershipId = byLocal.get(local);
        await prisma.projectMember.upsert({
          where: { projectId_membershipId: { projectId: project.id, membershipId } },
          create: {
            projectId: project.id,
            membershipId,
            assignedByAccountId: owner.account.id,
          },
          update: {},
        });
      }
      step(`${team.name} — ${team.members.length} member(s)`);
    }

    process.stdout.write('\nTime off\n');
    for (const absence of ABSENCES) {
      const membershipId = byLocal.get(absence.local);
      const startDate = dayFromToday(absence.from);
      const endDate = dayFromToday(absence.to);
      const workingDays = workingDaysBetween(startDate, endDate);

      // Keyed by the person and the first day, so a second run updates its own row rather
      // than stacking a second holiday on the same dates — which the product would refuse
      // as an overlap.
      const existing = await prisma.vacationRequest.findFirst({
        where: { membershipId, startDate },
        select: { id: true },
      });

      const data = {
        membershipId,
        startDate,
        endDate,
        workingDays,
        // This script writes no rates, so there is nothing to hold — which is exactly what a
        // request by a member with no financial settings holds. Inventing money nobody
        // agreed to would be worse than a zero.
        deductionAmount: 0,
        status: absence.status,
        // An approved request carries who reviewed it and when; a pending one carries
        // neither. Writing them on a pending row would be a state no route can produce.
        ...(absence.status === 'approved'
          ? { reviewedAt: new Date(), reviewedByAccountId: owner.account.id }
          : { reviewedAt: null, reviewedByAccountId: null }),
      };

      const request = existing
        ? await prisma.vacationRequest.update({ where: { id: existing.id }, data, select: { id: true } })
        : await prisma.vacationRequest.create({ data, select: { id: true } });

      // Approval writes a debit against the reserve (spec 09), zero for the same reason the
      // deduction is. It exists because an approved request without one is a state the
      // approval route never leaves behind.
      if (absence.status === 'approved') {
        const held = await prisma.vacationReserveTransaction.findFirst({
          where: { vacationRequestId: request.id, type: 'debit' },
          select: { id: true },
        });
        if (!held) {
          await prisma.vacationReserveTransaction.create({
            data: {
              membershipId,
              type: 'debit',
              amount: 0,
              vacationRequestId: request.id,
              description: `Vacation ${ymd(startDate)} – ${ymd(endDate)}`,
              isAutoGenerated: false,
              createdByAccountId: owner.account.id,
            },
          });
        }
      }

      step(`${absence.local} — ${ymd(startDate)} → ${ymd(endDate)} — ${workingDays} working day(s) — ${absence.status}`);
    }

    process.stdout.write('\nDone.\n');
    process.stdout.write(`\n  Every seeded person signs in with: ${PASSWORD}\n`);
    process.stdout.write(
      '\n  Settings › Holidays now sources PL, US, DE, PT and IN beside whatever was there —' +
      '\n  IN is the one the provider does not cover. Sam Okafor states no country and receives' +
      '\n  the global days only. Time off › Calendar has three teams, Sam is on none of them,' +
      '\n  and six absences — approved and pending, one already past — sit around today.\n\n',
    );
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main().catch((error) => {
  process.stderr.write(`\n${error.message}\n\n`);
  process.exit(1);
});
