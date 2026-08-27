#!/usr/bin/env node
/**
 * Builds a demo organization on a running environment, so somebody can sign in and walk
 * the whole product without setting anything up first: four people with contract details
 * filled in, three published templates, and four envelopes sitting in four different
 * states — including one that is already signed by everybody and has a PDF behind it.
 *
 * It drives the **public API only**, exactly as the browser does, plus the two fixture
 * routes an E2E run uses for the same reasons it uses them: there is no invite flow yet, so
 * a second person can only be put into an organization through `POST /api/test/memberships`,
 * and the signing link exists nowhere but inside the email, so completing an envelope means
 * reading `GET /api/test/mail`. Both are fenced — see `apps/api/src/test-support/
 * fixture-gate.ts` — so against a deployment this needs the token, and against an
 * environment where the fixtures are shut it will refuse rather than half-build something.
 *
 * Nothing here writes to the database. That is deliberate: a seeder that inserts rows can
 * produce states the product itself cannot, and then the demo is of the seeder.
 *
 *   node scripts/seed-demo.mjs --url https://… --token <fixture token>
 *   make seed-dev
 *
 * Re-running it is safe and always makes a **new** organization: signup is irreversible by
 * design, so addresses are stamped with the run's own timestamp rather than reused.
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
// Seconds, not minutes: two runs a minute apart are a normal thing to do while trying
// something out, and signup is irreversible — a collision would fail the run on its first
// call rather than build a second demo.
const STAMP = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
const DOMAIN = args.get('domain') ?? 'teammerly-demo.test';

const address = (local) => `${local}.${STAMP}@${DOMAIN}`;

/* ------------------------------------------------------------------ *
 * HTTP
 * ------------------------------------------------------------------ */

/**
 * Cookies are carried by hand rather than by a jar. Each person in this script holds their
 * own session and several of them are created back to back — a shared jar would let the
 * last signup silently replace the admin session every later step depends on, which is the
 * same trap `addMemberToOrganization` documents in the E2E helpers.
 */
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

  return {
    status: response.status,
    ok: response.ok,
    json,
    text,
    cookies: (response.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]),
  };
}

async function expect(label, promise) {
  const response = await promise;
  if (!response.ok) {
    const detail = response.text.length > 300 ? `${response.text.slice(0, 300)}…` : response.text;
    throw new Error(`${label} failed — ${response.status} ${detail}`);
  }
  return response;
}

const step = (message) => process.stdout.write(`  ${message}\n`);

/* ------------------------------------------------------------------ *
 * People
 * ------------------------------------------------------------------ */

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
    accountId: response.json.account.id,
    email,
    name: `${firstName} ${lastName}`,
  };
}

/**
 * Signup, then move the membership signup just created into the demo organization. Two
 * calls because that is genuinely what the product forces today: signup always mints an
 * organization of its own, and `Membership.accountId` is unique, so there is no such thing
 * as joining a second one. The invite flow replaces both with one call.
 */
async function addTeammate(admin, { firstName, lastName, local, role, profile }) {
  const email = address(local);
  await register({ firstName, lastName, email, orgName: `Holding org for ${local}` });

  const moved = await expect(
    `move ${email} into the demo org`,
    call('/api/test/memberships', {
      method: 'POST',
      cookies: admin.cookies,
      fixture: true,
      body: { orgId: admin.orgId, email, role },
    }),
  );

  const member = { ...moved.json, role, name: `${firstName} ${lastName}` };

  if (profile) {
    await expect(
      `contract details for ${email}`,
      call(`/api/organizations/${admin.orgId}/members/${member.membershipId}/profile`, {
        method: 'PUT',
        cookies: admin.cookies,
        body: profile,
      }),
    );
  }

  step(`${member.name} — ${email} — ${role}`);
  return member;
}

/* ------------------------------------------------------------------ *
 * Templates
 * ------------------------------------------------------------------ */

async function publishTemplate(admin, template) {
  const base = `/api/organizations/${admin.orgId}/document-templates`;

  // The description belongs to the template, and the template is made here — the draft
  // save neither reads nor writes it.
  const created = await expect(
    `create template ${template.name}`,
    call(base, {
      method: 'POST',
      cookies: admin.cookies,
      body: { name: template.name, description: template.description ?? null },
    }),
  );
  const id = created.json.id;

  await expect(
    `save draft of ${template.name}`,
    call(`${base}/${id}/draft`, {
      method: 'PUT',
      cookies: admin.cookies,
      body: {
        rowVersion: 1,
        bodyHtml: template.bodyHtml,
        signerRoles: template.signerRoles,
        fields: template.fields.map((field, index) => ({
          type: 'text',
          required: false,
          filledBy: 'sender',
          maxLength: null,
          autofillSource: null,
          order: index + 1,
          ...field,
        })),
      },
    }),
  );

  const published = await expect(
    `publish ${template.name}`,
    call(`${base}/${id}/publish`, { method: 'POST', cookies: admin.cookies }),
  );

  step(`${template.name} — published v${published.json.version ?? 1}`);
  return { id, name: template.name };
}

