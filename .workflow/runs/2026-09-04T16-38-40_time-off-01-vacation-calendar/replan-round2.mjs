/**
 * Replan round 2. Rebuilds handoff.json from the plan compiled at spec sha 4a5b88..,
 * against the settled document at 902752... Every change below is either the country-write
 * rule the person settled in the spec, or one of the two code blockers the review raised.
 * Each replacement asserts it matched exactly once: a plan that still carries the old
 * instruction beside the new one is worse than no plan.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const path = new URL('./handoff.json', import.meta.url);
const h = JSON.parse(readFileSync(path, 'utf8'));
const task = (id) => {
  const t = h.tasks.find((x) => x.id === id);
  if (!t) throw new Error(`no task ${id}`);
  return t;
};
const sub = (t, re, next) => {
  const hits = t.detail.match(re);
  if (!hits || hits.length !== 1) throw new Error(`${t.id}: ${hits ? hits.length : 0} matches for ${re}`);
  t.detail = t.detail.replace(re, next);
};

/* ── the document this plan is compiled from ─────────────────────────────── */

h.spec.sha256 = '90275255fe579ae59b8cdf89b02f8b43aef6e5b29c2e676f1ccba8dd8f1aa5f9';
h.summary += ' REPLAN, round 2: the country-write rule the review halted on is settled in the '
  + 'document - both writes test the uppercase shape AND membership of the assigned ISO 3166-1 '
  + 'list, so an unassigned code such as XX is refused, and both refusals carry '
  + 'PROFILE_MESSAGES.country.invalid rather than HOLIDAY_MESSAGES.countryCodeInvalid, whose '
  + 'text is false of XX. Two code blockers are planned with it: the calendar screen resolves '
  + "today from the caller's Account.timezone rather than the browser clock, and a failed read "
  + 'is reported as a failed read rather than as an empty scope.';

/* ── T2 — Validation Rule 9 becomes an export of its own ─────────────────── */

task('T2').detail += ' (5) REPLAN, round 2 - VALIDATION RULE 9, which the contracts settle as '
  + 'TWO tests and not one, exported once and called by both writes: '
  + 'validateStatedCountryCode(input) in packages/validation/src/time-off-calendar.ts. null, '
  + 'undefined and a blank string are valid and normalize to null (REQ-01-034, REQ-01-043); a '
  + 'non-string is invalid; then the UPPERCASE SHAPE, /^[A-Z]{2}$/ against the raw value, so '
  + "'pl' is REFUSED rather than upcased (Edge case 11 rests on this); then MEMBERSHIP OF THE "
  + 'ASSIGNED ISO 3166-1 LIST through validateCountryCode (packages/validation/src/autofill.ts:683), '
  + "so 'XX' is refused though its shape is right (REQ-01-036, REQ-01-051, Edge case 10). Every "
  + "failure carries PROFILE_MESSAGES.country.invalid ('Enter a valid country', autofill.ts:510) "
  + "and never HOLIDAY_MESSAGES.countryCodeInvalid, whose text ('must be 2 uppercase letters') is "
  + 'false of the value it would be refusing. COMPOSE validateCountryCode; do not copy '
  + 'COUNTRY_NAMES - one country list, one definition. Do NOT change validateHolidayCountryCode: '
  + "a holiday ROW's country keeps it (holidays.service.ts:322, HolidayModal.tsx:222), because "
  + 'there the code is a label matched against a resolved country and an unassigned one reaches '
  + 'nobody, which is visible and harmless. These two columns are the INPUT to that resolution, '
  + 'which is why they are the strict ones.';

/* ── T4 — the organization write ─────────────────────────────────────────── */

sub(
  task('T4'),
  /validates with validateHolidayCountryCode[\s\S]*?\(REQ-01-036\)/,
  "validates with validateStatedCountryCode (T2, Validation Rule 9 - empty clears; anything else "
    + "must be exactly two uppercase letters AND a code the assigned ISO 3166-1 list carries, so 'pl' "
    + "and 'XX' are both refused), refuses a bad one with 422 { error: 'validation_error', fields: "
    + '{ countryCode: PROFILE_MESSAGES.country.invalid } } (REQ-01-036)',
);
task('T4').detail += " REPLAN, round 2 - an ABSENT countryCode key on this PUT clears the column, "
  + 'and that is a decision, not an accident of the validator: this route is a one-field settings '
  + 'resource whose GET and PUT carry the same representation, so a PUT with no country submits an '
  + 'empty country (REQ-01-034). The member write beside it is deliberately the other way round '
  + '(T5), because its body carries three fields and a caller that ignores the new one must change '
  + 'nothing. Both rules are stated here so the difference reads as intended rather than as drift.';

/* ── T5 — the member write ───────────────────────────────────────────────── */

