/**
 * Replan round 3 — the handoff against the settled spec (a83e79f).
 *
 * Three things the document changed since round 2, and two code blockers planned with them:
 *   - both stated-country pickers draw packages/validation's COUNTRY_OPTIONS (contracts :344, :360)
 *   - an absent countryCode key on the organization PUT changes nothing (spec :356/:359, contracts :134)
 *   - the calendar banner's non-422 message is tabled (contracts :181, :372), so the fallback
 *     chain has two branches and no raw framework string
 *   - no fourth length literal on the calendar screen (the skeleton's max-width: 160px)
 *
 * Edits handoff.json in place. Every splice asserts its markers, so a stale marker fails loudly
 * instead of silently writing nothing.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const DIR = '.workflow/runs/2026-09-04T16-38-40_time-off-01-vacation-calendar';
const h = JSON.parse(readFileSync(`${DIR}/handoff.json`, 'utf8'));
const task = (id) => {
  const t = h.tasks.find((x) => x.id === id);
  if (!t) throw new Error(`no task ${id}`);
  return t;
};

/** Replace the span that starts at `from` and ends where `to` begins. */
function splice(text, from, to, replacement) {
  const i = text.indexOf(from);
  if (i < 0) throw new Error(`marker not found: ${from.slice(0, 60)}`);
  const j = to === null ? text.length : text.indexOf(to, i);
  if (j < 0) throw new Error(`end marker not found: ${to.slice(0, 60)}`);
  return text.slice(0, i) + replacement + text.slice(j);
}
function replaceOnce(text, from, replacement) {
  const i = text.indexOf(from);
  if (i < 0) throw new Error(`text not found: ${from.slice(0, 60)}`);
  return text.slice(0, i) + replacement + text.slice(i + from.length);
}

/* ------------------------------------------------------------------ spec sha */
h.spec.sha256 = createHash('sha256')
  .update(readFileSync('specs/time-off/01-vacation-calendar.md'))
  .digest('hex');

/* ------------------------------------------------------------------ summary */
h.summary +=
  ' REPLAN, round 3: the document settled the picker question the review halted on, and two' +
  ' code blockers are planned with it. Both stated-country pickers now draw COUNTRY_OPTIONS' +
  " from packages/validation — the same 249 assigned codes rule 9 accepts — so what a picker" +
  ' offers is exactly what its save stores, and the phone-derived list leaves this feature' +
  ' entirely. An absent countryCode key on the organization PUT changes nothing, the same' +
  ' choice the member write beside it makes. The calendar banner draws the endpoint’s own' +
  ' message only from a 422 carrying fields and the shipped generic one on every other' +
  ' outcome, so no framework string reaches the reader. And the loading skeleton carries no' +
  ' length literal of its own: the DS gaps table closes that set at three.';

/* ------------------------------------------------------------------ T2 */
{
  const t = task('T2');
  t.detail +=
    " REPLAN, round 3 - THE THREE HELPERS THE SETTLED CONTRACT NAMES. §Shared code now lists" +
    ' validateStatedCountryCode(input), timeOffCalendarToday(timezone, instant) and' +
    ' resolveTimeOffCalendarTimezone(timezone) beside TIME_OFF_CALENDAR_MESSAGES, so all three' +
    ' are exports of packages/validation/src/time-off-calendar.ts and the endpoint and the' +
    ' screen both read them - one definition of REQ-01-018’s today, not one per surface.' +
    ' timeOffCalendarToday FORMATS THROUGH todayInTimeZone (packages/validation/src/requests.ts:639),' +
    ' which already ships, is exported from the package root and already carries REQ-01-018’s' +
    ' fallback: resolveTimeOffCalendarTimezone answers which zone (the stated one when Intl' +
    ' accepts it, UTC when it is null, empty or unrecognized) and todayInTimeZone answers the' +
    ' calendar date in it. Do not restate the en-CA formatting a second time - two' +
    ' implementations of one fallback is where the rule drifts, and nothing observable' +
    ' separates them today.';
}