/* ------------------------------------------------------------------ *
 * Envelopes
 * ------------------------------------------------------------------ */

async function createEnvelope(admin, { templateId, title, subjectMembershipId, fieldValues, signers }) {
  const base = `/api/organizations/${admin.orgId}/envelopes`;

  const created = await expect(
    `create envelope ${title}`,
    call(base, {
      method: 'POST',
      cookies: admin.cookies,
      body: { templateId, subjectMembershipId: subjectMembershipId ?? null, title: null, expiresInDays: 30 },
    }),
  );
  const envelope = created.json;

  // Signers are materialized empty at creation, in the template's pinned role order, so
  // the names and addresses arrive with the fill rather than with the create.
  const ordered = [...envelope.signers].sort((a, b) => a.order - b.order);
  await expect(
    `fill envelope ${title}`,
    call(`${base}/${envelope.id}`, {
      method: 'PUT',
      cookies: admin.cookies,
      body: {
        title,
        expiresInDays: 30,
        fieldValues,
        signers: ordered.map((signer, index) => ({
          id: signer.id,
          name: signers[index].name,
          email: signers[index].email,
          order: signer.order,
        })),
      },
    }),
  );

  return { id: envelope.id, title, signers: ordered.map((s, i) => ({ ...s, ...signers[i] })) };
}

async function sendEnvelope(admin, envelope) {
  await expect(
    `send ${envelope.title}`,
    call(`/api/organizations/${admin.orgId}/envelopes/${envelope.id}/send`, {
      method: 'POST',
      cookies: admin.cookies,
      body: {},
    }),
  );
}

/** The link a recipient would click, read out of the sink exactly as they read their inbox. */
async function latestInvitation(email) {
  const response = await call(
    `/api/test/mail/latest?email=${encodeURIComponent(email)}&type=signing_invitation`,
    { fixture: true },
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      `The mail sink refused the read for ${email} (${response.status}). ` +
        `Without it there is no way to reach a signing link — pass --token, or run this ` +
        `against an environment with the fixtures open.`,
    );
  }
  return response.json;
}

/**
 * Signs the way the signing page does: read the document first, then submit.
 *
 * `envelopeTitle` is checked rather than trusted. Several of the envelopes below share a
 * signer, so "the latest invitation to this address" is only the right link as long as the
 * envelopes are sent in the order this script sends them — and a script that silently signs
 * the wrong document would leave a demo whose states quietly disagree with its own output.
 */
async function sign(email, { typedName, envelopeTitle, fieldValues = {} }) {
  const invitation = await latestInvitation(email);
  if (!invitation) throw new Error(`No signing invitation reached ${email}`);
  if (envelopeTitle !== undefined && invitation.envelopeTitle !== envelopeTitle) {
    throw new Error(
      `The latest invitation to ${email} is for "${invitation.envelopeTitle}", ` +
        `not "${envelopeTitle}"`,
    );
  }
  const token = new URL(invitation.signingUrl).pathname.split('/sign/')[1];

  await expect(`open the signing link for ${email}`, call(`/api/sign/${token}`));
  await expect(
    `sign as ${email}`,
    call(`/api/sign/${token}/sign`, {
      method: 'POST',
      body: {
        fieldValues,
        signature: { type: 'typed', value: typedName },
        consentAccepted: true,
      },
    }),
  );
  step(`signed by ${typedName} <${email}>`);
}