sub(
  task('T5'),
  /Validate with validateHolidayCountryCode and refuse a bad value with 400 [\s\S]*?\(REQ-01-051\)/,
  'Validate with validateStatedCountryCode (T2, Validation Rule 9 - the uppercase shape AND '
    + "membership of the assigned ISO list, so 'pl' and 'XX' are both refused) and refuse a bad "
    + 'value with 400 { errors: { countryCode: PROFILE_MESSAGES.country.invalid } } (REQ-01-051)',
);

/* ── T7 — the two blockers the review raised against the screen ──────────── */

task('T7').detail += " REPLAN, round 2 - two rules the first pass got wrong. (a) THE ANCHOR IS THE "
  + "CALLER'S TODAY, NOT THE BROWSER'S. The initial anchor and the calendar-today control both come "
  + 'from todayInTimeZone(session.account.timezone) (packages/validation/src/requests.ts:639, '
  + 'exported from the package root and already used exactly this way at '
  + 'apps/web/app/org/[orgId]/requests/NewRequestModal.tsx:133), whose fallback for a null, empty or '
  + "unrecognized zone is UTC - REQ-01-018's own fallback, and the same field the server resolves "
  + 'range.today from. A browser-clock anchor puts the today marker in no column at all for a caller '
  + "whose zone has crossed midnight and the browser's has not, and REQ-01-049 requires the Today "
  + 'control to land on the window HOLDING the caller\'s today. Nothing about today on this screen is '
  + 'computed from new Date(). (b) A FAILED READ IS NOT AN EMPTY ONE. A transport failure - fetch '
  + "rejecting, or any response the endpoint's 422 body shape does not describe - draws "
  + "calendar-error-banner carrying HOLIDAY_MESSAGES.toastServerError ('Something went wrong. Please "
  + "try again.'), the message the Holidays page this same change edits already uses for a failed "
  + 'read (settings/holidays/page.tsx:179). It must NEVER carry '
  + "TIME_OFF_CALENDAR_MESSAGES.emptyStateBody: the contracts' Error Messages table gives that string "
  + 'no route and the UI Description assigns it to the Empty (no rows) state alone, so drawing it on '
  + 'a read that never happened reports a fact about data nobody fetched. Only a 422 carrying fields '
  + 'draws the endpoint\'s own message (the first value of fields); every other outcome draws the '
  + 'generic one, which also keeps a raw framework string such as "Internal server error" off the '
  + 'screen. The last good grid stays underneath in both cases.';

/* ── T8 — the pickers may not offer what the write refuses ───────────────── */

task('T8').detail += ' REPLAN, round 2 - THE OPTION LIST. Under the settled Validation Rule 9 a '
  + 'country is refused unless the assigned ISO list carries it, and HOLIDAY_COUNTRY_OPTIONS is built '
  + "from COUNTRY_OPTIONS (apps/web/src/account-data.ts:58), which is libphonenumber's getCountries() "
  + 'and offers AC, TA and XK - three codes validateCountryCode refuses. Both country pickers, '
  + 'org-country-select and member-country-select, therefore list only options their own save accepts: '
  + 'filter HOLIDAY_COUNTRY_OPTIONS through the assigned-list test where those two Selects build their '
  + 'options, keeping the labels and the ordering they already have and adding no second country list. '
  + "The holiday list's country FILTER (holidays-country-filter) and the holiday form's own country "
  + 'picker are NOT filtered: a Holiday row may carry any two uppercase letters, and a filter that '
  + 'cannot name a row that exists is a worse control than one offering a rare country.';

/* ── T9 — the two cases the settled rule rewrote ─────────────────────────── */

task('T9').detail += ' REPLAN, round 2 - the two cases the settled rule rewrote, and one assertion '
  + 'that pins the old message. TC-01-INT-21 submits POL, then 1, then pl, then XX, then PL, and '
  + 'reads the country back after the XX attempt: 422 PROFILE_MESSAGES.country.invalid for the first '
  + 'four, the read-back still answering the value stored before XX, then 200 for PL stored as PL. '
  + 'TC-01-INT-25 ends with pl AND XX on the member write, both refused with 400 '
  + 'PROFILE_MESSAGES.country.invalid and the stored country left null - XX is the one that matters, '
  + 'because its shape is right and storing it would leave a country every read discards. Any '
  + 'assertion naming HOLIDAY_MESSAGES.countryCodeInvalid for these two ROUTES is now wrong: '
  + "apps/api/test/time-off-calendar.spec.ts:1131 pins that text today and must pin 'Enter a valid "
  + "country' instead. HOLIDAY_MESSAGES.countryCodeInvalid stays asserted where a holiday ROW's own "
  + 'country is written (apps/api/test/holidays.spec.ts:607), which this spec does not touch - keep '
  + 'that assertion exactly as it is, because it is what catches one validator being swapped for the '
  + 'other.';

