---
id: "03"
title: Field Autofill
routes: ["Contract details tab on /org/{orgId}/members/{memberId}", "/org/{orgId}/documents/new"]
api: ["GET/PUT .../members/{memberId}/profile", "GET .../autofill-sources", "POST .../envelopes (subjectMembershipId)"]
entities: [MemberProfile]
tags: [autofill, member-profile, pii, binding, subject, snapshot, masking]
depends-on: ["01", "02"]
---

# 03 — Field Autofill

## Summary

Filling the same name, address, and tax id into every contract by hand is where a document builder
stops being useful. This spec binds template fields to member data: a template field declares an
`AutofillSource`, an envelope names a **subject member**, and at envelope creation the values are
resolved and written into the draft.

Contracts need facts the system does not record today — address, tax id, date of birth, identity
document, bank details. This spec therefore introduces `MemberProfile`, a one-to-one extension of
`Membership` holding contract-relevant details, along with the access rules that sensitive data
requires.

Autofill is a **starting point, not a lock**: every autofilled value remains editable in the draft,
and values are **snapshotted** at envelope creation so that later profile edits never alter a
document already in flight.

**Depends on:** Spec 01 (TemplateField.AutofillSource), Spec 02 (Envelope, FieldValues).

## Actors & Preconditions

- **Actors:** `admin` views and edits any member's contract details and selects the subject when
  creating an envelope. `manager` selects the subject and sees masked profile values. A member
  views and edits their **own** contract details. `viewer` has no access.
- **Preconditions:** at least one published template with fields carrying an `AutofillSource`
  (spec 01), and an active membership to act as the subject.

## Roles & Permission Matrix

| Capability | admin | manager | user (own) | user (other) | viewer |
|---|---|---|---|---|---|
| `ViewMemberProfile` — see contract details, masked | ✅ | ✅ | ✅ | ❌ | ❌ |
| `ViewMemberProfilePii` — see full values | ✅ | ❌ | ✅ | ❌ | ❌ |
| `EditMemberProfile` | ✅ | ❌ | ✅ | ❌ | ❌ |
| Select a subject when creating an envelope | ✅ | ✅ | ❌ | ❌ | ❌ |

A `manager` can create a contract for a member without being able to read that member's passport
number — the values flow into the document, and the ones they are not cleared for render masked in
the fill form until sending.

## Functional Requirements

### Autofill sources

1. An `AutofillSource` is a dotted path from a fixed, closed catalogue. Arbitrary expressions are
   not supported — this is a lookup table, not a template language.
2. The catalogue for this release:

   | Source | Type | Resolves to |
   |---|---|---|
   | `member.firstName` | text | `Account.firstName` of the subject |
   | `member.lastName` | text | `Account.lastName` |
   | `member.fullName` | text | `firstName + " " + lastName` |
   | `member.email` | email | `Account.email` |
   | `member.jobTitle` | text | `Membership.jobTitle` (user-management spec 05) |
   | `member.joinedAt` | date | `Membership.joinedAt`, ISO `YYYY-MM-DD` |
   | `member.addressLine` | text | `MemberProfile.addressLine` |
   | `member.city` | text | `MemberProfile.city` |
   | `member.postalCode` | text | `MemberProfile.postalCode` |
   | `member.country` | text | `MemberProfile.country`, rendered as the country name |
   | `member.fullAddress` | multiline | composed from the four address parts, blank parts skipped |
   | `member.taxId` | text | `MemberProfile.taxId` — УНП, EIN, or equivalent |
   | `member.dateOfBirth` | date | `MemberProfile.dateOfBirth` |
   | `member.idDocumentNumber` | text | `MemberProfile.idDocumentNumber` |
   | `member.bankDetails` | multiline | `MemberProfile.bankDetails` |
   | `org.name` | text | `Organization.name` |
   | `today` | date | Server date in the organization timezone, ISO `YYYY-MM-DD` |

3. `GET .../autofill-sources` returns the catalogue with labels and value types so the template
   editor's autofill picker is driven by the server, never by a hardcoded client list.
4. The picker offers only sources whose value type is compatible with the field type. A `date`
   field cannot bind to `member.fullName`.
5. A source may be bound to any number of fields. A field binds to at most one source.

### Resolution

6. Autofill resolves **once**, at envelope creation, for every field whose `AutofillSource` is set
   — regardless of `FilledBy`. A signer-owned field with a source arrives pre-filled and the signer
   may correct it.
7. A source that resolves to null or an empty string leaves the field empty. It is never an error,
   and it never blocks creation: an incomplete profile produces a draft with gaps, which the sender
   fills by hand.
