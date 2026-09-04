/**
 * Replan, round 4. Folds the three findings review attempt 2 halted on into handoff.json:
 *   F1  the organization country PUT still clears on an absent `countryCode` key   -> T4
 *   F2  the two helpers §Shared code names exist nowhere; one was restated in the API -> T2, T3, T7, T9
 *   F3  (spec, now amended at 30b415e) the organization picker gains the option that clears it -> T2, T8, T9
 *
 * Every non-ASCII character is built from its code point: the em dash of the new message
 * row is part of the message text and a mangled one would ship as a different string.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const HANDOFF =
  '.workflow/runs/2026-09-04T16-38-40_time-off-01-vacation-calendar/handoff.json';

const EM = String.fromCharCode(0x2014); // em dash, U+2014
const SECT = String.fromCharCode(0xa7); // section sign
const NL = String.fromCharCode(10);

const ORG_NONE_OPTION = 'No country ' + EM + ' global holidays only';

const h = JSON.parse(readFileSync(HANDOFF, 'utf8'));

const task = (id) => {
  const t = h.tasks.find((x) => x.id === id);
  if (!t) throw new Error('no task ' + id);
  return t;
};
const append = (id, text) => {
  const t = task(id);
  t.detail = t.detail + ' ' + text;
};

/* ------------------------------------------------------------------ T2 */
append(
  'T2',
  'REPLAN, round 4 - THE TWO HELPERS ARE STILL NOT ON DISK, AND THERE IS A TWELFTH MESSAGE. ' +
    '(a) `git grep -n "timeOffCalendarToday\\|resolveTimeOffCalendarTimezone" -- specs apps packages e2e` ' +
    'answers with the two contract lines and no code: commit c75a6bb deleted both from ' +
    'packages/validation/src/time-off-calendar.ts, which now ends at :257 with validateStatedCountryCode, ' +
    'and the zone fallback was restated privately inside the API instead (time-off-calendar.service.ts:410, ' +
    'reportedTimezone). ' + SECT + 'Shared code names both as exports beside TIME_OFF_CALENDAR_MESSAGES ' +
    '(contracts:213-214), so write both in packages/validation/src/time-off-calendar.ts and re-export them ' +
    'from the package root the way that module’s other exports already are. ' +
    'resolveTimeOffCalendarTimezone(timezone: string | null | undefined): string answers \'UTC\' when the ' +
    'value is null, undefined or blank after a trim, and \'UTC\' when new Intl.DateTimeFormat(\'en-CA\', ' +
    '{ timeZone: value }) throws; otherwise the stated value verbatim, unnormalized. ' +
    'timeOffCalendarToday(timezone: string | null | undefined, instant: Date = new Date()): string is ONE ' +
    'LINE: return todayInTimeZone(resolveTimeOffCalendarTimezone(timezone), instant). IT MUST DELEGATE - ' +
    'todayInTimeZone (packages/validation/src/requests.ts:639) ships, is exported from the root and already ' +
    'carries the en-CA formatting, so a second Intl.DateTimeFormat(\'en-CA\', { year, month, day }) anywhere ' +
    'in this diff is a second implementation of one rule, which is exactly what the named export exists to ' +
    'prevent. Neither helper may live in apps/api or in apps/web: the endpoint and the screen both read them. ' +
    '(b) TIME_OFF_CALENDAR_MESSAGES gains a TWELFTH row, superseding round 2’s "exactly the eleven rows": ' +
    'orgCountryNoneOption, whose text is "' + ORG_NONE_OPTION + '" (contracts:178). The separator is an EM ' +
    'DASH (U+2014), not a hyphen - copy the row’s own characters, because the static gate matches the ' +
    'table text literally. It labels the first option of org-country-select and is the only thing in the ' +
    'product that clears the organization country (contracts:344-348).',
);

/* ------------------------------------------------------------------ T3 */
append(
  'T3',
  'REPLAN, round 4 - range.today AND range.timezone BOTH COME FROM packages/validation. ' +
    '`today: timeOffCalendarToday(stated)` and `timezone: resolveTimeOffCalendarTimezone(stated)` (T2), and ' +
    'the private reportedTimezone at time-off-calendar.service.ts:407-419 is DELETED with its comment. ' +
    'Round 1’s "via Intl ... the currentYearIn idiom" is superseded: it was right about the answer and ' +
    'wrong about where it is written. After this the service decides nothing about which day today is or ' +
    'which zone it was read in - it imports the two helpers and passes Account.timezone through them.',
);

