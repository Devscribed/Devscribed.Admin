#!/usr/bin/env node
/**
 * Fills an organization with **teams and people in different countries**, which is the
 * fixture the Time off screens need and no other seeder makes: `seed-demo.mjs` builds four
 * people who are all in Belarus and no projects at all, so Holidays sources one country,
 * the calendar's Teams scope has nothing to tick, and half of what those screens decide is
 * unreachable by hand.
 *
 * It drives the **public API only**, exactly as the browser does: invite, read the link out
 * of the mail sink, accept. `seed-demo.mjs` reaches for `POST /api/test/memberships`
 * instead, on the reasoning that there is no invite flow — there is one now, and this
 * builds its people through it, so every person here arrived the way a real one does.
 * Nothing writes to the database, so nothing here can build a state the product cannot.
 *
 * The mail sink is the one thing it needs beyond the product's own routes:
 * `GET /api/test/mail/latest` answers only while the API runs the in-memory transport, so
 * against a real deployment this refuses rather than half-building something.
 *
 *   node scripts/seed-teams.mjs                      # a new organization, printed at the end
 *   node scripts/seed-teams.mjs --as you@example.com # into the org that account admins
 *
 * The second form is the useful one while looking at a screen: it signs in as the account
 * given, reads the organization from the session and adds to it. Every address it mints is
 * stamped with the run's own seconds, so running it twice adds a second set rather than
 * colliding on a signup that cannot be undone.
 *
 * What it makes, and why each piece is there:
 *
 * - **BY, PL, US, DE** — four countries the holiday provider covers, so the sourced set has
 *   more than one row and the summary has something to add up.
 * - **IN** — a country the provider does **not** cover, so the `could not be sourced`
 *   warning is reachable without breaking anything.
 * - **one person with no country at all** — PATCH-012's rule made visible: they receive the
 *   global holidays and nothing else, and the summary shows them with a dash.
 * - **three projects with overlapping rosters, and somebody on none of them** — so the
 *   Teams filter has ticks that mean different things and `Unassigned` is not empty.
 */

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const [key, inline] = process.argv[i].split('=', 2);
  if (!key.startsWith('--')) continue;
  // A flag with no value must not swallow the next one: `--absences-only --as x` set
  // `absences-only` to "--as" and then skipped it, so the run built a new organization
  // instead of the one named.
  const next = process.argv[i + 1];
  const takesValue = inline === undefined && next !== undefined && !next.startsWith('--');
  args.set(key.slice(2), inline ?? (takesValue ? process.argv[++i] : ''));
}

const BASE = (args.get('url') ?? process.env.SEED_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const TOKEN = args.get('token') ?? process.env.SEED_FIXTURE_TOKEN ?? '';
const PASSWORD = args.get('password') ?? 'Teammerly2026';
const AS = args.get('as') ?? '';
/* Absences against people an earlier run already added, without adding a second set. */
const ABSENCES_ONLY = args.has('absences-only');
/* Seconds, not minutes: two runs a minute apart is a normal thing to do while trying
   something out, and signup is irreversible. */
const STAMP = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
const DOMAIN = args.get('domain') ?? 'teammerly-demo.test';

const address = (local) => `${local}.${STAMP}@${DOMAIN}`;

/* ------------------------------------------------------------------ *
 * HTTP
 * ------------------------------------------------------------------ */

/** Cookies by hand rather than by a jar — see `seed-demo.mjs`, same trap, same reason. */
async function call(path, { method = 'GET', body, cookies = [], fixture = false } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (cookies.length) headers.cookie = cookies.join('; ');
  if (fixture && TOKEN) headers.authorization = `Bearer ${TOKEN}`;

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  });

  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  const set = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
  return {
    ok: response.ok,
    status: response.status,
    json,
    text,
    cookies: set.map((entry) => entry.split(';')[0]),
  };
}

async function expect(label, promise) {
  const response = await promise;
  if (!response.ok) {
    throw new Error(`${label} — ${response.status} ${response.text.slice(0, 300)}`);
  }
  return response;
}

const step = (message) => process.stdout.write(`  ${message}\n`);

/* ------------------------------------------------------------------ *
 * The organization
 * ------------------------------------------------------------------ */

async function signIn(email) {
  const response = await expect(
    `sign in ${email}`,
    call('/api/login', { method: 'POST', body: { email, password: PASSWORD } }),
  );
  return {
    cookies: response.cookies,
    orgId: response.json.organizationId,
    email,
    name: email,
  };
}