8. Resolved values are **snapshotted** into `Envelope.FieldValues`. Editing the member's profile
   afterwards has no effect on any existing envelope, draft or sent. There is no live binding.
9. Values are normalized to the field's type at resolution: dates to ISO `YYYY-MM-DD`, text
   trimmed, country codes expanded to names.
10. A resolved value longer than the field's `MaxLength` is stored truncated **and** flagged, so the
    sender sees a warning rather than a silently shortened contract clause.
11. `POST .../envelopes` returns an `autofilled` array listing the keys that were populated, so the
    fill form can mark them.
12. Creating an envelope without a `subjectMembershipId` is allowed. `member.*` sources resolve to
    empty; `org.*` and `today` still resolve.
13. If the subject membership is `removed`, resolution still works — a contract may legitimately be
    issued for someone who has just left — but the subject picker marks them as removed and does not
    offer them by default.

### Member profile

14. `MemberProfile` is created lazily on first save; a member with no profile behaves exactly like
    a member with an all-null profile.
15. Contract details are edited on a **Contract details** tab of the member detail screen
    (user-management spec 05), not inside the document builder.
16. All fields are optional. The profile is never a prerequisite for anything — its absence
    degrades autofill, nothing else.
17. Country is stored as an ISO 3166-1 alpha-2 code and displayed as a name.
18. Editing the profile writes an entry to the existing member activity surface with the **names**
    of the changed fields only, never their values.

### PII handling

19. `taxId`, `dateOfBirth`, `idDocumentNumber`, and `bankDetails` are **sensitive**. Every read of
    them is authorized by `ViewMemberProfilePii`.
20. Callers without that capability receive masked values: `taxId` and `idDocumentNumber` as
    `***4567` (last four characters), `dateOfBirth` as the year only, `bankDetails` as `••••`. The
    response marks each masked field so the UI does not present a mask as an editable value.
21. Sensitive values never appear in application logs, error messages, `EnvelopeEvent.Metadata`
    (spec 02 requirement 40), or any analytics payload.
22. A masked value is never written back. A `PUT` carrying a mask string for a field the caller
    cannot read leaves that field unchanged rather than storing `***4567`.
23. Once a value has been snapshotted into an envelope it is part of the contract and is shown in
    full in the document to anyone who can view that envelope — a contract that hides its own terms
    would be useless. The masking rule governs the **profile**, not the document.
24. Column-level encryption is out of scope for this release and recorded as a known gap; the
    database is encrypted at rest, and access is capability-gated.

## Data Model

### MemberProfile

One-to-one with `Membership`. All fields nullable.

| Field | Type | Sensitive | Description |
|---|---|---|---|
| `Id` | Guid | | Primary key |
| `MembershipId` | Guid (FK, unique) | | References `Membership.Id`. Cascade delete. |
| `AddressLine` | string(200)? | | Street address. |
| `City` | string(100)? | | |
| `PostalCode` | string(20)? | | |
| `Country` | string(2)? | | ISO 3166-1 alpha-2. |
| `TaxId` | string(40)? | ✅ | УНП, EIN, or local equivalent. |
| `DateOfBirth` | DateOnly? | ✅ | |
| `IdDocumentNumber` | string(40)? | ✅ | Passport or national id number. |
| `BankDetails` | string(500)? | ✅ | Free-form: IBAN, SWIFT, account name. |
| `UpdatedAt` | DateTime | | |
| `UpdatedByAccountId` | Guid? (FK) | | |

### Extended from spec 01

`TemplateField.AutofillSource` — `string(80)?`, one of the catalogue keys or `null`.

### Extended from spec 02

`Envelope.SubjectMembershipId` — `Guid?`, the member whose data was used. Nullable, `SetNull` on
member deletion so the envelope survives.

### New Capabilities (extend `Capability` enum)

- `ViewMemberProfile` — see contract details, masked where applicable (admin, manager, self)
- `ViewMemberProfilePii` — see sensitive values in full (admin, self)
- `EditMemberProfile` — edit contract details (admin, self)

## Screens

### Member detail — Contract details tab