/* ------------------------------------------------------------------ T4 */
append(
  'T4',
  'REPLAN, round 4 - THE ABSENT KEY STILL CLEARS, AND THE FILE ARGUES FOR IT. Round 3 planned this rule and ' +
    'the code did not move: organization-country.service.ts:76 hands (input ?? {}).countryCode straight to ' +
    'validateStatedCountryCode, undefined normalizes to { valid: true, value: null } ' +
    '(packages/validation/src/time-off-calendar.ts:250), :84 writes it, and a body of {} - or a mistyped ' +
    '{"country":"PL"} - answers 200 {"countryCode":null} on an organization that had PL, dropping every ' +
    'member who relied on the second hop of REQ-01-026. TEST THE KEY FIRST, in the exact idiom the member ' +
    'write beside it uses (members.service.ts:454): ' +
    'const wantsCountry = input !== null && typeof input === \'object\' && \'countryCode\' in input. ' +
    'WHEN IT IS FALSE: touch nothing - no prisma.organization.update and NO organization_country_set log ' +
    'line, because nothing was set - read the stored value with the same select the GET uses and answer 200 ' +
    '{ countryCode } unchanged. WHEN IT IS TRUE: exactly what ships today - rule 9, 422 on a refusal, the ' +
    'write, the log line; an explicit null or an empty string IS a submission and clears (REQ-01-034). ' +
    'DELETE the comment at :72-75, which states the reading the document reversed ("An absent countryCode ' +
    'key clears the column, which is the opposite of the member update beside it, and deliberately") - a ' +
    'file may not carry a decision the spec has settled the other way. Put the settled reason in its place: ' +
    'clearing on an absent key lets a mistyped key drop the country the fallback depends on (spec:359, ' +
    'contracts:133-134). The interface comment at :23-26 ("`null` and `\'\'` both clear") is true and ' +
    'incomplete - an absent key is not a submission. DO NOT change validateStatedCountryCode to refuse ' +
    'undefined: normalizing empty, null and undefined to null is the validator’s contract, the member ' +
    'write depends on it for a present key carrying null, and TC-01-UNIT-01’s block asserts it. Presence ' +
    'is the ROUTE’s question, and after this both country routes answer it the same way.',
);

/* ------------------------------------------------------------------ T7 */
append(
  'T7',
  'REPLAN, round 4 - the screen calls the NAMED helper. CalendarScreen.tsx:139 becomes ' +
    'const today = (): string => timeOffCalendarToday(session.account.timezone), importing ' +
    'timeOffCalendarToday from @devscribed/validation in place of todayInTimeZone. The behaviour is the one ' +
    'round 3’s fix already gave it; what changes is that the screen and the endpoint now name the same ' +
    'export, which is what ' + SECT + 'Shared code says that export is for. Nothing else on this screen moves.',
);