/* ------------------------------------------------------------------ T4 */
{
  const t = task('T4');
  t.detail = splice(
    t.detail,
    'REPLAN, round 2 - an ABSENT countryCode key',
    ' AUTHORIZATION:',
    'REPLAN, round 3 - AN ABSENT countryCode KEY CHANGES NOTHING, and the document now states it' +
      ' twice: REQ-01-034’s Decided ("a body with no countryCode key changes nothing, as the' +
      ' member write beside it does: clearing on an absent key lets a mistyped key drop the' +
      ' country the fallback depends on", spec:359) and the PUT contract ("A body with no' +
      ' countryCode key changes nothing and answers the stored value unchanged", contracts:134).' +
      ' This REVERSES what round 2 planned. PRESENCE DECIDES, and the validator cannot decide it:' +
      ' validateStatedCountryCode(undefined) answers { valid: true, value: null }, so a route that' +
      ' hands it a missing key clears the column on a mistyped body, answers 200, and every member' +
      ' on the organization fallback silently drops to global holidays only. Test the key itself' +
      " - `'countryCode' in body` on the parsed object, the idiom members.service.ts uses for the" +
      ' same field and HolidaysService.parseInput uses at holidays.service.ts:316 - and when it is' +
      ' absent write nothing at all and answer the stored value with 200. An explicit null or an' +
      ' empty string IS a submission and clears the column (REQ-01-034); anything else is rule 9’s' +
      ' to refuse. The two country writes now make the same choice, and it is the document’s' +
      ' rather than a code comment’s.',
  );
}

/* ------------------------------------------------------------------ T7 */
{
  const t = task('T7');
  t.detail = splice(
    t.detail,
    '(b) A FAILED READ IS NOT AN EMPTY ONE.',
    null,
    '(b) A FAILED READ IS NOT AN EMPTY ONE, AND IT NEVER DRAWS THE FRAMEWORK’S OWN WORDS. The' +
      ' banner has exactly TWO branches and no third. A 422 whose body carries `fields` draws the' +
      ' first value of `fields`, which is one of the seven TIME_OFF_CALENDAR_MESSAGES rows the' +
      ' endpoint can answer with. EVERY other outcome - a 404 after a capability was revoked' +
      ' mid-session, a 500, a dropped connection, a body that does not parse, fetch rejecting -' +
      ' draws HOLIDAY_MESSAGES.toastServerError ("Something went wrong. Please try again.",' +
      ' packages/validation/src/holiday-messages.ts), which the contracts’ Error Messages table' +
      ' now carries (contracts:181) and §UI Description assigns to its own state, "Failed for any' +
      ' other reason" (contracts:372). DO NOT chain the response body’s `message` between the' +
      ' two: Nest answers {"message":"Not Found","statusCode":404} and {"message":"Internal server' +
      ' error","statusCode":500}, neither string is an export of packages/validation nor a row of' +
      ' that table, and a chain written `fields ? first : (body?.message ?? generic)` puts a' +
      ' framework string on the reader’s screen while the generic branch behind it never runs.' +
      ' The whole chain is `fields ? Object.values(fields)[0] : HOLIDAY_MESSAGES.toastServerError`' +
      ' and nothing longer. It must equally never carry TIME_OFF_CALENDAR_MESSAGES.emptyStateBody,' +
      ' whose table row gives it no route and whose state is Empty (no rows) alone - drawing it on' +
      ' a read that never happened reports a fact about data nobody fetched. The last good grid' +
      ' stays underneath in both branches.' +
      ' (c) NO FOURTH LENGTH LITERAL ON THIS SCREEN. The spec’s DS gaps table closes the set:' +
      ' --surface-timeoff-band, --border-timeoff-band, --text-timeoff-band and --name-col are' +
      ' declared once in the .time-off-calendar block, and the ONLY literals this screen may carry' +
      ' are the 3px band side-margin, the 3px pending-hatch stripe and the 2px today inset, each' +
      ' with an @literal comment and its reason (contracts, DS gaps row 3). The loading' +
      ' skeleton’s placeholders are measured from tokens and from the track they sit in - height' +
      ' var(--space-4), corner var(--radius-s), width from the column - and the name-column' +
      ' placeholder carries NO max-width of its own: `max-width: 160px` is a fourth literal no' +
      ' token names, no @literal comment explains and no DS-gaps row records, and it is the only' +
      ' length in the block that is neither a var() nor a 1px hairline. If that placeholder must' +
      ' read as shorter than its column, express it as a fraction of the track (a percentage),' +
      ' never as a new number of pixels; adding a DS-gaps row instead is a spec edit, which is not' +
      ' this run’s to make.' +
      ' (d) THE SKELETON IS DRAWN IN A GRID OF ITS OWN. It renders only while `loading && !data`,' +
      ' when days[] is empty and a data-derived template declares ONE day column - placing' +
      ' fourteen cells into it creates thirteen implicit auto tracks, and a placeholder’s' +
      ' width: 100% inside an auto track resolves against no definite width. Give the skeleton its' +
      ' own template, var(--name-col) plus exactly the number of day columns it places, so the' +
      ' claim its comment makes - the grid’s own geometry, so the page does not jump when the' +
      ' answer arrives - is true on the only paint it has. No case can catch this one: the' +
      ' contracts record "No case: the skeleton lives between two paints".',
  );
}

