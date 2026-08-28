#!/usr/bin/env node
/**
 * Puts a person into an organization, because the product cannot yet.
 *
 * There is no invite flow — that is user-management spec 04, and until it lands
 * `POST /api/signup` is the only way to mint an account, which always creates an
 * organization of its own. `Membership.accountId` is unique, so an account cannot hold a
 * second membership either. The only honest move left is to register the account normally
 * and then **move** the membership signup just created, which is exactly what an invite
 * will do in one step later.
 *
 * So this is two calls, and it uses `POST /api/test/memberships` for the second — the same
 * fenced fixture the E2E suite uses. On a deployment that needs the token *and* a session
 * that already administers the target organization; holding the token alone is not
 * authority over anything. See apps/api/src/test-support/fixture-gate.ts.
 *
 *   node scripts/add-member.mjs --url https://… --token <t> \
 *     --as admin@example.com --as-password 'secret' \
 *     --email new.person@example.com --first Ivan --last Petrov --role manager
 *
 *   make member-dev EMAIL=new.person@example.com FIRST=Ivan LAST=Petrov ROLE=manager \
 *     AS=admin@example.com AS_PASSWORD='secret'
 *
 * Roles: admin, manager, user, viewer. Omit `--role` to leave it at whatever signup gave
 * them, which is `admin` — rarely what you want, so it is worth naming one.
 *
 * **This script goes away with spec 04.** When an admin can invite from the Members screen,
 * that is the way to do this, and both this file and the fixture behind it are deleted.
 */

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const [key, inline] = process.argv[i].split('=', 2);
  if (!key.startsWith('--')) continue;
  args.set(key.slice(2), inline ?? process.argv[++i]);
}

const BASE = (args.get('url') ?? process.env.SEED_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const TOKEN = args.get('token') ?? process.env.SEED_FIXTURE_TOKEN ?? '';

const ADMIN = args.get('as');
const ADMIN_PASSWORD = args.get('as-password');
const EMAIL = args.get('email');
const FIRST = args.get('first') ?? 'New';
const LAST = args.get('last') ?? 'Member';
const ROLE = args.get('role');
// Their own password, not the admin's. Defaults to the one `seed-demo.mjs` uses so the
// demo organization stays a single password to remember.
const PASSWORD = args.get('password') ?? 'Teammerly2026';

const missing = [
  ['--as', ADMIN],
  ['--as-password', ADMIN_PASSWORD],
  ['--email', EMAIL],
].filter(([, value]) => !value);

if (missing.length > 0) {
  process.stderr.write(`\nMissing: ${missing.map(([flag]) => flag).join(', ')}\n\n`);
  process.exit(2);
}

async function call(path, { method = 'GET', body, cookies = [], fixture = false } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (cookies.length) headers.cookie = cookies.join('; ');
  if (fixture && TOKEN) headers.authorization = `Bearer ${TOKEN}`;

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    // Always JSON.stringify here rather than handing raw text to a shell: a non-ASCII name
    // typed at a Windows prompt arrives mangled otherwise, and the API then rejects it as
    // an invalid name, which reads like a bug in the product and is not one.
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }

  return {
    ok: response.ok,
    status: response.status,
    json,
    text,
    cookies: (response.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]),
  };
}

function fail(label, response) {
  const detail = response.text.length > 300 ? `${response.text.slice(0, 300)}…` : response.text;
  process.stderr.write(`\n${label} failed — ${response.status} ${detail}\n\n`);
  process.exit(1);
}

async function main() {
  const login = await call('/api/login', {
    method: 'POST',
    body: { email: ADMIN, password: ADMIN_PASSWORD },
  });
  if (!login.ok) fail(`sign in as ${ADMIN}`, login);

  const signup = await call('/api/signup', {
    method: 'POST',
    body: {
      orgName: `Holding org for ${EMAIL}`,
      firstName: FIRST,
      lastName: LAST,
      email: EMAIL,
      password: PASSWORD,
      timezone: 'Europe/Minsk',
    },
  });
  // 409 means the account already exists, which is fine: this script can also be used to
  // move somebody who signed up on their own.
  if (!signup.ok && signup.status !== 409) fail(`register ${EMAIL}`, signup);
  const registered = signup.ok;

  const moved = await call('/api/test/memberships', {
    method: 'POST',
    cookies: login.cookies,
    fixture: true,
    body: { email: EMAIL, ...(ROLE === undefined ? {} : { role: ROLE }) },
  });
  if (!moved.ok) {
    if (moved.status === 404 && !TOKEN) {
      process.stderr.write(
        `\nThe fixture answered 404 and no token was given. On a deployment these routes ` +
          `are shut without one — use \`make member-dev\`, which fetches it.\n\n`,
      );
      process.exit(1);
    }
    fail(`move ${EMAIL} into ${ADMIN}'s organization`, moved);
  }

  process.stdout.write(
    `\n  ${moved.json.name} — ${EMAIL} — ${moved.json.role}\n` +
      `  ${registered ? `password ${PASSWORD}` : 'kept their existing password'}\n\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`\n${error.message}\n\n`);
  process.exit(1);
});