/* ── T10 — the fixtures must be able to fail ─────────────────────────────── */

task('T10').detail += ' REPLAN, round 2 - THE FIXTURES MUST BE ABLE TO FAIL. In all three API '
  + 'suites, a fixture that states a membership country must not carry the SAME country on '
  + 'Account.phoneCountryCode: drop the phone value, or give it a different country. A fixture '
  + 'seeding both to one country cannot fail if the code regressed to reading the phone, which is '
  + 'the only rule these four suites are being edited for. Where a case keeps a phone country on '
  + 'purpose (holidays.spec.ts TC-03-INT-14, reports-amounts-owed.spec.ts, reports-time-off.spec.ts), '
  + 'it must be a DIFFERENT country from the stated one, so the assertion witnesses that the phone '
  + 'reaches nothing rather than merely agreeing with it.';

/* ── the tables ──────────────────────────────────────────────────────────── */

const msgIdx = h.messages.findIndex((m) => m.context.startsWith('an invalid country on either write'));
if (msgIdx < 0) throw new Error('no country message row');
h.messages[msgIdx] = {
  context: "an invalid country on either write - 'POL', '1', 'pl', or an unassigned code such as 'XX'",
  module: "packages/validation/src/autofill.ts - PROFILE_MESSAGES.country.invalid ('Enter a valid country'; ships, reused unchanged), returned by validateStatedCountryCode in packages/validation/src/time-off-calendar.ts",
  emittedBy: 'apps/api/src/organizations/organization-country.service.ts (422 fields.countryCode) and apps/api/src/members/members.service.ts#updateDetail (400 errors.countryCode)',
};
h.messages.push({
  context: "the calendar read did not complete, or answered something the endpoint's 422 body shape does not describe",
  module: 'packages/validation/src/holiday-messages.ts - HOLIDAY_MESSAGES.toastServerError (ships)',
  emittedBy: "apps/web/app/org/[orgId]/time-off/calendar/CalendarScreen.tsx (calendar-error-banner); no route emits it. The contracts assign emptyStateBody to the Empty (no rows) state alone and give no message to a failed read, so the screen borrows the generic one its neighbour already uses rather than reporting an empty scope",
});

const reuseIdx = h.reuse.findIndex((r) => r.what.startsWith('the country validator that refuses lowercase'));
if (reuseIdx < 0) throw new Error('no country validator reuse row');
h.reuse[reuseIdx] = {
  what: "the assigned-country test and the message rule 9 carries - composed under the shape test, never copied",
  where: 'packages/validation/src/autofill.ts:683 (validateCountryCode), :510 (PROFILE_MESSAGES.country.invalid), :717 (COUNTRY_NAMES, 249 codes)',
};
h.reuse.push(
  {
    what: "the holiday ROW's own country validator, shape-only and untouched by this spec",
    where: 'packages/validation/src/holidays.ts:93 (validateHolidayCountryCode)',
  },
  {
    what: "today as a calendar date in an account's timezone, with REQ-01-018's UTC fallback for a null, empty or unrecognized zone",
    where: 'packages/validation/src/requests.ts:639 (todayInTimeZone), read from a client screen at apps/web/app/org/[orgId]/requests/NewRequestModal.tsx:133',
  },
  {
    what: 'a screen reporting a failed read without claiming anything about the data behind it',
    where: 'apps/web/app/org/[orgId]/settings/holidays/page.tsx:179 (HOLIDAY_MESSAGES.toastServerError)',
  },
);

h.buildFromZero.push(
  'validateStatedCountryCode in packages/validation/src/time-off-calendar.ts - Validation Rule 9 as one export. Neither shipped validator answers it: validateHolidayCountryCode accepts XX, and validateCountryCode upcases pl.',
);

h.shippingSurfaces.push(
  {
    newValue: "the value set both country writes accept narrows - an unassigned two-letter code such as 'XX' is refused where the shipped attempt stored it",
    path: 'apps/api/src/organizations/organization-country.service.ts#update, apps/api/src/members/members.service.ts#updateDetail',
    governedBy: 'REQ-01-036, REQ-01-051 and Validation Rule 9. Nothing else writes either column, so no stored value becomes unreachable: the columns land null and only these two routes fill them',
    planned: 'T4, T5',
  },
  {
    newValue: "a Holiday row's own countryCode, which keeps the shape-only rule and its own message",
    path: 'apps/api/src/holidays/holidays.service.ts (parseInput, :322) and apps/web/app/org/[orgId]/settings/holidays/HolidayModal.tsx:222',
    governedBy: "organization/03's rule, which this spec leaves standing - the contracts say the shape alone is right for a holiday's country, a label that reaches nobody when it names no country",
    planned: 'no code - deliberately unchanged, and apps/api/test/holidays.spec.ts:607 keeps pinning its message',
  },
  {
    newValue: 'the country options two shipped screens offer',
    path: 'apps/web/app/org/[orgId]/settings/holidays/page.tsx (org-country-select) and apps/web/app/org/[orgId]/members/[memberId]/MemberDetailScreen.tsx (member-country-select)',
    governedBy: 'REQ-01-036 and REQ-01-051 - a control may not offer a value its own save refuses; the same list still feeds the holiday form and the holiday list filter, unfiltered',
    planned: 'T8',
  },
);