async function register({ firstName, lastName, email, orgName }) {
  const response = await expect(
    `signup ${email}`,
    call('/api/signup', {
      method: 'POST',
      body: { orgName, firstName, lastName, email, password: PASSWORD, timezone: 'Europe/Minsk' },
    }),
  );
  return {
    cookies: response.cookies,
    orgId: response.json.organization.id,
    email,
    name: `${firstName} ${lastName}`,
  };
}

/**
 * Invite, accept, then state the country and the job title.
 *
 * Three calls and a read of the mail sink, because that is the product's own path: the
 * invitation carries the role, accepting it mints the account, and the membership exists
 * only after it. The roster is read back for the id rather than guessed from the accept's
 * body — the id this needs is the membership's, and the accept answers about the account.
 *
 * The country is written through `PUT .../members/{id}` — `Membership.countryCode`, which
 * since PATCH-012 is the only thing that decides which public holidays reach a person. It
 * is **not** the address country on the contract-details profile, which is a different
 * column for a different purpose and which `seed-demo.mjs` is the one that fills.
 */
async function addTeammate(admin, { firstName, lastName, local, role, countryCode, jobTitle }) {
  const email = address(local);

  await expect(
    `invite ${email}`,
    call('/api/invitations', { method: 'POST', cookies: admin.cookies, body: { email, role } }),
  );

  const mail = await expect(
    `invitation mail for ${email}`,
    // Token-fenced: it hands out live invitation tokens, so against anything but a local
    // run this needs `--token`, and without one it refuses rather than half-building.
    call(`/api/test/mail/latest?email=${encodeURIComponent(email)}&type=invitation`, {
      fixture: true,
    }),
  );

  await expect(
    `accept for ${email}`,
    call('/api/invitations/accept', {
      method: 'POST',
      body: {
        token: mail.json.token,
        firstName,
        lastName,
        password: PASSWORD,
        timezone: 'Europe/Minsk',
      },
    }),
  );

  const roster = await expect(
    `roster after ${email}`,
    call(`/api/organizations/${admin.orgId}/members`, { cookies: admin.cookies }),
  );
  const rows = roster.json.members ?? roster.json;
  const member = rows.find((row) => row.email === email);
  if (!member) throw new Error(`${email} accepted but is not on the roster`);

  await expect(
    `country and title for ${email}`,
    call(`/api/organizations/${admin.orgId}/members/${member.id}`, {
      method: 'PUT',
      cookies: admin.cookies,
      // `jobTitle` is required by the route; `countryCode` decides holidays, and `null` is
      // the person who states none.
      body: { jobTitle, countryCode },
    }),
  );

  step(`${firstName} ${lastName} — ${email} — ${role} — ${countryCode ?? 'no country'}`);
  return { membershipId: member.id, name: `${firstName} ${lastName}`, email };
}

async function createProject(admin, { name, key, membershipIds }) {
  const created = await expect(
    `project ${name}`,
    call(`/api/organizations/${admin.orgId}/projects`, {
      method: 'POST',
      cookies: admin.cookies,
      body: { name: `${name} ${STAMP.slice(-4)}`, key },
    }),
  );
  const projectId = created.json.project?.id ?? created.json.id;

  if (membershipIds.length) {
    await expect(
      `roster for ${name}`,
      call(`/api/organizations/${admin.orgId}/projects/${projectId}/members`, {
        method: 'POST',
        cookies: admin.cookies,
        body: { membershipIds },
      }),
    );
  }

  step(`${name} — ${membershipIds.length} member(s)`);
  return projectId;
}

/* ------------------------------------------------------------------ *
 * Absences
 *
 * Through the product's own lifecycle, which is the only way an absence can be made from
 * outside the database — and the reason this takes four calls per person rather than one
 * insert:
 *
 *   1. an admin writes the member's financials, because `submit` refuses a member who has
 *      none (`financials_not_configured`);
 *   2. a reserve credit, because available days are derived from the reserve and a member
 *      with an empty one can request nothing. The accrual engine only produces
 *      formula-derived amounts over time, so this is the one step that uses a fixture
 *      route — `POST /api/test/vacation/seed-credit`, the same one spec 09's E2E uses to
 *      state a precise balance;
 *   3. the member submits **for themselves**, signed in as themselves. Submission is
 *      self-only, so an admin cannot do this on anyone's behalf and the seeder holds every
 *      person's session for exactly this;
 *   4. the admin reviews, for the ones that end up approved. Approving your own is
 *      refused, which is why the admin is never one of the people below.
 * ------------------------------------------------------------------ */