/* ------------------------------------------------------------------ T8 */
append(
  'T8',
  'REPLAN, round 4 - THE ORGANIZATION PICKER GAINS THE OPTION THAT CLEARS IT. This SUPERSEDES round 3’s ' +
    '"org-country-select draws STATED_COUNTRY_OPTIONS and NOTHING above it". Narrowing that picker to the ' +
    '249 assigned codes left the product with no way to reach the state REQ-01-034 is about, and the ' +
    'document was amended for it (30b415e): ' + SECT + 'Screens now reads "Its first option is labelled from ' +
    'TIME_OFF_CALENDAR_MESSAGES.orgCountryNoneOption, submits `null` and is what REQ-01-034 clears through - ' +
    'without it the rule would have no control behind it. Below it, COUNTRY_OPTIONS from ' +
    '@devscribed/validation" (contracts:344-348), with the message as a new Error Messages row ' +
    '(contracts:178). Build the list at module scope in ' +
    'apps/web/app/org/[orgId]/settings/holidays/page.tsx, beside its use, mirroring MEMBER_COUNTRY_OPTIONS ' +
    'at MemberDetailScreen.tsx:45: const ORG_COUNTRY_OPTIONS = [{ value: \'\', label: ' +
    'TIME_OFF_CALENDAR_MESSAGES.orgCountryNoneOption }, ...STATED_COUNTRY_OPTIONS]. NOT in ' +
    'apps/web/src/stated-country-options.ts - that module is the one country list both pickers share, and ' +
    'the two heads are different sentences because they are different states: the member’s means "use ' +
    'the organization’s country", the organization’s means there is none. The Select draws ' +
    'ORG_COUNTRY_OPTIONS and its value is optionFor(ORG_COUNTRY_OPTIONS, orgCountry), so a stored null now ' +
    'paints that label instead of the Select’s placeholder. Do NOT reuse ALL_COUNTRIES ' +
    '(./country-options.ts:6) for this control’s state or option value: that constant is the holiday ' +
    'FILTER’s "everywhere" and this empty means "no country" - use the empty string here and let the ' +
    'option’s label carry the meaning. handleSaveCountry needs no change: an empty value already submits ' +
    '{ countryCode: null } (page.tsx:166), which is REQ-01-034’s clearing branch. DELETE the comment at ' +
    'page.tsx:369-371 ("the spec gives this picker no option meaning \'no country\', and no export holds a ' +
    'label for one") - true of the document before the amendment, false of it now. The member picker is ' +
    'unchanged.',
);

/* ------------------------------------------------------------------ T9 */
append(
  'T9',
  'REPLAN, round 4 - three case repairs, and one trap in the amended steps. (i) TC-01-INT-20 ' +
    '(apps/api/test/time-off-calendar.spec.ts:849) now covers the absent-key no-op beside the clear. THE ' +
    'ORDER THE STEPS NAME DOES NOT OBSERVE IT: after the empty value the stored country is already null, so ' +
    'a keyless body answers { countryCode: null } whether the route no-ops or clears, and the assertion ' +
    'cannot fail. Keep every step the case names and make the third one bite - set PL; submit ' +
    '{ countryCode: \'\' } and assert 200 { countryCode: null }; set PL again; then submit a body with no ' +
    'countryCode key (.send({})) and assert 200 { countryCode: \'PL\' }; then GET the route and assert PL is ' +
    'still stored. "Changes nothing" is only observable against a country that was there to lose, which is ' +
    'what the case’s own words describe ("a mistyped key must not drop a country the fallback depends ' +
    'on"). (ii) TC-01-E2E-07 (e2e/tests/time-off-calendar.spec.ts:402) gains its second save: after the ' +
    'marker is visible, return to Settings > Holidays, open org-country-select, choose the FIRST option, ' +
    'save, expect the picker to paint that option’s label back, then open the calendar at the same ' +
    'month and expect calendar-cell-holiday-{member.id}-2026-09-16 to have count 0. Name the option by ' +
    'importing TIME_OFF_CALENDAR_MESSAGES from @devscribed/validation and passing .orgCountryNoneOption to ' +
    'getByRole(\'option\', { name, exact: true }) - the way e2e/tests/holidays.spec.ts:2 already imports ' +
    'HOLIDAY_MESSAGES - never by writing the text out. (iii) The describe block carrying TC-01-UNIT-02 gets ' +
    'the today helper back, and this time all three limbs of REQ-01-018’s fallback: fix an instant; ' +
    'assert timeOffCalendarToday(\'Pacific/Kiritimati\', instant) and (\'Pacific/Niue\', instant) answer ' +
    'their own calendar dates and differ; assert null, \'\' and an unrecognized zone (\'Mars/Olympus\') all ' +
    'answer the UTC date for that instant; assert resolveTimeOffCalendarTimezone answers \'UTC\' for those ' +
    'three and the stated zone for a real one. The unrecognized limb is edge case 18’s third ' +
    '(contracts:420) and packages/validation/src/requests.test.ts:236-241 covers null and \'\' only, so ' +
    'nothing else in the repository asserts it. (iv) The "carries the tabulated message text, verbatim" ' +
    'block gains orgCountryNoneOption, asserted against the row’s own characters, em dash included.',
);