/* ------------------------------------------------------------------ T8 */
{
  const t = task('T8');
  t.files = [
    'apps/web/src/stated-country-options.ts',
    'apps/web/app/org/[orgId]/settings/holidays/page.tsx',
    'apps/web/app/org/[orgId]/members/[memberId]/MemberDetailScreen.tsx',
  ];
  t.detail = replaceOnce(
    t.detail,
    'Its options are the same list the holiday form uses (HOLIDAY_COUNTRY_OPTIONS from ./country-options, whose first entry is the empty value that clears).',
    'Its options are COUNTRY_OPTIONS from @devscribed/validation - see THE OPTION LIST below, which is the whole rule for both pickers.',
  );
  t.detail = splice(
    t.detail,
    'REPLAN, round 2 - THE OPTION LIST.',
    null,
    'REPLAN, round 3 - THE OPTION LIST, AND WHERE IT COMES FROM. This REPLACES what round 2' +
      ' planned (filtering the phone-derived list). §Screens settles both pickers: the' +
      ' organization’s "options are COUNTRY_OPTIONS from @devscribed/validation, which is' +
      ' COUNTRY_NAMES - the same 249 assigned codes rule 9’s validateCountryCode tests, so the' +
      ' list offered and the list accepted are one list and cannot drift" (contracts:344), and the' +
      ' member’s draws "the same COUNTRY_OPTIONS the organization picker draws" below its default' +
      ' option (contracts:360). NOT HOLIDAY_COUNTRY_OPTIONS, and not apps/web/src/account-data.ts’s' +
      ' COUNTRY_OPTIONS behind it: that list is libphonenumber’s getCountries() and offers AC, TA' +
      ' and XK, three codes rule 9 refuses, so an admin could pick Kosovo and be told "Enter a' +
      ' valid country" about a value the product itself offered. The validation package’s export' +
      ' is `readonly { code: string; name: string }[]` sorted by name' +
      ' (packages/validation/src/autofill.ts:970, re-exported from the package root at' +
      ' packages/validation/src/index.ts:3750) and the design system’s Select takes' +
      ' `{ value, label }`, so MAP IT ONCE: a new module apps/web/src/stated-country-options.ts' +
      ' exporting STATED_COUNTRY_OPTIONS = COUNTRY_OPTIONS.map(({ code, name }) =>' +
      ' ({ value: code, label: name })), imported by both screens. Two mappings of one list is how' +
      ' the two pickers drift apart again. The name COUNTRY_OPTIONS is taken twice in this' +
      ' repository - the package’s assigned list and the web app’s phone list - so import the' +
      ' package’s under an alias in any file that already has the other. org-country-select draws' +
      ' STATED_COUNTRY_OPTIONS and NOTHING above it: the spec gives that picker no option meaning' +
      ' "no country", and no export of packages/validation holds a label for one, so none is' +
      ' invented here - a stored null paints the Select’s own placeholder (optionFor returns' +
      ' undefined for a value no option matches, apps/web/src/select.ts:51), and clearing the' +
      ' organization country stays the API rule REQ-01-034, which is where every case for it' +
      ' lives. member-country-select keeps its first option - value ’’, labelled' +
      ' TIME_OFF_CALENDAR_MESSAGES.memberCountryDefaultOption - and lists STATED_COUNTRY_OPTIONS' +
      ' below it. The holiday FORM’s picker (HolidayModal) and the holiday list’s country FILTER' +
      ' (holidays-country-filter) keep HOLIDAY_COUNTRY_OPTIONS exactly as they are: a Holiday row' +
      ' may carry any two uppercase letters, and a filter that cannot name a row that exists is a' +
      ' worse control than one offering a rare country. That asymmetry is the spec’s own Known' +
      ' Gap ("A holiday row carrying AC, TA or XK reaches nobody"), whose closure belongs to' +
      ' organization/03 and not to this run. THE SAVE’S FAILURE PATH draws the same closed set the' +
      ' calendar’s banner does: the 422’s fields.countryCode when it carries one, else' +
      ' HOLIDAY_MESSAGES.toastServerError - never the response body’s raw `message`, which on a' +
      ' 404 or a 500 is Nest’s own words and is in no table of this spec.',
  );
}