/** 4000 a month over 260 working days is ~184.62 a day; 8000 of reserve covers the 28. */
const SALARY = 4000;
const DAYS_PER_YEAR = 28;
const CREDIT = 8000;

const ymd = (date) => date.toISOString().slice(0, 10);

/** Offsets from today, so the absences always land in the window the calendar opens on. */
function dayFromToday(offset) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offset);
  return date;
}

/**
 * Chosen to overlap: two people are away in the same week, so the calendar has a column
 * with more than one absence in it and the metrics strip has something to subtract.
 * `approved` and `pending` in equal measure, because the two are drawn differently and a
 * screen with only one of them tests half the legend.
 */
const ABSENCES = [
  { local: 'anna', from: 7, to: 11, decision: 'approved' },
  { local: 'piotr', from: 9, to: 18, decision: 'pending' },
  { local: 'james', from: 14, to: 25, decision: 'approved' },
  { local: 'lena', from: 2, to: 4, decision: 'pending' },
  { local: 'marina', from: 28, to: 32, decision: 'approved' },
  { local: 'alex', from: 21, to: 23, decision: 'pending' },
];

async function prepareBalance(admin, person) {
  await expect(
    `financials for ${person.name}`,
    call(`/api/organizations/${admin.orgId}/members/${person.membershipId}/vacation/financials`, {
      method: 'PUT',
      cookies: admin.cookies,
      body: {
        monthlySalary: SALARY,
        clientHourlyRate: 60,
        vacationDaysPerYear: DAYS_PER_YEAR,
        currency: 'USD',
        isReservePercentManual: false,
      },
    }),
  );

  await expect(
    `reserve credit for ${person.name}`,
    call('/api/test/vacation/seed-credit', {
      method: 'POST',
      fixture: true,
      body: { email: person.email, amount: CREDIT },
    }),
  );
}

async function addAbsence(admin, person, { from, to, decision }) {
  const startDate = ymd(dayFromToday(from));
  const endDate = ymd(dayFromToday(to));

  // A request may not cross a year end (validation rule 3). Late in December the offsets
  // above would, so the range is pulled back to the last day of the year it starts in
  // rather than silently producing a 400 nobody reads.
  const year = startDate.slice(0, 4);
  const bounded = endDate.slice(0, 4) === year ? endDate : `${year}-12-31`;
  if (bounded < startDate) {
    step(`${person.name} — skipped, no room left in ${year}`);
    return;
  }

  await prepareBalance(admin, person);

  const self = await signIn(person.email);
  const created = await expect(
    `request for ${person.name}`,
    call(`/api/organizations/${self.orgId}/members/${person.membershipId}/vacation/requests`, {
      method: 'POST',
      cookies: self.cookies,
      body: { startDate, endDate: bounded },
    }),
  );
  const requestId = created.json.id;

  if (decision === 'approved') {
    await expect(
      `approval for ${person.name}`,
      call(
        `/api/organizations/${admin.orgId}/members/${person.membershipId}/vacation/requests/${requestId}/review`,
        { method: 'PUT', cookies: admin.cookies, body: { decision: 'approved' } },
      ),
    );
  }

  step(`${person.name} — ${startDate} → ${bounded} — ${decision}`);
}

async function seedAbsences(admin, personOf) {
  process.stdout.write('\nAbsences\n');
  for (const absence of ABSENCES) {
    const person = personOf(absence.local);
    if (!person) {
      step(`${absence.local} — not in this organization, skipped`);
      continue;
    }
    await addAbsence(admin, person, absence);
  }
}

/**
 * `--absences-only`: the people are already here from an earlier run, and running the whole
 * seeder again would add a second set of them. Members are matched by the local part of the
 * address this script mints — `alex.<stamp>@…` — and where a run has been repeated the most
 * recently joined wins, which is the set whose teams and countries are on screen.
 */
async function findSeededPeople(admin) {
  const listed = await expect(
    'members',
    call(`/api/organizations/${admin.orgId}/members`, { cookies: admin.cookies }),
  );
  const members = listed.json.members ?? listed.json;

  const newest = new Map();
  for (const member of members) {
    const local = String(member.email).split('.')[0];
    if (!String(member.email).endsWith(`@${DOMAIN}`)) continue;
    const seen = newest.get(local);
    if (!seen || member.joinedAt > seen.joinedAt) {
      newest.set(local, { membershipId: member.id, name: member.fullName, email: member.email, joinedAt: member.joinedAt });
    }
  }
  return (local) => newest.get(local);
}