/* ------------------------------------------------------------------ summary */
h.summary =
  h.summary +
  ' REPLAN, round 4: the document settled the last halt in its own text - the organization picker gains a ' +
  'first option meaning "no country", labelled from a new message export, because narrowing that picker to ' +
  'the assigned list had left REQ-01-034 with no control behind it. Two code blockers ride with it, both of ' +
  'them rules round 3 already planned and the diff did not carry: the organization country PUT must decide ' +
  'on the PRESENCE of the countryCode key, the way the member write beside it does, so a keyless or ' +
  'mistyped body changes nothing; and the two helpers ' + SECT + 'Shared code names - timeOffCalendarToday ' +
  'and resolveTimeOffCalendarTimezone - must exist as exports of packages/validation, read by both the ' +
  'endpoint and the screen, with the API’s private restatement of the zone fallback deleted.';

/* ------------------------------------------------------------------ messages */
h.messages.push({
  context:
    'the first option of the organization country picker - the state in which the organization has no ' +
    'country and its members get global holidays only (REQ-01-034)',
  module:
    'packages/validation/src/time-off-calendar.ts ' + EM + ' TIME_OFF_CALENDAR_MESSAGES.orgCountryNoneOption ' +
    '(new, contracts:178): "' + ORG_NONE_OPTION + '"',
  emittedBy:
    'apps/web/app/org/[orgId]/settings/holidays/page.tsx ' + EM + ' the head of ORG_COUNTRY_OPTIONS, drawn ' +
    'by org-country-select; no route emits it',
});

/* ------------------------------------------------------------------ premises */
h.premises.push(
  {
    claim:
      'todayInTimeZone already falls back to UTC for a null, empty AND unrecognized zone, so ' +
      'timeOffCalendarToday can delegate to it rather than restate the en-CA formatting',
    verifiedAt: 'packages/validation/src/requests.ts:639-652 (the try/catch returns the UTC date)',
  },
  {
    claim:
      'the member update decides whether to touch the country column by the presence of the key, which is ' +
      'the idiom the organization write must adopt',
    verifiedAt: 'apps/api/src/members/members.service.ts:454 and the spread at :500',
  },
  {
    claim:
      'neither helper the contracts name exists in the tree, and the API restates one of them privately',
    verifiedAt:
      'git grep over specs apps packages e2e returns contracts.md:213-214 only; ' +
      'apps/api/src/time-off/time-off-calendar.service.ts:407-419 (private reportedTimezone)',
  },
  {
    claim:
      'the design system Select has no clear affordance, so "no country" has to be an option in the list ' +
      'rather than a control beside it',
    verifiedAt: 'packages/ds/src/components/forms/Select.tsx:23-63 (SelectProps carries no isClearable)',
  },
);

/* ------------------------------------------------------------------ risks */
h.risks.push(
  {
    risk:
      'Two country pickers now carry a first option with the same empty value and different meanings - the ' +
      'member’s defers to the organization, the organization’s says there is none - and one label ' +
      'reused on the other control would state the wrong rule on screen while everything still saves.',
    mitigation:
      'The two labels are two exports and the spec names which control draws which: ' +
      'memberCountryDefaultOption on member-country-select, orgCountryNoneOption on org-country-select. ' +
      'Neither list is built in the shared module; each is assembled beside the control it belongs to, over ' +
      'the one shared STATED_COUNTRY_OPTIONS.',
  },
  {
    risk:
      'The absent-key no-op is invisible against a null column, so a case that clears first and then sends ' +
      'the keyless body passes under the implementation the rule forbids.',
    mitigation:
      'TC-01-INT-20 re-sets PL before the keyless write and reads the value back afterwards (T9 i), so the ' +
      'assertion fails against a route that clears on an absent key.',
  },
);

writeFileSync(HANDOFF, JSON.stringify(h, null, 2) + NL, 'utf8');
console.log('round 4 folded in: tasks touched T2 T3 T4 T7 T8 T9; messages ' + h.messages.length +
  ', premises ' + h.premises.length + ', risks ' + h.risks.length);