/* ------------------------------------------------------------------ T9 */
{
  const t = task('T9');
  t.detail +=
    ' REPLAN, round 3 - three case-level repairs the last review left as notes, and one' +
    ' consequence of the settled picker. (i) calendar-scope-all is in the contracts’ testid table' +
    ' and no E2E case asserts it; assert it in the case that returns to the All scope, so all 26' +
    ' ids are observed rather than merely rendered. (ii) ANY assertion about which day a window' +
    ' opens on computes the expected date IN THE ACCOUNT’S ZONE, the way the screen does' +
    ' (timeOffCalendarToday(session.account.timezone); signupOrg seeds Europe/Berlin at' +
    ' e2e/tests/helpers.ts:138). A Monday derived from the runner’s UTC clock fails against' +
    ' correct code on a Sunday evening under CEST - the browser-clock/account-zone split these' +
    ' cases exist to guard, reintroduced inside the assertion guarding it. (iii) every describe' +
    ' block in packages/validation/src/time-off-calendar.test.ts carries the TC id it serves; a' +
    ' block that serves no numbered case is folded into the case whose rule it exercises - rule' +
    ' 9’s country tests into TC-01-UNIT-01, the today helper into TC-01-UNIT-02 - because the' +
    ' spec numbers the cases and the code references those ids. (iv) TC-01-E2E-07 and TC-01-E2E-08' +
    ' pick a country by its LABEL from the new option list; those labels are COUNTRY_NAMES’ own' +
    ' ("Poland"), which is what countryName() already rendered, so no case text changes - but a' +
    ' case that selected an option by an index into the old list must select it by label.';
}

/* ------------------------------------------------------------------ T10 */
{
  const t = task('T10');
  t.detail +=
    ' REPLAN, round 3 - the leftover seeds. apps/api/test/reports-amounts-owed.spec.ts:651 and' +
    ' :658 still give two members a phoneCountryCode in a case whose only holiday is global, so' +
    ' the value discriminates nothing and reads as though the phone still resolved something:' +
    ' drop those two seeds, or give that case a country-scoped holiday so they mean what they' +
    ' look like. No assertion in that case changes.';
}

/* ------------------------------------------------------------------ reuse */
h.reuse = h.reuse.map((r) =>
  r.where.startsWith('apps/web/app/org/[orgId]/settings/holidays/country-options.ts')
    ? {
        what:
          "the HOLIDAY FORM's country picker and the holiday list's country filter — the" +
          ' phone-derived list, left exactly as it is; it is NOT what either stated-country picker draws',
        where: 'apps/web/app/org/[orgId]/settings/holidays/country-options.ts',
      }
    : r,
);
h.reuse.push({
  what:
    'the option list both stated-country pickers draw — the 249 assigned codes of COUNTRY_NAMES' +
    ' as { code, name }, sorted by name, which is exactly the set Validation Rule 9 accepts',
  where:
    'packages/validation/src/autofill.ts:970 (COUNTRY_OPTIONS), re-exported at' +
    ' packages/validation/src/index.ts:3750; its length is pinned at packages/validation/src/autofill.test.ts:803',
});
h.reuse.push({
  what:
    "the Select's placeholder as the paint for a stored value no option matches — which is what a" +
    ' null organization country renders as, so no "no country" option has to be invented',
  where:
    'apps/web/src/select.ts:51 (optionFor returns undefined) and' +
    ' packages/ds/src/components/forms/Select.tsx (the placeholder prop)',
});

