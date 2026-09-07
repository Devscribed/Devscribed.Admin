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
  args.set(key.slice(2), inline ?? process.argv[++i]);
}

const BASE = (args.get('url') ?? process.env.SEED_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const TOKEN = args.get('token') ?? process.env.SEED_FIXTURE_TOKEN ?? '';
const PASSWORD = args.get('password') ?? 'Teammerly2026';
const AS = args.get('as') ?? '';
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

  process.stdout.write('\nDone.\n');
  if (!AS) {
    process.stdout.write(`\n  Sign in: ${adminEmail} / ${PASSWORD}\n`);
  }
  process.stdout.write(
    '\n  Settings › Holidays sources BY, PL, US, DE and IN — IN is the one the provider' +
    '\n  does not cover. Sam Okafor states no country and receives the global days only.' +
    '\n  Time off › Calendar has three teams to filter by, and one person on none of them.\n\n',
  );
}

main().catch((error) => {
  process.stderr.write(`\n${error.message}\n\n`);
  process.exit(1);
});