async function waitForPdf(admin, envelope, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let last = 'unknown';
  while (Date.now() < deadline) {
    const response = await call(`/api/organizations/${admin.orgId}/envelopes/${envelope.id}`, {
      cookies: admin.cookies,
    });
    if (response.ok) {
      last = response.json.pdfStatus;
      if (last === 'ready') return true;
      if (last === 'failed') return false;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  step(`the PDF for ${envelope.title} is still ${last} after ${timeoutMs / 1000}s`);
  return false;
}

/* ------------------------------------------------------------------ *
 * The templates themselves
 * ------------------------------------------------------------------ */

const CONTRACT = {
  name: 'Договор подряда (BY)',
  description: 'Основной договор: два подписанта, автозаполнение из профиля, одно поле от исполнителя.',
  bodyHtml: `<h1>ДОГОВОР ПОДРЯДА № {{contract_number}}</h1>
<p>г. Минск, {{contract_date}}</p>
<p>{{company_name}}, именуемое в дальнейшем «Заказчик», с одной стороны, и {{contractor_full_name}}, УНП {{contractor_tax_id}}, дата рождения {{contractor_dob}}, документ {{contractor_id_doc}}, проживающий по адресу {{contractor_address}}, именуемый в дальнейшем «Исполнитель», с другой стороны, заключили настоящий договор о нижеследующем.</p>
<h2>1. Предмет договора</h2>
<p>Исполнитель обязуется оказать услуги по разработке программного обеспечения, а Заказчик обязуется оплатить их в размере {{monthly_rate}} BYN в месяц.</p>
<h2>2. Срок действия</h2>
<p>Договор вступает в силу {{start_date}} и действует до его расторжения любой из сторон с письменным уведомлением за 30 календарных дней.</p>
<h2>3. Реквизиты Исполнителя</h2>
<p>Банковские реквизиты: {{contractor_bank}}</p>
<h2>4. Прочие условия</h2>
<p>Режим работы: {{work_mode}}. Соглашение о неразглашении: {{nda_signed}}.</p>
<p><em>Стороны признают юридическую силу электронной подписи под настоящим договором.</em></p>`,
  signerRoles: [
    { key: 'company', label: 'Заказчик', order: 1 },
    { key: 'contractor', label: 'Исполнитель', order: 2 },
  ],
  fields: [
    { key: 'contract_number', label: 'Номер договора', required: true, maxLength: 40 },
    { key: 'contract_date', label: 'Дата договора', type: 'date', required: true, autofillSource: 'today' },
    { key: 'company_name', label: 'Заказчик', required: true, maxLength: 200, autofillSource: 'org.name' },
    { key: 'contractor_full_name', label: 'ФИО исполнителя', required: true, maxLength: 200, autofillSource: 'member.fullName' },
    { key: 'contractor_tax_id', label: 'УНП', required: true, maxLength: 40, autofillSource: 'member.taxId' },
    { key: 'contractor_dob', label: 'Дата рождения', type: 'date', autofillSource: 'member.dateOfBirth' },
    { key: 'contractor_id_doc', label: 'Документ', maxLength: 60, autofillSource: 'member.idDocumentNumber' },
    { key: 'contractor_address', label: 'Адрес', type: 'multiline', required: true, maxLength: 2000, autofillSource: 'member.fullAddress' },
    { key: 'monthly_rate', label: 'Ставка в месяц, BYN', type: 'number', required: true, maxLength: 30 },
    { key: 'start_date', label: 'Дата начала', type: 'date', required: true, autofillSource: 'member.joinedAt' },
    { key: 'work_mode', label: 'Режим работы', type: 'select', options: ['Удалённо', 'Офис', 'Гибрид'] },
    { key: 'nda_signed', label: 'NDA подписано', type: 'checkbox' },
    {
      key: 'contractor_bank',
      label: 'Банковские реквизиты',
      type: 'multiline',
      required: true,
      maxLength: 500,
      // The one field the *signer* fills. It is what proves a signer-entered value reaches
      // the finished PDF: the document is frozen at send, so this value arrives afterwards.
      filledBy: 'signer:contractor',
      autofillSource: 'member.bankDetails',
    },
  ],
};

const NDA = {
  name: 'Соглашение о неразглашении',
  description: 'Короткий шаблон: работник и организация.',
  bodyHtml: `<h1>СОГЛАШЕНИЕ О НЕРАЗГЛАШЕНИИ</h1>
<p>{{company_name}} и {{employee_name}} заключили настоящее соглашение {{agreement_date}}.</p>
<h2>1. Конфиденциальная информация</h2>
<p>Работник обязуется не разглашать сведения, ставшие известными ему в связи с исполнением трудовых обязанностей, в течение {{term_years}} лет после прекращения отношений.</p>
<h2>2. Контакт для уведомлений</h2>
<p>Уведомления направляются на адрес {{employee_email}}.</p>
<h2>3. Ответственность</h2>
<p>Нарушение влечёт ответственность в соответствии с законодательством Республики Беларусь.</p>`,
  // Two roles, not one. A template must define exactly two — `validateSignerRoles` in
  // packages/validation — so "one signer" is not a shape this product has.
  signerRoles: [
    { key: 'employee', label: 'Работник', order: 1 },
    { key: 'company', label: 'Организация', order: 2 },
  ],
  fields: [
    { key: 'company_name', label: 'Организация', required: true, maxLength: 200, autofillSource: 'org.name' },
    { key: 'employee_name', label: 'ФИО работника', required: true, maxLength: 200, autofillSource: 'member.fullName' },
    { key: 'employee_email', label: 'Email работника', type: 'email', required: true, maxLength: 254, autofillSource: 'member.email' },
    { key: 'agreement_date', label: 'Дата соглашения', type: 'date', required: true, autofillSource: 'today' },
    { key: 'term_years', label: 'Срок, лет', type: 'number', required: true, maxLength: 3 },
  ],
};

const INCOME = {
  name: 'Справка о доходах',
  description: 'Таблица в теле документа и подпись бухгалтера.',
  bodyHtml: `<h1>СПРАВКА О ДОХОДАХ</h1>
<p>Выдана {{issued_date}} организацией {{company_name}}.</p>
<table>
  <thead><tr><th>Показатель</th><th>Значение</th></tr></thead>
  <tbody>
    <tr><td>ФИО</td><td>{{employee_name}}</td></tr>
    <tr><td>Должность</td><td>{{job_title}}</td></tr>
    <tr><td>В организации с</td><td>{{joined_at}}</td></tr>
    <tr><td>Город</td><td>{{city}}</td></tr>
    <tr><td>Страна</td><td>{{country}}</td></tr>
    <tr><td>Доход за период, BYN</td><td>{{income_amount}}</td></tr>
  </tbody>
</table>
<p>Справка выдана для предъявления по месту требования.</p>
<hr />
<p><strong>Подтверждено:</strong> бухгалтерия и работник.</p>`,
  signerRoles: [
    { key: 'accountant', label: 'Бухгалтер', order: 1 },
    { key: 'employee', label: 'Работник', order: 2 },
  ],
  fields: [
    { key: 'company_name', label: 'Организация', required: true, maxLength: 200, autofillSource: 'org.name' },
    { key: 'employee_name', label: 'ФИО', required: true, maxLength: 200, autofillSource: 'member.fullName' },
    { key: 'job_title', label: 'Должность', maxLength: 120, autofillSource: 'member.jobTitle' },
    { key: 'joined_at', label: 'В организации с', type: 'date', autofillSource: 'member.joinedAt' },
    { key: 'city', label: 'Город', maxLength: 120, autofillSource: 'member.city' },
    { key: 'country', label: 'Страна', maxLength: 2, autofillSource: 'member.country' },
    { key: 'income_amount', label: 'Доход, BYN', type: 'number', required: true, maxLength: 30 },
    { key: 'issued_date', label: 'Дата выдачи', type: 'date', required: true, autofillSource: 'today' },
  ],
};

/* ------------------------------------------------------------------ *
 * The run
 * ------------------------------------------------------------------ */

async function main() {
  process.stdout.write(`\nSeeding a demo organization on ${BASE}\n\n`);

  const health = await call('/api/health');
  if (!health.ok) throw new Error(`${BASE}/api/health answered ${health.status} — is it up?`);

  process.stdout.write('People\n');
  const adminEmail = address('admin');
  const admin = await register({
    firstName: 'Иван',
    lastName: 'Демченко',
    email: adminEmail,
    orgName: 'Teammerly Demo',
  });
  step(`${admin.name} — ${adminEmail} — admin (this is the account to sign in with)`);

  const alex = await addTeammate(admin, {
    firstName: 'Алексей',
    lastName: 'Каминский',
    local: 'alex',
    role: 'user',
    profile: {
      addressLine: 'ул. Притыцкого, 29, кв. 14',
      city: 'Минск',
      postalCode: '220017',
      country: 'BY',
      taxId: '191234567',
      dateOfBirth: '1991-04-18',
      idDocumentNumber: 'MP3456789',
      bankDetails: 'BY13ALFA30120A1234560010, ЗАО «Альфа-Банк», BIC ALFABY2X',
    },
  });

  const marina = await addTeammate(admin, {
    firstName: 'Марина',
    lastName: 'Ковалёва',
    local: 'marina',
    role: 'manager',
    profile: {
      addressLine: 'пр. Независимости, 58, кв. 7',
      city: 'Минск',
      postalCode: '220005',
      country: 'BY',
      taxId: '192345678',
      dateOfBirth: '1988-11-02',
      idDocumentNumber: 'MP1122334',
      bankDetails: 'BY86AKBB10100000002966000000, ОАО «АСБ Беларусбанк», BIC AKBBBY2X',
    },
  });

  // No contract details on purpose: an empty profile is what an unfilled autofill looks
  // like, and spec 03 says that is a state to be able to see, not an error.
  const pavel = await addTeammate(admin, {
    firstName: 'Павел',
    lastName: 'Сидорук',
    local: 'pavel',
    role: 'user',
  });

  const olga = await addTeammate(admin, {
    firstName: 'Ольга',
    lastName: 'Новик',
    local: 'olga',
    role: 'viewer',
  });

  process.stdout.write('\nTemplates\n');
  const contract = await publishTemplate(admin, CONTRACT);
  const nda = await publishTemplate(admin, NDA);
  const income = await publishTemplate(admin, INCOME);

  process.stdout.write('\nDocuments\n');

  const companySigner = { name: admin.name, email: adminEmail };

  // 1. A draft, left alone: somewhere to press Send by hand.
  const draft = await createEnvelope(admin, {
    templateId: contract.id,
    title: 'Договор подряда — П. Сидорук (черновик)',
    subjectMembershipId: pavel.membershipId,
    fieldValues: {
      contract_number: 'DP-2026-014',
      monthly_rate: '4200',
      work_mode: 'Гибрид',
      nda_signed: 'false',
    },
    signers: [companySigner, { name: pavel.name, email: pavel.email }],
  });
  step(`${draft.title} — draft`);

  // 2. Sent and waiting on the first signature.
  const waiting = await createEnvelope(admin, {
    templateId: contract.id,
    title: 'Договор подряда — М. Ковалёва',
    subjectMembershipId: marina.membershipId,
    fieldValues: {
      contract_number: 'DP-2026-015',
      monthly_rate: '5600',
      work_mode: 'Удалённо',
      nda_signed: 'true',
    },
    signers: [companySigner, { name: marina.name, email: marina.email }],
  });
  await sendEnvelope(admin, waiting);
  step(`${waiting.title} — sent, waiting on ${admin.name}`);

  // 3. Half-signed: the company has signed, the contractor has not. This is the state the
  //    signing queue is actually about, and the one that is tedious to reach by hand.
  const halfway = await createEnvelope(admin, {
    templateId: contract.id,
    title: 'Договор подряда — А. Каминский',
    subjectMembershipId: alex.membershipId,
    fieldValues: {
      contract_number: 'DP-2026-016',
      monthly_rate: '6100',
      work_mode: 'Офис',
      nda_signed: 'true',
    },
    signers: [companySigner, { name: alex.name, email: alex.email }],
  });
  await sendEnvelope(admin, halfway);
  await sign(adminEmail, { typedName: admin.name, envelopeTitle: halfway.title });
  step(`${halfway.title} — sent, waiting on ${alex.name}`);

  // 4. Complete, with a rendered PDF behind it.
  const done = await createEnvelope(admin, {
    templateId: nda.id,
    title: 'NDA — О. Новик',
    subjectMembershipId: olga.membershipId,
    fieldValues: { term_years: '3', employee_name: olga.name, employee_email: olga.email },
    signers: [{ name: olga.name, email: olga.email }, companySigner],
  });
  await sendEnvelope(admin, done);
  await sign(olga.email, { typedName: olga.name, envelopeTitle: done.title });
  await sign(adminEmail, { typedName: admin.name, envelopeTitle: done.title });
  const rendered = await waitForPdf(admin, done);
  step(`${done.title} — completed${rendered ? ', PDF ready' : ', PDF not ready yet'}`);

  /* ---------------------------------------------------------------- */

  process.stdout.write(`
Done.

  Sign in    ${BASE}/login
  Email      ${adminEmail}
  Password   ${PASSWORD}

  Everyone below shares that password.

    ${marina.email}  manager  — templates read-only, envelopes in full
    ${alex.email}  user     — no documents area at all
    ${pavel.email}  user     — empty contract details, to see autofill find nothing
    ${olga.email}  viewer   — the narrowest role there is

  Templates  ${BASE}/org/${admin.orgId}/documents/templates
  Documents  ${BASE}/org/${admin.orgId}/documents

  Waiting on a signature: "${halfway.title}" — the contractor still has to sign, and the
  link lives only in the email. Read it from the sink:

    curl -H "authorization: Bearer <token>" \\
      "${BASE}/api/test/mail?type=signing_invitation"

`);
}

main().catch((error) => {
  process.stderr.write(`\n${error.message}\n\n`);
  process.exit(1);
});