/* ------------------------------------------------------------------ buildFromZero */
h.buildFromZero.push(
  'apps/web/src/stated-country-options.ts — the { value, label } mapping of packages/validation’s' +
    ' COUNTRY_OPTIONS that both stated-country pickers draw. Nothing maps that export for a Select' +
    ' today: the two country Selects in the web app map the phone list instead.',
);

/* ------------------------------------------------------------------ shippingSurfaces */
{
  const row = h.shippingSurfaces.find((r) => r.newValue === 'the country options two shipped screens offer');
  if (!row) throw new Error('option-list shipping surface row not found');
  row.governedBy =
    'contracts §Screens (:344 and :360) — both stated-country pickers draw COUNTRY_OPTIONS from' +
    ' @devscribed/validation, the same 249 assigned codes Validation Rule 9 accepts, so what a' +
    ' picker offers is exactly what its save stores. The holiday form’s picker and the holiday' +
    ' list’s country filter keep the phone-derived list, which the spec’s Known Gap records';
}
h.shippingSurfaces.push({
  newValue:
    'a PUT to the organization country whose body carries no countryCode key — reachable from any' +
    ' API caller, and from a screen that stops sending the key',
  path: 'apps/api/src/organizations/organization-country.service.ts#update',
  governedBy:
    'REQ-01-034’s Decided (spec:359) and the PUT contract (contracts:134) — it changes nothing and' +
    ' answers the stored value unchanged, the same choice members.service.ts#updateDetail makes for' +
    ' the same field',
  planned: 'T4',
});

/* ------------------------------------------------------------------ messages */
{
  const m = h.messages.find((x) => x.module.includes('HOLIDAY_MESSAGES.toastServerError'));
  if (!m) throw new Error('toastServerError message row not found');
  m.context =
    'the calendar read answered anything but a 422 carrying fields — a 404, a 500, a dropped' +
    ' connection, a body that does not parse — and the organization country save did the same';
  m.emittedBy =
    'apps/web/app/org/[orgId]/time-off/calendar/CalendarScreen.tsx (calendar-error-banner) and' +
    ' apps/web/app/org/[orgId]/settings/holidays/page.tsx (its save toast); no route emits it. The' +
    ' contracts now carry the row (:181) and give it its own §UI Description state, "Failed for any' +
    ' other reason" (:372), so the banner draws a message this spec tables rather than the' +
    " framework's own \"Not Found\" or \"Internal server error\", which are in no table and in no" +
    ' packages/validation export.';
}

/* ------------------------------------------------------------------ premises */
h.premises.push(
  {
    claim:
      'packages/validation exports COUNTRY_OPTIONS — the 249 assigned codes of COUNTRY_NAMES as' +
      ' { code, name } sorted by name — and the package root re-exports it, so a web screen can draw it',
    verifiedAt:
      'packages/validation/src/autofill.ts:970, packages/validation/src/index.ts:3750,' +
      ' packages/validation/src/autofill.test.ts:803 (length 249)',
  },
  {
    claim:
      'the name COUNTRY_OPTIONS is taken twice — the package’s assigned list and the web app’s' +
      ' libphonenumber list — and the web one is what the two country pickers draw today',
    verifiedAt:
      'apps/web/src/account-data.ts:58 against packages/validation/src/autofill.ts:970;' +
      ' apps/web/app/org/[orgId]/settings/holidays/country-options.ts:1 imports the web one',
  },
  {
    claim:
      'the design system’s Select paints its placeholder for a value no option matches, so a null' +
      ' organization country needs no option of its own',
    verifiedAt:
      'apps/web/src/select.ts:51 (optionFor returns undefined) and' +
      ' packages/ds/src/components/forms/Select.tsx (placeholder, default "Select...")',
  },
  {
    claim:
      'the three questions this replan turns on are settled in the document itself, not inferred:' +
      ' the absent key, both pickers’ option list, and what the banner draws on a non-422',
    verifiedAt:
      'specs/time-off/01-vacation-calendar.md:356-359; specs/time-off/01-vacation-calendar.contracts.md:134,' +
      ' :181, :214, :344, :360, :372',
  },
  {
    claim:
      'todayInTimeZone already carries REQ-01-018’s fallback and ships from the package root, so the' +
      ' spec’s timeOffCalendarToday can format through it rather than restate it',
    verifiedAt:
      'packages/validation/src/requests.ts:639 and apps/web/app/org/[orgId]/requests/NewRequestModal.tsx:133',
  },
);