/* ------------------------------------------------------------------ *
 * The people
 * ------------------------------------------------------------------ */

/**
 * Five countries and one absence of a country, chosen for what each makes visible rather
 * than for variety: four the provider covers, one it does not, and one person who states
 * none.
 */
const PEOPLE = [
  { firstName: 'Алексей', lastName: 'Каминский', local: 'alex', role: 'user', countryCode: 'BY', jobTitle: 'Backend engineer' },
  { firstName: 'Марина', lastName: 'Ковалёва', local: 'marina', role: 'manager', countryCode: 'BY', jobTitle: 'Delivery manager' },
  { firstName: 'Anna', lastName: 'Nowak', local: 'anna', role: 'user', countryCode: 'PL', jobTitle: 'Frontend engineer' },
  { firstName: 'Piotr', lastName: 'Kowalski', local: 'piotr', role: 'user', countryCode: 'PL', jobTitle: 'QA engineer' },
  { firstName: 'James', lastName: 'Carter', local: 'james', role: 'manager', countryCode: 'US', jobTitle: 'Account manager' },
  { firstName: 'Lena', lastName: 'Fischer', local: 'lena', role: 'user', countryCode: 'DE', jobTitle: 'Designer' },
  // The provider covers no holidays for India, so this row is what the `could not be
  // sourced` warning is drawn for.
  { firstName: 'Priya', lastName: 'Sharma', local: 'priya', role: 'user', countryCode: 'IN', jobTitle: 'Data engineer' },
  // States none: global holidays only, and a dash in the summary's country column.
  { firstName: 'Sam', lastName: 'Okafor', local: 'sam', role: 'user', countryCode: null, jobTitle: 'Contractor' },
];

async function main() {
  process.stdout.write(`\nSeeding teams and countries on ${BASE}\n\n`);

  const health = await call('/api/health');
  if (!health.ok) throw new Error(`${BASE}/api/health answered ${health.status} — is it up?`);

  let admin;
  let adminEmail = AS;
  if (AS) {
    process.stdout.write('Organization\n');
    admin = await signIn(AS);
    step(`signed in as ${AS} — adding to their organization`);
  } else {
    process.stdout.write('Organization\n');
    adminEmail = address('admin');
    admin = await register({
      firstName: 'Иван',
      lastName: 'Демченко',
      email: adminEmail,
      orgName: 'Teammerly Teams',
    });
    // The admin states a country too, or the organization's own holidays are nobody's.
    step(`${admin.name} — ${adminEmail} — admin`);
  }

  if (ABSENCES_ONLY) {
    if (!AS) throw new Error('--absences-only needs --as: there is nobody in a brand new organization.');
    await seedAbsences(admin, await findSeededPeople(admin));
    process.stdout.write('\nDone.\n\n');
    return;
  }

  process.stdout.write('\nPeople\n');
  const people = [];
  for (const person of PEOPLE) {
    people.push(await addTeammate(admin, person));
  }

  const by = (local) => people[PEOPLE.findIndex((person) => person.local === local)].membershipId;

  process.stdout.write('\nTeams\n');
  // Overlapping on purpose: Marina is on two, so a filter ticking both must still count
  // her once — and Sam is on none, which is what `Unassigned` collects.
  await createProject(admin, {
    name: 'Acme Redesign',
    key: 'ACME',
    membershipIds: [by('alex'), by('marina'), by('anna')],
  });
  await createProject(admin, {
    name: 'Internal Tools',
    key: 'TOOLS',
    membershipIds: [by('marina'), by('piotr'), by('lena')],
  });
  await createProject(admin, {
    name: 'Data Platform',
    key: 'DATA',
    membershipIds: [by('james'), by('priya')],
  });

  await seedAbsences(admin, (local) => people[PEOPLE.findIndex((p) => p.local === local)]);

  process.stdout.write('\nDone.\n');
  if (!AS) {
    process.stdout.write(`\n  Sign in: ${adminEmail} / ${PASSWORD}\n`);
  }
  process.stdout.write(
    '\n  Settings › Holidays sources BY, PL, US, DE and IN — IN is the one the provider' +
    '\n  does not cover. Sam Okafor states no country and receives the global days only.' +
    '\n  Time off › Calendar has three teams to filter by, one person on none of them,' +
    '\n  and six absences — three approved, three pending — two of which overlap.\n\n',
  );
}

main().catch((error) => {
  process.stderr.write(`\n${error.message}\n\n`);
  process.exit(1);
});