h.premises.push(
  {
    claim: "PROFILE_MESSAGES.country.invalid ships beside the assigned-list validator and reads 'Enter a valid country', which is true of every value rule 9 refuses",
    verifiedAt: 'packages/validation/src/autofill.ts:510 and :683',
  },
  {
    claim: 'neither shipped validator answers Validation Rule 9 alone: validateHolidayCountryCode tests /^[A-Z]{2}$/ and accepts XX, and validateCountryCode upcases pl to PL',
    verifiedAt: 'packages/validation/src/holidays.ts:93-105 and packages/validation/src/autofill.ts:683-690, with packages/validation/src/autofill.test.ts:755-757 pinning the upcasing',
  },
  {
    claim: 'the country picker both screens reuse offers three codes the assigned-list test refuses',
    verifiedAt: "apps/web/src/account-data.ts:58 (COUNTRY_OPTIONS, from libphonenumber getCountries()) against packages/validation/src/autofill.ts:717 - 245 offered codes, 249 assigned names, and AC, TA and XK are offered but not assigned",
  },
  {
    claim: "today in an account's timezone, with a UTC fallback for a null, empty or unrecognized zone, already exists and is already read from a client screen",
    verifiedAt: 'packages/validation/src/requests.ts:639 (todayInTimeZone) and apps/web/app/org/[orgId]/requests/NewRequestModal.tsx:133',
  },
  {
    claim: "the static gate reads spec edits from run.headAtInit, which this run's resume moved to the commit carrying the person's settled document - so the settled spec is not read as an implementation editing its own contract",
    verifiedAt: 'scripts/static-gate.mjs:59 and :112, against headAtInit 40eedaa in this run.json',
  },
);

const riskIdx = h.risks.findIndex((r) => r.risk.startsWith('Two country validators'));
if (riskIdx < 0) throw new Error('no validator risk row');
h.risks[riskIdx] = {
  risk: 'Three country rules now sit side by side and reaching for the wrong one is silent. The two '
    + 'STATED columns are written under Validation Rule 9 (uppercase shape AND the assigned list; '
    + "'pl' and 'XX' both refused; PROFILE_MESSAGES.country.invalid). A HOLIDAY row's country keeps "
    + 'validateHolidayCountryCode (any two uppercase letters; HOLIDAY_MESSAGES.countryCodeInvalid). '
    + 'The READ is the forgiving one (resolveMemberHolidayCountry upcases and tests the assigned '
    + 'list). The asymmetry is the document\'s own decision: a stored code the read discards removes '
    + 'holiday pay in silence, while a holiday labelled with an unassigned country simply reaches '
    + 'nobody.',
  mitigation: 'T2 exports rule 9 once and both writes call it; holidays.service.ts:322 and '
    + 'HolidayModal.tsx:222 are left alone. TC-01-INT-21 and TC-01-INT-25 pin the write side '
    + "including 'XX'; TC-01-UNIT-01 pins the read side ('pl' -> PL, 'XX' -> skipped); "
    + "apps/api/test/holidays.spec.ts:607 still pins the holiday row's own message, which is what "
    + 'catches one validator being swapped for the other.',
};
h.risks.push(
  {
    risk: "The country picker the two screens reuse is built from libphonenumber's country list and "
      + 'offers AC, TA and XK, which the settled write rule refuses - a control offering a value its '
      + 'own save cannot store.',
    mitigation: 'T8 filters both country Selects through the assigned-list test and leaves the '
      + "holiday form's picker and the holiday list's country filter as they are.",
  },
  {
    risk: "The screen's anchor and the server's range.today are two computations of one value, and "
      + 'nothing in the payload forces them to agree.',
    mitigation: 'T7 makes both read Account.timezone: the server through its own resolver, the '
      + 'screen through todayInTimeZone(session.account.timezone), which is the same field with the '
      + "same UTC fallback. The marker is drawn by comparing a day against the server's range.today, "
      + 'so the screen never decides which day is today - only which window to open on.',
  },
);

writeFileSync(path, `${JSON.stringify(h, null, 2)}\n`);
process.stdout.write(`handoff rewritten: ${h.tasks.length} tasks, ${h.messages.length} messages, ${h.premises.length} premises, ${h.risks.length} risks\n`);