/* ------------------------------------------------------------------ dsGaps */
h.dsGaps.push({
  missing:
    'nothing further — and that is the plan: the DS gaps table is closed at three rows plus' +
    ' --name-col, so the screen may carry no length literal beyond the 3px band margin, the 3px' +
    ' hatch stripe and the 2px today inset',
  resolution:
    'the loading skeleton takes its measurements from tokens and from the track it sits in' +
    ' (height var(--space-4), corner var(--radius-s), width from the column) and carries no' +
    ' max-width of its own. A new measurement invented on this screen — such as a 160px cap on the' +
    ' name-column placeholder — is exactly what the design-system rule forbids: anything missing' +
    ' goes into the design system and is recorded in the spec’s DS gaps table, never improvised' +
    ' per screen, and amending that table is a spec edit this run does not make.',
});

/* ------------------------------------------------------------------ risks */
{
  const i = h.risks.findIndex((r) => r.risk.startsWith('The country picker the two screens reuse'));
  if (i < 0) throw new Error('picker risk row not found');
  h.risks[i] = {
    risk:
      'Two lists named COUNTRY_OPTIONS now sit in one repository — the package’s 249 assigned codes' +
      ' and the web app’s 245 phone codes — and the wrong import compiles, renders and only fails' +
      ' when somebody picks Kosovo.',
    mitigation:
      'T8 maps the package’s list once, in apps/web/src/stated-country-options.ts, and both pickers' +
      ' import that; the web list keeps the phone field and the holiday form, and any file holding' +
      ' both imports aliases one. TC-01-E2E-07 and TC-01-E2E-08 pick a country by label through the' +
      ' new list, and the writes refuse anything outside it, so a wrong list is a refused save' +
      ' rather than a silent one.',
  };
}
h.risks.push(
  {
    risk:
      'The organization country picker now offers no way to clear a country once one is set: the' +
      ' spec pins its options to COUNTRY_OPTIONS and gives no label for a "no country" option, and' +
      ' inventing one would put a user-facing string outside packages/validation.',
    mitigation:
      'Planned as the spec states it. REQ-01-034 is an API rule and every case for it' +
      ' (TC-01-INT-12, TC-01-INT-21, TC-01-INT-24) clears through the endpoint, so nothing the' +
      ' document asks for is unobservable; the consequence is recorded as a note on this verdict' +
      ' so a person, not this run, decides whether the screen owes that option.',
  },
  {
    risk:
      'The banner’s fallback chain is one term longer than the rule, and the extra term is the one' +
      ' that reads plausibly: `body?.message` is populated on every Nest error, so the generic' +
      ' branch behind it never runs and the reader gets "Internal server error".',
    mitigation:
      'T7 states the whole chain literally — `fields ? Object.values(fields)[0] :' +
      ' HOLIDAY_MESSAGES.toastServerError` — and T8 states the same shape for the organization' +
      ' country save, so the two surfaces this run touches draw only what the contracts’ Error' +
      ' Messages table carries.',
  },
);

/* ------------------------------------------------------------------ sections */
h.sections['Known Gaps'] =
  'no task — five accepted states, each already true of the design: the frozen workingDays' +
  ' contract is untouched, both columns land null (the deploy-day step is an operational action,' +
  ' not code), a member with no country anywhere gets global holidays only, the 100-row cap is a' +
  ' flat number the refusal names, and a holiday row carrying AC, TA or XK reaches nobody — the' +
  ' three codes the holiday form’s own picker offers and the assigned list does not, which is why' +
  ' T8 draws both stated-country pickers from the assigned list and leaves that form alone.';

writeFileSync(`${DIR}/handoff.json`, `${JSON.stringify(h, null, 2)}\n`);
process.stdout.write(`handoff updated: ${h.tasks.length} tasks, sha ${h.spec.sha256.slice(0, 12)}\n`);