```
┌─────────────────────────────────────────────────────────────────────┐
│  About   Vacation   [ CONTRACT DETAILS ]   Projects   Payments      │
│                                                                     │
│  ┌─ Contract details ──────────────────────── [ Edit ] ──────────┐ │
│  │                                                                │ │
│  │  Used to fill contracts automatically. All fields optional.    │ │
│  │                                                                │ │
│  │  Address        Nezavisimosti Ave 1, apt 5                     │ │
│  │  City           Minsk                                          │ │
│  │  Postal code    220030                                         │ │
│  │  Country        Belarus                                        │ │
│  │                                                                │ │
│  │  Tax ID (УНП)   191234567                              🔒      │ │
│  │  Date of birth  14 March 1991                          🔒      │ │
│  │  ID document    MP1234567                              🔒      │ │
│  │  Bank details   IBAN BY13 ALFA 3014 …                  🔒      │ │
│  │                                                                │ │
│  │  Last updated 20 Aug 2026 by Ivan Demchenko                    │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### Contract details — manager view (masked)

```
│  │  Tax ID (УНП)   ***4567                                🔒      │ │
│  │  Date of birth  1991                                   🔒      │ │
│  │  ID document    ***4567                                🔒      │ │
│  │  Bank details   ••••                                   🔒      │ │
│  │                                                                │ │
│  │  Some values are hidden. Ask an admin if you need them.        │ │
```

### Autofill picker in the template field modal (extends spec 01)

```
┌─────────────── Edit field ─────────────────────────┐
│                                                     │
│  Key *              [ contractor_tax_id      ]      │
│  Label *            [ УНП                    ]      │
│  Type *             [ Text                 ▾ ]      │
│  Filled by *        [ Sender               ▾ ]      │
│                                                     │
│  Autofill from      [ Member · Tax ID       ▾ ]     │
│    ├ — none —                                       │
│    ├ Member · Full name                             │
│    ├ Member · Tax ID                          ✓     │
│    ├ Member · Date of birth        (date — hidden)  │
│    ├ Member · Full address                          │
│    ├ Organization · Name                            │
│    └ Today                         (date — hidden)  │
│                                                     │
│  Date sources are hidden because this is a text     │
│  field.                                             │
│                                                     │
│             [ Cancel ]  [ Save field ]              │
└─────────────────────────────────────────────────────┘
```

### New document — subject picker and autofill markers (extends spec 02)

```
│  Template *   [ Contractor agreement BY (v3)          ▾ ]           │
│  Subject      [ Alex Kaminski                         ▾ ]           │
│                 └ Fills 5 of 7 fields from this member's profile    │
│                                                                     │
│  ┌─ Fields you fill ─────────────────────────────────────────────┐ │
│  │  Full name *      [ Alex Kaminski           ]  ⟲ from profile │ │
│  │  УНП *            [ 191234567               ]  ⟲ from profile │ │
│  │  Address *        [ Nezavisimosti Ave 1, …  ]  ⟲ from profile │ │
│  │  Contract date *  [ 2026-08-24              ]  ⟲ today        │ │
│  │  Contract no. *   [                         ]                 │ │
│  │                                                               │ │
│  │  ⚠ 2 fields could not be filled — this member's profile has   │ │
│  │    no bank details or ID document.        [ Open profile ]    │ │
│  └───────────────────────────────────────────────────────────────┘ │
```

## Flows

### Flow: Admin fills a member's contract details

1. Admin opens a member detail screen and switches to Contract details.
2. Admin clicks "Edit", fills address, tax id, date of birth, and bank details, saves.
3. System sends `PUT .../members/{memberId}/profile`.
4. On success: toast "Contract details saved"; the card returns to read mode.

### Flow: Admin binds a template field to a member source

1. Admin edits a template (spec 01) and opens a field.
2. Admin picks a source from the Autofill dropdown, which lists only type-compatible entries.
3. Admin saves the field and publishes the template.

### Flow: Autofill on envelope creation

1. Admin clicks "New document", picks the template and a subject member.
2. System sends `POST .../envelopes` with `subjectMembershipId`.
3. The server resolves every bound source against that member, snapshots the values into
   `FieldValues`, and returns the `autofilled` key list.
4. The fill form marks each autofilled input and reports how many fields could not be filled.
5. Admin corrects anything that needs correcting and fills the rest by hand.

### Alt Flow: Incomplete profile (branches from autofill, step 3)

3a. Some sources resolve empty. The envelope is created regardless.
3b. The fill form shows "N fields could not be filled — this member's profile has no {list}" with
    an "Open profile" link that opens the member's Contract details in a new tab.

### Alt Flow: No subject selected

1. Admin creates an envelope without a subject.
2. `member.*` sources resolve empty; `org.name` and `today` still fill.
3. The form shows no warning — this is a deliberate choice, not an incomplete one.

### Alt Flow: Value too long for the field

3a. A resolved value exceeds the field's `MaxLength`.
3b. The value is stored truncated and the field is flagged: "This value was shortened to fit.
    Check it before sending."

### Alt Flow: Manager creates a contract for a member whose PII they cannot read

1. Manager picks a subject and creates the envelope; sensitive sources resolve normally
   server-side.
2. In the fill form those inputs render masked and read-only, marked "Hidden — will be filled
   automatically".
3. On send, the real values are rendered into the document. The manager can view the resulting
   document, because the document is the contract they are authorized to send.

### Alt Flow: Network/server error

- Error toast "Something went wrong. Please try again." The form retains values.

## API Contracts

### GET /api/organizations/{orgId}/autofill-sources

**Authentication:** required. `ViewDocumentTemplates`.

**Response `200`:**
```json
{
  "sources": [
    { "key": "member.fullName", "group": "Member", "label": "Full name", "valueType": "text" },
    { "key": "member.taxId", "group": "Member", "label": "Tax ID", "valueType": "text", "sensitive": true },
    { "key": "member.dateOfBirth", "group": "Member", "label": "Date of birth", "valueType": "date", "sensitive": true },
    { "key": "org.name", "group": "Organization", "label": "Organization name", "valueType": "text" },
    { "key": "today", "group": "System", "label": "Today", "valueType": "date" }
  ]
}
```

`valueType` drives the type-compatibility filter in the picker.

### GET /api/organizations/{orgId}/members/{memberId}/profile

**Authentication:** required. `ViewMemberProfile`, or the caller is the member.

**Response `200` (caller has `ViewMemberProfilePii`):**
```json
{
  "addressLine": "Nezavisimosti Ave 1, apt 5",
  "city": "Minsk",
  "postalCode": "220030",
  "country": "BY",
  "taxId": "191234567",
  "dateOfBirth": "1991-03-14",
  "idDocumentNumber": "MP1234567",
  "bankDetails": "IBAN BY13 ALFA 3014 …",
  "maskedFields": [],
  "updatedAt": "2026-08-20T11:00:00Z",
  "updatedBy": { "id": "uuid", "name": "Ivan Demchenko" },
  "canEdit": true
}
```

**Response `200` (caller lacks `ViewMemberProfilePii`):**
```json
{
  "addressLine": "Nezavisimosti Ave 1, apt 5",
  "city": "Minsk",
  "postalCode": "220030",
  "country": "BY",
  "taxId": "***4567",
  "dateOfBirth": "1991",
  "idDocumentNumber": "***4567",
  "bankDetails": "••••",
  "maskedFields": ["taxId", "dateOfBirth", "idDocumentNumber", "bankDetails"],
  "updatedAt": "2026-08-20T11:00:00Z",
  "updatedBy": { "id": "uuid", "name": "Ivan Demchenko" },
  "canEdit": false
}
```

**Errors:**
- `403`: `{ "error": "forbidden", "message": "You do not have permission to view these details" }`
- `404`: member not found in this organization.

### PUT /api/organizations/{orgId}/members/{memberId}/profile

**Authentication:** required. `EditMemberProfile`, or the caller is the member.

**Request:** any subset of the profile fields. Omitted keys are left unchanged; explicit `null`
clears a field.

```json
{
  "addressLine": "Nezavisimosti Ave 1, apt 5",
  "city": "Minsk",
  "postalCode": "220030",
  "country": "BY",
  "taxId": "191234567",
  "dateOfBirth": "1991-03-14",
  "idDocumentNumber": null,
  "bankDetails": "IBAN BY13 ALFA 3014 …"
}
```

**Success `200`:** the same shape as `GET`, masked according to the caller.

**Errors:**
- `400` (validation): `{ "errors": { "country": "Enter a valid country" } }`
- `403`: `{ "error": "forbidden" }`

A value identical to the mask string for a field the caller cannot read is treated as "unchanged",
never stored.

### POST /api/organizations/{orgId}/envelopes (extended from spec 02)

**Request adds:** `subjectMembershipId` (optional).

**Response adds:**
```json
{
  "autofilled": ["contractor_full_name", "contractor_tax_id", "contract_date"],
  "autofillGaps": [
    { "key": "contractor_bank", "label": "Bank details", "source": "member.bankDetails" }
  ],
  "autofillTruncated": ["contractor_address"]
}
```

**Errors:**
- `400`: `{ "error": "subject_not_found", "message": "The selected member no longer exists" }`

### GET /api/organizations/{orgId}/members?forSubjectPicker=true

Returns active members plus removed members flagged `isRemoved: true`, so the subject picker can
show them without offering them by default. Reuses the existing members endpoint (user-management
spec 04).

## Validation Rules

1. **AddressLine**: optional, max 200 characters. Error: "Address must be at most 200 characters".
2. **City**: optional, max 100 characters. Error: "City must be at most 100 characters".
3. **PostalCode**: optional, max 20 characters. Error: "Postal code must be at most 20 characters".
4. **Country**: optional, a valid ISO 3166-1 alpha-2 code. Error: "Enter a valid country".
5. **TaxId**: optional, max 40 characters, letters, digits, hyphens, and spaces. Error: "Tax ID must
   be at most 40 characters", "Tax ID contains invalid characters".
6. **DateOfBirth**: optional, a real date, not in the future, and at least 16 years ago. Errors:
   "Enter a valid date", "Date of birth cannot be in the future", "Date of birth must be at least 16
   years ago".
7. **IdDocumentNumber**: optional, max 40 characters. Error: "ID document number must be at most 40
   characters".
8. **BankDetails**: optional, max 500 characters. Error: "Bank details must be at most 500
   characters".
9. **AutofillSource** (spec 01 field editor): must be a catalogue key and type-compatible with the
   field. Errors: "Unknown autofill source", "This source cannot fill a {type} field".

Client-side validation mirrors these on blur and submit; the submit CTA is never disabled for
validation. Server-side validation re-runs everything and additionally enforces the mask-write rule.

## Error Messages

| Context | Message |
|---|---|
| Address too long | "Address must be at most 200 characters" |
| City too long | "City must be at most 100 characters" |
| Postal code too long | "Postal code must be at most 20 characters" |
| Invalid country | "Enter a valid country" |
| Tax ID too long | "Tax ID must be at most 40 characters" |
| Tax ID invalid characters | "Tax ID contains invalid characters" |
| Date of birth invalid | "Enter a valid date" |
| Date of birth in the future | "Date of birth cannot be in the future" |
| Date of birth too recent | "Date of birth must be at least 16 years ago" |
| ID document too long | "ID document number must be at most 40 characters" |
| Bank details too long | "Bank details must be at most 500 characters" |
| Unknown source | "Unknown autofill source" |
| Type-incompatible source | "This source cannot fill a {type} field" |
| Subject missing | "The selected member no longer exists" |
| No permission to view | "You do not have permission to view these details" |
| No permission to edit | "You do not have permission to edit these details" |
| Masked hint | "Some values are hidden. Ask an admin if you need them." |
| Autofill gaps | "{n} field(s) could not be filled — this member's profile has no {list}" |
| Autofill truncated | "This value was shortened to fit. Check it before sending." |
| Network/server error | "Something went wrong. Please try again." |
| Toast — profile saved | "Contract details saved" |
| Empty state — no details | "No contract details yet. Add them to fill contracts automatically." |

## UI Description

### Contract details tab (`member-contract-details`)

- Added to the member detail `Tabs` as `member-detail-tab-contract-details`.
- Read mode: a `Card` with label/value rows `profile-row-{field}`. Sensitive rows carry a lock icon
  (`profile-sensitive-{field}`).
- Edit mode: inline form `profile-form` with one input per field; "Save"
  (`profile-save-btn`) and "Cancel" (`profile-cancel-btn`).
- Masked read-only rows show the mask plus the hint banner `profile-masked-hint`; their inputs are
  absent from edit mode entirely rather than rendered disabled with a mask inside.
- Footer line `profile-updated-meta` with the timestamp and the editor's name.
- Empty state `profile-empty` when every field is null.

### Autofill picker (extends the spec 01 field modal)

- `Select` (`template-field-autofill-select`) grouped by source group, populated from
  `GET .../autofill-sources`.
- Type-incompatible entries are omitted, with the explanatory line
  `template-field-autofill-hint` under the control.
- Sensitive sources carry a lock marker in the option label.

### Subject picker and autofill markers (extends the spec 02 fill form)

- `Select` (`envelope-subject-select`) listing active members; removed members appear under a
  "Former members" group with a suffix.
- A summary line `envelope-autofill-summary`: "Fills 5 of 7 fields from this member's profile".
- Each autofilled input carries `envelope-field-autofill-{key}` with a `⟲` marker and a tooltip
  naming the source. The input stays fully editable.
- Gap banner `envelope-autofill-gaps` listing the unfilled fields with an "Open profile" link
  (`envelope-open-profile-link`).
- Truncation warning `envelope-autofill-truncated-{key}` beneath the affected input.
- Masked inputs for a caller without PII access render read-only with
  `envelope-field-masked-{key}` and the note "Hidden — will be filled automatically".

### States

| State | Behavior |
|---|---|
| **Loading** | `Spinner` (`profile-loading`). |
| **No profile** | Empty state with a single "Add contract details" CTA. |
| **Masked** | Sensitive rows show masks and the hint banner; Edit is absent. |
| **Saving** | Save disabled with a loading indicator; inputs read-only (an in-flight guard). |
| **Subject removed** | The picker shows the member under "Former members"; selecting one shows an advisory note, not an error. |
| **No subject** | Autofill summary and gap banner are both absent. |

## Required `data-testid` Attributes

**Contract details tab:**
- `member-detail-tab-contract-details`, `member-contract-details`, `profile-loading`,
  `profile-empty`, `profile-form`, `profile-edit-btn`, `profile-save-btn`, `profile-cancel-btn`,
  `profile-updated-meta`, `profile-masked-hint`
- `profile-row-{field}`, `profile-input-{field}`, `profile-sensitive-{field}`,
  `field-error-{field}` — where `{field}` is one of `addressLine`, `city`, `postalCode`,
  `country`, `taxId`, `dateOfBirth`, `idDocumentNumber`, `bankDetails`

**Template field modal (extends spec 01):**
- `template-field-autofill-select`, `template-field-autofill-hint`

**Fill form (extends spec 02):**
- `envelope-subject-select`, `envelope-autofill-summary`, `envelope-autofill-gaps`,
  `envelope-open-profile-link`, `envelope-field-autofill-{key}`,
  `envelope-autofill-truncated-{key}`, `envelope-field-masked-{key}`

**Toasts:**
- `toast-profile-saved`

## Out of Scope

- **Clients as a first-class entity.** There is no client or customer model in the database today,
  so this release binds only to members and the organization. Client autofill needs a `Client`
  entity first and is the natural next spec in this area.
- Live binding — an envelope that tracks profile edits after creation. Snapshotting is deliberate:
  a contract must not change under the parties' feet.
- Computed and conditional sources (`member.salary × 12`, "address if country is BY").
- Autofill from the vacation, financial, or project surfaces (user-management specs 07–09).
- Column-level encryption of sensitive profile fields, and per-field access audit.
- Bulk import of contract details from a spreadsheet, and profile completeness prompts during
  onboarding.
- Document-side data extraction — reading values back out of a signed contract into the profile.
- Country-specific validation of tax id formats (a УНП and an EIN are both accepted as free text).

## Test Cases

### TC-03-UNIT-01: Source catalogue resolution

- **Level:** Unit
- **Preconditions:** a subject with `firstName: "Alex"`, `lastName: "Kaminski"`, city `Minsk`,
  country `BY`, no bank details.
- **Steps:** resolve `member.fullName`, `member.city`, `member.country`, `member.bankDetails`,
  `org.name`, `today`, and `member.unknownThing`.
- **Expected Result:** `"Alex Kaminski"`; `"Minsk"`; `"Belarus"` (code expanded); `null`; the
  organization name; the ISO date in the org timezone; an error for the unknown key.

### TC-03-UNIT-02: Full address composition skips blanks

- **Level:** Unit
- **Steps:** compose `member.fullAddress` with all four parts, then with `postalCode` and `city`
  missing.
- **Expected Result:** all parts joined in order with no leading, trailing, or doubled separators
  in either case.

### TC-03-UNIT-03: Type compatibility

- **Level:** Unit
- **Steps:** check `member.dateOfBirth` against a `date` field and against a `text` field;
  `member.fullName` against `text` and against `date`.
- **Expected Result:** compatible; incompatible; compatible; incompatible.

### TC-03-UNIT-04: Masking

- **Level:** Unit
- **Steps:** mask `"191234567"`, `"MP1234567"`, `"1991-03-14"`, `"IBAN BY13 …"`, `null`, and
  `"123"` (shorter than the mask window).
- **Expected Result:** `***4567`; `***4567`; `1991`; `••••`; `null`; a fully masked value that
  leaks no digits.

### TC-03-UNIT-05: Truncation flagging

- **Level:** Unit
- **Steps:** resolve a 250-character address into a field with `MaxLength` 200.
- **Expected Result:** the value is 200 characters and the result is flagged as truncated.

### TC-03-INT-01: Autofill on envelope creation

- **Level:** Integration
- **Preconditions:** published template with fields bound to `member.fullName`, `member.taxId`, and
  `today`, plus one unbound field. Subject member with a full profile.
- **Steps:** `POST .../envelopes` with `subjectMembershipId`, then `GET`.
- **Expected Result:** `201`; `fieldValues` contains the three resolved values; `autofilled` lists
  exactly those three keys; the unbound field is empty.

### TC-03-INT-02: Snapshot isolation

- **Level:** Integration
- **Preconditions:** envelope E created with `member.taxId` autofilled as `191234567`.
- **Steps:**
  1. `PUT .../members/{id}/profile` changing `taxId` to `999999999`.
  2. `GET .../envelopes/{E.id}`.
  3. Send E and read `renderedHtml`.
- **Expected Result:** E still holds `191234567` at every step. The profile edit is invisible to it.

### TC-03-INT-03: Missing profile data does not block creation

- **Level:** Integration
- **Preconditions:** subject member with an empty profile; template with three bound fields.
- **Steps:** `POST .../envelopes`.
- **Expected Result:** `201`; those fields are empty; `autofillGaps` names all three with their
  labels and sources; no error.

### TC-03-INT-04: Envelope without a subject

- **Level:** Integration
- **Steps:** `POST .../envelopes` with no `subjectMembershipId`.
- **Expected Result:** `201`; `member.*` fields empty; `org.name` and `today` filled;
  `autofillGaps` is empty because no subject was expected.

### TC-03-INT-05: Autofilled values remain editable

- **Level:** Integration
- **Preconditions:** draft envelope with an autofilled `contractor_full_name`.
- **Steps:** `PUT .../envelopes/{id}` overwriting it, then `GET`.
- **Expected Result:** `200`; the overwritten value is stored; the key still appears in
  `autofilled` for UI marking but carries no lock.

### TC-03-INT-06: PII masking by role

- **Level:** Integration
- **Preconditions:** member M with a full profile; admin A, manager G, member M, and user U in the
  same organization.
- **Steps:** each calls `GET .../members/{M.id}/profile`.
- **Expected Result:** A — full values, `maskedFields` empty. G — masked values,
  `maskedFields` lists all four, `canEdit` false. M (self) — full values, `canEdit` true.
  U — `403`.

### TC-03-INT-07: A mask is never written back

- **Level:** Integration
- **Preconditions:** manager G; member M with `taxId = "191234567"`.
- **Steps:** as G, `PUT .../members/{M.id}/profile` with `taxId: "***4567"`.
- **Expected Result:** `403` (G cannot edit at all). Repeat the same payload as an admin who
  received a masked read in a stale client: the stored `taxId` is unchanged, never `***4567`.

### TC-03-INT-08: Manager creates an envelope for a member whose PII they cannot read

- **Level:** Integration
- **Preconditions:** manager G; member M with a tax id; template bound to `member.taxId`.
- **Steps:** as G, `POST .../envelopes` with M as subject, then `GET .../envelopes/{id}`.
- **Expected Result:** `201`; the tax id resolved correctly server-side; in the envelope response
  the field is marked masked for G; after sending, the rendered document contains the real value
  and G can view it.

### TC-03-INT-09: Removed subject

- **Level:** Integration
- **Preconditions:** member M whose membership status is `removed`, with a full profile.
- **Steps:** `POST .../envelopes` with M as subject.
- **Expected Result:** `201`; autofill resolves normally; the response marks the subject as
  removed.

### TC-03-INT-10: Deleted subject does not break the envelope

- **Level:** Integration
- **Preconditions:** envelope E with `SubjectMembershipId` set; the membership row is then deleted.
- **Steps:** `GET .../envelopes/{E.id}`.
- **Expected Result:** `200`; `SubjectMembershipId` is null; every snapshotted value is intact.

### TC-03-INT-11: Truncation is flagged

- **Level:** Integration
- **Preconditions:** subject with a 250-character address; a field with `MaxLength` 200 bound to
  `member.addressLine`.
- **Steps:** `POST .../envelopes`.
- **Expected Result:** the stored value is 200 characters and `autofillTruncated` names the key.

### TC-03-INT-12: Source catalogue and type filtering

- **Level:** Integration
- **Steps:** `GET .../autofill-sources`; then `PUT` a template draft binding a `text` field to
  `member.dateOfBirth`.
- **Expected Result:** the catalogue lists every source with `valueType` and `sensitive` flags; the
  bind is rejected with "This source cannot fill a text field".

### TC-03-INT-13: Profile validation

- **Level:** Integration
- **Steps:** `PUT .../profile` with `country: "ZZ"`; with a future `dateOfBirth`; with a
  `dateOfBirth` five years ago; with a 600-character `bankDetails`.
- **Expected Result:** `400` in each case with the corresponding message; nothing persisted.

### TC-03-INT-14: Sensitive values stay out of the audit trail

- **Level:** Integration
- **Preconditions:** a completed envelope whose fields include the subject's tax id.
- **Steps:** read every `EnvelopeEvent` for the envelope and the member activity entries for the
  profile edit.
- **Expected Result:** the tax id value appears in neither; the member activity entry names the
  changed field only.

### TC-03-E2E-01: Admin fills contract details

- **Level:** E2E
- **Preconditions:** logged in as admin; member Alex has no profile.
- **Steps:**
  1. Open Alex's member detail, switch to Contract details, verify the empty state.
  2. Click "Add contract details", fill address, city, country, tax id, and date of birth.
  3. Save; verify toast "Contract details saved" and the values in read mode.
  4. Reload and confirm they persist.
- **Selectors:** `member-detail-tab-contract-details`, `profile-empty`, `profile-edit-btn`,
  `profile-input-addressLine`, `profile-input-city`, `profile-input-country`,
  `profile-input-taxId`, `profile-input-dateOfBirth`, `profile-save-btn`, `toast-profile-saved`,
  `profile-row-taxId`.

### TC-03-E2E-02: Autofill visibly prefills the fill form

- **Level:** E2E
- **Preconditions:** logged in as admin; Alex has a full profile; a published template with fields
  bound to `member.fullName`, `member.taxId`, `member.fullAddress`, and `today`, plus one unbound
  field.
- **Steps:**
  1. Click "New document", pick the template, pick Alex as subject.
  2. Verify the four bound inputs are prefilled with Alex's values and today's date, each carrying
     the autofill marker.
  3. Verify the unbound input is empty and the summary reads "Fills 4 of 5 fields".
  4. Overwrite the tax id by hand and verify the input accepts the edit.
- **Selectors:** `envelope-new-btn`, `envelope-template-select`, `envelope-subject-select`,
  `envelope-autofill-summary`, `envelope-field-{key}`, `envelope-field-autofill-{key}`.

### TC-03-E2E-03: Incomplete profile shows gaps, not an error

- **Level:** E2E
- **Preconditions:** logged in as admin; a member with only a name; the same template as above.
- **Steps:** create a document with that member as subject.
- **Expected Result:** the envelope is created; the gap banner names the unfilled fields and offers
  "Open profile"; nothing is blocked.
- **Selectors:** `envelope-autofill-gaps`, `envelope-open-profile-link`, `envelope-fill-form`.

### TC-03-E2E-04: Snapshot survives a profile edit

- **Level:** E2E
- **Preconditions:** logged in as admin; a draft envelope autofilled from Alex.
- **Steps:**
  1. Open Alex's Contract details in another tab and change the tax id.
  2. Return to the draft envelope and reload it.
- **Expected Result:** the envelope still shows the original tax id.
- **Selectors:** `profile-input-taxId`, `profile-save-btn`, `envelope-field-contractor_tax_id`.

### TC-03-E2E-05: Manager sees masked values

- **Level:** E2E
- **Preconditions:** logged in as manager; Alex has a full profile.
- **Steps:** open Alex's Contract details.
- **Expected Result:** address and city are shown in full; tax id and ID document show `***`
  values; date of birth shows the year only; bank details show dots; the masked hint is present and
  Edit is absent.
- **Selectors:** `profile-row-taxId`, `profile-row-dateOfBirth`, `profile-row-bankDetails`,
  `profile-masked-hint`, `profile-edit-btn` (asserted absent).

### TC-03-E2E-06: A member edits their own contract details

- **Level:** E2E
- **Preconditions:** logged in as a regular `user`.
- **Steps:** open own member detail, switch to Contract details, edit the address and bank details,
  save.
- **Expected Result:** full values visible and editable for their own profile; the save succeeds.
- **Selectors:** `member-detail-tab-contract-details`, `profile-edit-btn`,
  `profile-input-addressLine`, `profile-input-bankDetails`, `profile-save-btn`,
  `toast-profile-saved`.

### TC-03-E2E-07: A member cannot see another member's contract details

- **Level:** E2E
- **Preconditions:** logged in as a regular `user`; another member Alex exists.
- **Steps:** navigate directly to Alex's member detail Contract details tab.
- **Expected Result:** the tab is absent or the panel renders a forbidden state; no profile value
  is visible.
- **Selectors:** `member-detail-tab-contract-details` (asserted absent),
  `member-contract-details` (asserted absent).

### TC-03-E2E-08: Autofilled Cyrillic values reach the signed document

- **Level:** E2E
- **Preconditions:** logged in as admin; a member whose name and address are in Cyrillic; a
  Russian-language template bound to those sources.
- **Steps:** create the document with that subject, send it, sign with both parties, download the
  PDF, extract its text.
- **Expected Result:** the extracted text contains the member's Cyrillic name and address exactly
  as stored, with no replacement characters.
- **Selectors:** `envelope-subject-select`, `envelope-send-btn`, `envelope-download-btn`.
