---
id: "01"
title: Document Templates
routes: ["/org/{orgId}/documents/templates", "/org/{orgId}/documents/templates/{templateId}"]
api: ["GET/POST .../document-templates", "PUT .../document-templates/{id}/draft", "POST .../document-templates/{id}/publish", "POST .../document-templates/{id}/archive", "DELETE .../document-templates/{id}", "POST .../document-templates/{id}/preview"]
entities: [DocumentTemplate, DocumentTemplateVersion, TemplateField]
tags: [template, html, placeholder, field, version, publish, archive, sanitize, optimistic-lock, capability]
depends-on: []
---

# 01 — Document Templates

## Summary

An organization stores reusable contract templates. A template is an HTML body containing
`{{placeholder}}` tokens, a set of field definitions describing those tokens, and exactly two
signer roles. Templates are versioned: a published version is frozen forever, and editing a
published template produces a new draft version alongside it. Envelopes (spec 02) bind to a
specific version, so template maintenance can never alter a document that has already been sent
or signed.

This spec covers template CRUD, the field model, the placeholder contract, HTML sanitization,
versioning, publishing, and archival. Filling and signing are spec 02; automatic field values are
spec 03.

## Actors & Preconditions

- **Actors:** `admin` creates, edits, publishes, archives, and deletes templates. `manager` may
  view templates and their preview. `user` and `viewer` have no access to this surface.
- **Preconditions:** an active membership in the organization.

## Roles & Permission Matrix

| Capability | admin | manager | user | viewer |
|---|---|---|---|---|
| `ViewDocumentTemplates` — list, open, preview | ✅ | ✅ | ❌ | ❌ |
| `ManageDocumentTemplates` — create, edit, publish, archive, delete | ✅ | ❌ | ❌ | ❌ |

Capability checks run against the normalized role (see the role-enum note in the area README);
the legacy `member` value normalizes to `user` and therefore has no access.

## Functional Requirements

### Template lifecycle

1. A template is created with a **name** and an optional **description**. It starts in status
   `draft` with version 1, also in draft, with an empty body and no fields.
2. Template names are unique within the organization, compared case-insensitively after trimming.
   A duplicate is rejected with "A template with this name already exists".
3. A template has exactly one of three statuses: `draft` (never published), `published` (has a
   current version), `archived` (retired, cannot back new envelopes).
4. `CurrentVersionId` points at the version used for new envelopes. It is `null` until the first
   publish and only ever changes on a successful publish.
5. Archiving is a one-way action in this release; the confirmation dialog says so. Unarchiving is
   out of scope.
6. A template may be hard-deleted **only** if no version of it has ever been referenced by an
   envelope. Otherwise deletion is rejected and the UI offers archival instead.

### Versioning

7. Editing a template edits its **draft version**. If none exists (the template is `published`
   and has no open draft), the first edit clones the current version into a new draft with
   `VersionNumber = max + 1`.
8. A version with a non-null `PublishedAt` is **immutable**. No endpoint may modify its
   `BodyHtml`, `FieldsSnapshot`, or `SignerRoles`.
9. Publishing sets `PublishedAt`, snapshots the ordered field definitions into `FieldsSnapshot`,
   and moves `CurrentVersionId` to that version. The template status becomes `published`.
10. At most one draft version per template may exist at a time.
11. Concurrent edits are guarded by `RowVersion`. A save carrying a stale `RowVersion` is
    rejected with "This template was changed by someone else. Reload to see the latest version."

### Body and placeholders

12. The body is HTML. Placeholders use the syntax `{{field_key}}` — a single pair of braces
    around a field key, with optional surrounding whitespace (`{{ field_key }}`). There are no
    conditionals, no loops, no nesting, and no filters.
13. A field key is `snake_case`: lowercase ASCII letters, digits, and underscores; must start
    with a letter; 1–64 characters. Keys are unique within a version.
14. The keys `signature_company`, `signature_counterparty`, `signed_date`, and `document_id` are
    **reserved** — the renderer supplies them. Defining a field with a reserved key is rejected.
15. **Publish-time validation:** every placeholder in the body must resolve to a defined field.
    Unknown placeholders reject the publish and are listed by key.
16. A defined field that appears nowhere in the body is permitted — it may exist for metadata or
    autofill purposes — but the editor shows an "unused field" warning.
17. A malformed placeholder (unbalanced braces, illegal key characters) rejects the save with the
    character offset.
18. The body is limited to 1 MB of HTML.

### Sanitization

19. The body is sanitized **server-side on every save**, and the sanitized result is what is
    stored. What the author saved is exactly what will render — there is no second, different
    sanitization pass at render time.
20. The allow-list is: `p, br, h1–h4, strong, em, u, s, ul, ol, li, table, thead, tbody, tr, th,
    td, blockquote, hr, span, div, a[href], img[src]`, plus `style` limited to a token allow-list
    (`text-align`, `font-weight`, `font-style`, `text-decoration`, `width`,
    `page-break-before/after`).
21. Removed unconditionally: `script`, `iframe`, `object`, `embed`, `form`, `input`, every `on*`
    attribute, `javascript:` and `data:` hrefs, and `<style>` blocks.
22. External resources are forbidden. `img[src]` accepts only `data:image/(png|jpeg|gif|webp)`
    URIs; `a[href]` accepts only `http(s):` and `mailto:`. Any other `src` or `url()` is stripped.
    This prevents both tracking pixels and SSRF from the rendering Lambda.
23. The response to a save returns the sanitized body so the editor can immediately reflect what
    was kept.

### Fields

24. A field has: `Key`, `Label`, `Type`, `Required`, `FilledBy`, `Order`, and optionally
    `MaxLength`, `Options` (for `select`), and `AutofillSource` (spec 03).
25. Supported types: `text`, `multiline`, `number`, `date`, `email`, `select`, `checkbox`.
26. `FilledBy` declares who supplies the value: `sender`, or `signer:{roleKey}` naming one of the
    template's signer roles. Sender-filled fields are completed before sending; signer-filled
    fields are completed on the signing page by that specific signer.
27. A `select` field must define at least two options; each option is 1–100 characters.
28. `MaxLength` defaults by type: `text` 200, `multiline` 2000, `email` 254, `number` 30,
    `date` 10. An explicit `MaxLength` may lower but not raise the default.

### Signer roles

29. A version defines exactly **two** signer roles, each with a `key` (snake_case), a `label`,
    and an `order` of 1 or 2. Any other count rejects the publish.
30. Signer role keys are referenced by `FilledBy` and by the reserved signature placeholders. A
    role key that no longer exists after an edit invalidates any field pointing at it — the
    publish is rejected until those fields are repointed.

### Preview

31. Preview renders the draft or current version with **synthetic** values — each placeholder is
    replaced by its label in brackets, e.g. `[Full name]` — plus placeholder signature blocks.
    Preview never touches real member data.
32. Preview output is rendered inside a sandboxed iframe with neither `allow-scripts` nor
    `allow-same-origin`. Template HTML is authored content and must never execute in the
    application origin.

## Data Model

### DocumentTemplate

| Field | Type | Description |
|---|---|---|
| `Id` | Guid | Primary key |
| `OrganizationId` | Guid (FK) | References `Organization.Id`. Cascade delete. |
| `Name` | string(120) | Unique per organization, case-insensitive. |
| `Description` | string(500)? | Optional. |
| `Status` | enum | `draft`, `published`, `archived` |
| `CurrentVersionId` | Guid? (FK) | The published version new envelopes bind to. |
| `CreatedAt` | DateTime | |
| `CreatedByAccountId` | Guid (FK) | References `Account.Id`. |
| `ArchivedAt` | DateTime? | |
| `ArchivedByAccountId` | Guid? (FK) | |

### DocumentTemplateVersion

Immutable once `PublishedAt` is set.

| Field | Type | Description |
|---|---|---|
| `Id` | Guid | Primary key |
| `TemplateId` | Guid (FK) | Cascade delete. |
| `VersionNumber` | int | 1..n, unique per template. |
| `BodyHtml` | text | Sanitized HTML containing `{{field_key}}` tokens. |
| `FieldsSnapshot` | Json | Ordered, frozen copy of the field definitions, written at publish. |
| `SignerRoles` | Json | `[{ key, label, order }]` — exactly two entries. |
| `PublishedAt` | DateTime? | `null` means this is the open draft. |
| `RowVersion` | int | Optimistic lock, incremented on every draft save. |
| `CreatedAt` | DateTime | |
| `CreatedByAccountId` | Guid (FK) | |

### TemplateField

| Field | Type | Description |
|---|---|---|
| `Id` | Guid | Primary key |
| `TemplateVersionId` | Guid (FK) | Cascade delete. |
| `Key` | string(64) | snake_case, unique per version. |
| `Label` | string(120) | Shown in the fill form and in preview. |
| `Type` | enum | `text`, `multiline`, `number`, `date`, `email`, `select`, `checkbox` |
| `Required` | bool | |
| `Options` | Json? | For `select`: an array of strings. |
| `MaxLength` | int? | |
| `FilledBy` | string(72) | `sender` or `signer:{roleKey}` |
| `AutofillSource` | string(80)? | See spec 03. `null` means manual entry. |
| `Order` | int | Display order in the fill form. |

### New Enums

- **`TemplateStatus`**: `Draft`, `Published`, `Archived`
- **`TemplateFieldType`**: `Text`, `Multiline`, `Number`, `Date`, `Email`, `Select`, `Checkbox`

### New Capabilities (extend `Capability` enum)

- `ViewDocumentTemplates` — list, open, preview templates (admin, manager)
- `ManageDocumentTemplates` — create, edit, publish, archive, delete (admin)

## Screens

### Templates list — `/org/{orgId}/documents/templates`

```
┌─────────────────────────────────────────────────────────────────────┐
│  Templates                                    [ New template ]      │
│                                                                     │
│  [ Search templates          ]   Status: [ All ▾ ]                  │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │  Name                     Version   Status      Updated       │ │
│  │  ──────────────────────────────────────────────────────────── │ │
│  │  Contractor agreement BY    v3      ● Published  12 Aug 2026  │ │
│  │  Contractor agreement US    v1      ● Published  02 Jul 2026  │ │
│  │  Client agreement US        v2      ○ Draft      Yesterday    │ │
│  │  Mutual NDA                 v1      ⊘ Archived   14 Mar 2026  │ │
│  └───────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### Template editor — `/org/{orgId}/documents/templates/{templateId}`

```
┌─────────────────────────────────────────────────────────────────────┐
│  Contractor agreement BY        v3 published · v4 draft             │
│                              [ Preview ]  [ Archive ]  [ Publish ]  │
│                                                                     │
│  [ BODY ]   Fields   Signers                                        │
│                                                                     │
│  ┌─ Body ────────────────────────────────────────────────────────┐ │
│  │  B  I  U  │  H1 H2 H3 │  •  1.  │  ▤  │  ─  │  ⤓ Page break  │ │
│  │ ───────────────────────────────────────────────────────────── │ │
│  │  AGREEMENT No. {{contract_number}}                            │ │
│  │                                                               │ │
│  │  Minsk                                    {{contract_date}}   │ │
│  │                                                               │ │
│  │  {{company_name}}, represented by {{company_signatory}},      │ │
│  │  and {{contractor_full_name}}, УНП {{contractor_tax_id}},     │ │
│  │  residing at {{contractor_address}}, have agreed:             │ │
│  │  ...                                                          │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ⚠ 1 placeholder is not defined as a field: contract_number         │
│  ⚠ 1 field is never used in the body: contractor_phone              │
└─────────────────────────────────────────────────────────────────────┘
```

### Fields tab

```
┌─ Fields ──────────────────────────────────── [ Add field ] ────────┐
│                                                                     │
│  ⠿  contractor_full_name   Full name        Text    Required        │
│     Filled by: Sender        Autofill: member.fullName    [ ⋮ ]     │
│                                                                     │
│  ⠿  contractor_tax_id      УНП              Text    Required        │
│     Filled by: Sender        Autofill: —                  [ ⋮ ]     │
│                                                                     │
│  ⠿  contractor_bank        Bank details     Multiline               │
│     Filled by: Contractor    Autofill: —                  [ ⋮ ]     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Signers tab

```
┌─ Signer roles ─────────────────────────────────────────────────────┐
│                                                                     │
│  1.  company        Label: [ Company               ]                │
│  2.  contractor     Label: [ Contractor            ]                │
│                                                                     │
│  Exactly two signer roles are required. Their order is the default  │
│  signing order; it can be changed per envelope.                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Add / edit field modal

```
┌─────────────── Add field ──────────────────────────┐
│                                                     │
│  Key *              [ contractor_tax_id      ]      │
│  Label *            [ УНП                    ]      │
│  Type *             [ Text                 ▾ ]      │
│  Filled by *        [ Sender               ▾ ]      │
│  Autofill from      [ — none —             ▾ ]      │
│  ☑ Required                                         │
│  Max length         [ 200                    ]      │
│                                                     │
│  Insert as: {{contractor_tax_id}}      [ Copy ]     │
│                                                     │
│             [ Cancel ]  [ Save field ]              │
└─────────────────────────────────────────────────────┘
```

## Flows

### Flow: Admin creates and publishes a template

1. Admin opens `/org/{orgId}/documents/templates` and clicks "New template".
2. Admin enters a name and optional description, confirms.
3. System sends `POST /api/organizations/{orgId}/document-templates` and navigates to the editor.
4. Admin writes the body, inserting placeholders from the Fields tab.
5. Admin defines fields and the two signer roles. Each save sends
   `PUT .../document-templates/{id}/draft` with the current `rowVersion`.
6. Admin clicks "Preview", reviews the rendered document with synthetic values, closes it.
7. Admin clicks "Publish".
8. System sends `POST .../document-templates/{id}/publish`.
9. On success: toast "Template published", the status badge becomes Published, and the version
   summary shows the new version number.

### Flow: Admin edits a published template

1. Admin opens a published template and changes the body.
2. On the first change the system creates draft version `n+1` server-side and the header shows
   "v{n} published · v{n+1} draft".
3. New envelopes continue to bind to version `n` until the draft is published.
4. Admin clicks "Publish"; version `n+1` becomes current. Version `n` remains readable and every
   envelope bound to it is unaffected.

### Alt Flow: Publish rejected — unknown placeholder (branches from create/publish, step 8)

8a. API returns `400` with `{ "error": "unknown_placeholders", "keys": ["contract_number"] }`.
8b. An `InfoBanner` lists each unknown key with a "Create field" shortcut. The template stays a
    draft.

### Alt Flow: Publish rejected — wrong signer count (branches from step 8)

8a. API returns `400` with `{ "error": "invalid_signer_roles" }`.
8b. Banner: "A template must define exactly two signer roles." The Signers tab is focused.

### Alt Flow: Concurrent edit (branches from edit, step 5)

5a. API returns `409` with `{ "error": "stale_version" }`.
5b. A blocking modal offers "Reload" — local unsaved changes are shown in a copyable text area
    first so the author does not lose them.

### Alt Flow: Delete blocked

1. Admin clicks Delete on a template whose version has backed an envelope.
2. API returns `409` with `{ "error": "template_in_use", "envelopeCount": 12 }`.
3. Modal: "This template has been used by 12 documents and cannot be deleted. Archive it instead
   — existing documents keep working." with an "Archive" action.

### Alt Flow: Network/server error (any mutation)

- Error toast "Something went wrong. Please try again." The form retains values and buttons
  re-enable.

## API Contracts

### GET /api/organizations/{orgId}/document-templates

**Authentication:** required. Caller must have `ViewDocumentTemplates`.

Query: `q` (name substring), `status` (`draft|published|archived`).

**Response `200`:**
```json
{
  "templates": [
    {
      "id": "uuid",
      "name": "Contractor agreement BY",
      "description": "Standard contractor agreement, Republic of Belarus",
      "status": "published",
      "currentVersionNumber": 3,
      "hasOpenDraft": true,
      "updatedAt": "2026-08-12T09:11:00Z",
      "envelopeCount": 12
    }
  ],
  "canManage": true
}
```

### POST /api/organizations/{orgId}/document-templates

**Authentication:** required. Caller must have `ManageDocumentTemplates`.

**Request:** `{ "name": "Mutual NDA", "description": null }`

**Success `201`:** `{ "id": "uuid", "versionId": "uuid", "versionNumber": 1 }`

**Errors:**
- `400` (validation): `{ "errors": { "name": "Template name is required" } }`
- `409` (duplicate): `{ "error": "duplicate_name", "message": "A template with this name already exists" }`
- `403`: `{ "error": "forbidden", "message": "You do not have permission to manage templates" }`

### GET /api/organizations/{orgId}/document-templates/{id}

**Response `200`:**
```json
{
  "id": "uuid",
  "name": "Contractor agreement BY",
  "description": null,
  "status": "published",
  "currentVersion": { "id": "uuid", "versionNumber": 3, "publishedAt": "2026-08-12T09:11:00Z" },
  "draftVersion": {
    "id": "uuid",
    "versionNumber": 4,
    "rowVersion": 7,
    "bodyHtml": "<p>AGREEMENT No. {{contract_number}}</p>",
    "signerRoles": [
      { "key": "company", "label": "Company", "order": 1 },
      { "key": "contractor", "label": "Contractor", "order": 2 }
    ],
    "fields": [
      {
        "id": "uuid",
        "key": "contractor_full_name",
        "label": "Full name",
        "type": "text",
        "required": true,
        "options": null,
        "maxLength": 200,
        "filledBy": "sender",
        "autofillSource": "member.fullName",
        "order": 1
      }
    ]
  },
  "validation": {
    "unknownPlaceholders": ["contract_number"],
    "unusedFields": ["contractor_phone"]
  },
  "canManage": true,
  "canDelete": false
}
```

`draftVersion` is `null` when no open draft exists. `validation` is advisory on read and enforced
on publish.

### PUT /api/organizations/{orgId}/document-templates/{id}/draft

**Authentication:** required. `ManageDocumentTemplates`.

Creates the draft version on the first call against a published template.

**Request:**
```json
{
  "rowVersion": 7,
  "bodyHtml": "<p>AGREEMENT No. {{contract_number}}</p>",
  "signerRoles": [
    { "key": "company", "label": "Company", "order": 1 },
    { "key": "contractor", "label": "Contractor", "order": 2 }
  ],
  "fields": [
    {
      "key": "contract_number",
      "label": "Contract number",
      "type": "text",
      "required": true,
      "maxLength": 40,
      "filledBy": "sender",
      "autofillSource": null,
      "order": 1
    }
  ]
}
```

**Success `200`:**
```json
{
  "versionId": "uuid",
  "versionNumber": 4,
  "rowVersion": 8,
  "bodyHtml": "<p>AGREEMENT No. {{contract_number}}</p>",
  "sanitized": true,
  "removedElements": ["script"],
  "validation": { "unknownPlaceholders": [], "unusedFields": [] }
}
```

`bodyHtml` in the response is the **stored, sanitized** body — the editor replaces its buffer with
it. `removedElements` drives an advisory banner.

**Errors:**
- `400` (malformed placeholder): `{ "error": "malformed_placeholder", "offset": 412, "message": "Malformed placeholder at position 412" }`
- `400` (invalid field key): `{ "errors": { "fields[0].key": "Field key must be lowercase letters, digits and underscores" } }`
- `400` (reserved key): `{ "error": "reserved_key", "keys": ["signed_date"] }`
- `400` (duplicate field key): `{ "error": "duplicate_field_key", "keys": ["contractor_full_name"] }`
- `400` (body too large): `{ "error": "body_too_large", "message": "Template body must be at most 1 MB" }`
- `400` (dangling `filledBy`): `{ "error": "unknown_signer_role", "keys": ["witness"] }`
- `409` (stale): `{ "error": "stale_version", "message": "This template was changed by someone else. Reload to see the latest version." }`
- `409` (archived): `{ "error": "template_archived" }`

### POST /api/organizations/{orgId}/document-templates/{id}/publish

**Success `200`:** `{ "versionId": "uuid", "versionNumber": 4, "publishedAt": "2026-08-24T10:00:00Z" }`

**Errors:**
- `400`: `{ "error": "unknown_placeholders", "keys": ["contract_number"] }`
- `400`: `{ "error": "invalid_signer_roles", "message": "A template must define exactly two signer roles" }`
- `400`: `{ "error": "empty_body", "message": "Template body cannot be empty" }`
- `409`: `{ "error": "no_draft", "message": "There is nothing to publish" }`

### POST /api/organizations/{orgId}/document-templates/{id}/archive

**Success `200`:** `{ "status": "archived" }`
**Errors:** `409 { "error": "already_archived" }`

### DELETE /api/organizations/{orgId}/document-templates/{id}

**Success `204`.**
**Errors:** `409 { "error": "template_in_use", "envelopeCount": 12 }`

### POST /api/organizations/{orgId}/document-templates/{id}/preview

**Request:** `{ "versionId": "uuid" }` — omit for the draft, otherwise any version of this
template.

**Success `200`:** `{ "html": "<html>…</html>" }` — fully substituted with synthetic values. The
client renders it in a sandboxed iframe; it is never injected into the page DOM.

## Validation Rules

1. **Name**: required, 1–120 characters after trimming, unique per organization
   (case-insensitive). Errors: "Template name is required", "Template name must be at most 120
   characters", "A template with this name already exists".
2. **Description**: optional, max 500 characters. Error: "Description must be at most 500
   characters".
3. **Field key**: required, `^[a-z][a-z0-9_]{0,63}$`, unique per version, not reserved. Errors:
   "Field key is required", "Field key must be lowercase letters, digits and underscores",
   "Field key is already used in this template", "This field key is reserved".
4. **Field label**: required, 1–120 characters. Error: "Field label is required".
5. **Field type**: one of the seven supported types. Error: "Select a field type".
6. **Select options**: at least two, each 1–100 characters. Error: "A select field needs at least
   two options".
7. **FilledBy**: `sender` or `signer:{roleKey}` where the role exists in this version. Error:
   "Unknown signer role: {key}".
8. **Signer roles**: exactly two, keys `^[a-z][a-z0-9_]{0,63}$` and distinct, labels 1–60
   characters, orders 1 and 2. Errors: "A template must define exactly two signer roles",
   "Signer role keys must be different".
9. **Body**: max 1 MB; every placeholder well-formed; on publish, every placeholder defined and
   the body non-empty. Errors: "Template body must be at most 1 MB", "Malformed placeholder at
   position {n}", "These placeholders are not defined as fields: {keys}", "Template body cannot be
   empty".

Client-side validation mirrors these rules field-by-field on blur and on submit. The submit CTA is
never disabled for validation — clicking an invalid form shows every error and focuses the first
invalid control. Server-side validation re-runs all rules regardless of UI state.

## Error Messages

| Context | Message |
|---|---|
| Name empty | "Template name is required" |
| Name too long | "Template name must be at most 120 characters" |
| Name duplicate | "A template with this name already exists" |
| Description too long | "Description must be at most 500 characters" |
| Field key empty | "Field key is required" |
| Field key invalid | "Field key must be lowercase letters, digits and underscores" |
| Field key duplicate | "Field key is already used in this template" |
| Field key reserved | "This field key is reserved" |
| Field label empty | "Field label is required" |
| Select without options | "A select field needs at least two options" |
| Unknown signer role in field | "Unknown signer role: {key}" |
| Signer count ≠ 2 | "A template must define exactly two signer roles" |
| Signer keys equal | "Signer role keys must be different" |
| Body too large | "Template body must be at most 1 MB" |
| Malformed placeholder | "Malformed placeholder at position {n}" |
| Unknown placeholders on publish | "These placeholders are not defined as fields: {keys}" |
| Empty body on publish | "Template body cannot be empty" |
| Nothing to publish | "There is nothing to publish" |
| Stale edit | "This template was changed by someone else. Reload to see the latest version." |
| Delete blocked | "This template has been used by {n} documents and cannot be deleted. Archive it instead." |
| Edit archived template | "This template is archived and cannot be edited" |
| No permission | "You do not have permission to manage templates" |
| Sanitizer removed content | "Some content was removed for security: {elements}" |
| Unused field warning | "{n} field(s) are never used in the body" |
| Network/server error | "Something went wrong. Please try again." |
| Toast — created | "Template created" |
| Toast — saved | "Draft saved" |
| Toast — published | "Template published" |
| Toast — archived | "Template archived" |
| Toast — deleted | "Template deleted" |
| Empty state — no templates | "No templates yet. Create one to start sending documents for signature." |

## UI Description

### Templates list (`templates-page`)

- `Card` with a `SearchField` (`template-search-input`) and a status `Select`
  (`template-status-filter`).
- DS `Table` (`templates-table`); each row `template-row-{id}` shows name, current version, status
  `Badge` (`template-status-{id}`), last-updated, and a `⋮` `IconButton`
  (`template-actions-{id}`) with Open / Preview / Archive / Delete. Destructive items are gated on
  `canManage`.
- "New template" `Button` (`template-new-btn`) is rendered only when `canManage` is true — the
  repository rule is no dead controls.
- Empty state `template-empty` when the list is empty and no filter is applied.

### Template editor (`template-editor`)

- `PageHeader` shows the name and a version summary (`template-version-summary`).
- `Tabs` (`template-tabs`): Body (`template-tab-body`), Fields (`template-tab-fields`), Signers
  (`template-tab-signers`).
- Body tab: a constrained rich-text editor (`template-body-editor`) with the toolbar shown in the
  mockup. Placeholders render as inert chips so they cannot be partially deleted.
- Validation banner (`template-validation-banner`) above the editor summarizing unknown
  placeholders and unused fields, each key clickable.
- Fields tab: reorderable list `template-fields-list`, rows `template-field-row-{key}`, an
  "Add field" `Button` (`template-field-add-btn`).
- Signers tab: two fixed rows, `template-signer-row-1` and `template-signer-row-2`.
- Header actions: `template-preview-btn`, `template-archive-btn`, `template-publish-btn`.
- Autosave on a 2-second idle debounce plus an explicit save on tab change; the save indicator is
  `template-save-state` (`Saving…` / `Saved` / `Unsaved changes`).

### Preview modal (`template-preview-modal`)

- Full-height `Modal` containing a single sandboxed `<iframe>` (`template-preview-frame`) with
  `sandbox=""` — no scripts, no same-origin.
- Footer note: "Preview uses sample values. No member data is used."

### States

| State | Behavior |
|---|---|
| **Loading** | `Spinner` with `data-testid="template-loading"`. |
| **No templates** | Empty state copy and a single "New template" CTA. |
| **Saving** | Save indicator shows "Saving…"; Publish is disabled while a save is in flight (a genuine in-flight guard, not a validation gate). |
| **Published, no draft** | Body editor is read-only with an "Edit" affordance that creates the draft on the first keystroke. |
| **Archived** | Entire editor read-only; a banner explains archival and offers Preview only. |
| **Manager (read-only)** | List and editor render without any mutation control; `canManage` is false. |

## Required `data-testid` Attributes

**Templates list:**
- `templates-page`, `templates-table`, `template-row-{id}`, `template-status-{id}`,
  `template-actions-{id}`, `template-search-input`, `template-status-filter`,
  `template-new-btn`, `template-empty`, `template-loading`

**New template modal:**
- `template-new-modal`, `template-name-input`, `template-description-input`,
  `template-new-submit-btn`, `template-new-cancel-btn`, `field-error-name`,
  `field-error-description`

**Editor:**
- `template-editor`, `template-version-summary`, `template-save-state`, `template-tabs`,
  `template-tab-body`, `template-tab-fields`, `template-tab-signers`, `template-body-editor`,
  `template-validation-banner`, `template-preview-btn`, `template-archive-btn`,
  `template-publish-btn`, `template-delete-btn`

**Fields:**
- `template-fields-list`, `template-field-row-{key}`, `template-field-add-btn`,
  `template-field-modal`, `template-field-key-input`, `template-field-label-input`,
  `template-field-type-select`, `template-field-filledby-select`,
  `template-field-autofill-select`, `template-field-required-checkbox`,
  `template-field-maxlength-input`, `template-field-options-input`, `template-field-save-btn`,
  `template-field-cancel-btn`, `field-error-key`, `field-error-label`, `field-error-options`

**Signers:**
- `template-signer-row-1`, `template-signer-row-2`, `template-signer-key-{n}`,
  `template-signer-label-{n}`

**Preview:**
- `template-preview-modal`, `template-preview-frame`, `template-preview-close-btn`

**Toasts:**
- `toast-template-created`, `toast-template-saved`, `toast-template-published`,
  `toast-template-archived`, `toast-template-deleted`

## Out of Scope

- Uploading `.pdf` or `.docx` as a template (HTML authoring only this release).
- Free positioning of fields and signature blocks over a page (DocuSign-style tag placement).
- Conditional sections, repeating blocks, or computed fields in the template language.
- More than two signer roles, witnesses, and CC-only recipients.
- Template categories, folders, and tags.
- Cross-organization or global template libraries, and template import/export.
- Unarchiving a template.
- Localized template variants keyed by locale (a Russian and an English contract are two
  templates).
- Attachments and appendices bundled with a template.

## Test Cases

### TC-01-UNIT-01: Placeholder parser

- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Parse `<p>Hi {{full_name}} and {{ tax_id }}</p>`.
  2. Parse `<p>{{full_name}} {{full_name}}</p>`.
  3. Parse `<p>{{Full Name}}</p>`.
  4. Parse `<p>{{unclosed</p>`.
  5. Parse `<p>{{ {{nested}} }}</p>`.
  6. Parse `<p>no placeholders</p>`.
- **Expected Result:**
  1. Keys `["full_name", "tax_id"]`; surrounding whitespace tolerated.
  2. Keys `["full_name"]` — duplicates in the body are legal and deduplicated.
  3. Malformed: illegal key characters, offset reported.
  4. Malformed: unbalanced braces, offset reported.
  5. Malformed: nesting is not supported.
  6. Empty key list, no error.

### TC-01-UNIT-02: HTML sanitizer

- **Level:** Unit
- **Preconditions:** none.
- **Steps:** sanitize each of:
  1. `<p>ok <strong>bold</strong></p>`
  2. `<p onclick="steal()">x</p>`
  3. `<script>alert(1)</script><p>x</p>`
  4. `<a href="javascript:alert(1)">x</a>`
  5. `<img src="https://evil.example/pixel.gif">`
  6. `<img src="data:image/png;base64,iVBORw0KGgo=">`
  7. `<iframe src="https://evil.example"></iframe>`
  8. `<p style="text-align:center;background:url(https://evil.example/x)">x</p>`
- **Expected Result:**
  1. Unchanged.
  2. `onclick` removed, `<p>` kept.
  3. `<script>` and its contents removed entirely; `<p>x</p>` kept.
  4. `href` removed, link text kept.
  5. `<img>` removed (external source).
  6. Kept.
  7. Removed.
  8. `text-align` kept, `background`/`url()` removed.

### TC-01-UNIT-03: Field key validation

- **Level:** Unit
- **Steps:** validate `contractor_tax_id`, `Contractor`, `1st_name`, a 65-character key, the empty
  string, and `signed_date`.
- **Expected Result:** valid; invalid (uppercase); invalid (leading digit); invalid (too long);
  invalid (required); invalid (reserved).

### TC-01-UNIT-04: Value substitution escapes HTML

- **Level:** Unit
- **Steps:** substitute `{ full_name: "<b>Bobby</b> & Co" }` into `<p>{{full_name}}</p>`.
- **Expected Result:** `<p>&lt;b&gt;Bobby&lt;/b&gt; &amp; Co</p>` — a field value can never
  introduce markup.

### TC-01-INT-01: Create and publish a template

- **Level:** Integration
- **Preconditions:** admin A in organization O.
- **Steps:**
  1. As A, `POST .../document-templates` with a unique name.
  2. `PUT .../document-templates/{id}/draft` with a body, two matching fields, two signer roles.
  3. `POST .../document-templates/{id}/publish`.
  4. `GET .../document-templates/{id}`.
- **Expected Result:**
  1. `201`, version 1 created in draft.
  2. `200`, `rowVersion` incremented, `validation.unknownPlaceholders` empty.
  3. `200`, `versionNumber: 1`, `publishedAt` set.
  4. Status `published`, `currentVersion.versionNumber = 1`, `draftVersion` is `null`,
     `FieldsSnapshot` present on the published version.

### TC-01-INT-02: Publish rejected for an unknown placeholder

- **Level:** Integration
- **Preconditions:** a draft whose body references `{{contract_number}}` with no such field.
- **Steps:** `POST .../publish`.
- **Expected Result:** `400 { "error": "unknown_placeholders", "keys": ["contract_number"] }`.
  Template remains `draft`, `CurrentVersionId` still `null`.

### TC-01-INT-03: Publish rejected for wrong signer count

- **Level:** Integration
- **Preconditions:** a valid draft with one signer role.
- **Steps:** `POST .../publish`.
- **Expected Result:** `400 { "error": "invalid_signer_roles" }`. Repeat with three roles — same
  error.

### TC-01-INT-04: Editing a published template creates a new draft version

- **Level:** Integration
- **Preconditions:** template T published at version 1.
- **Steps:**
  1. `PUT .../draft` with a changed body.
  2. `GET .../document-templates/{id}`.
  3. `POST .../publish`.
  4. `GET .../document-templates/{id}`.
- **Expected Result:**
  1. `200`, `versionNumber: 2`.
  2. `currentVersion.versionNumber` is still 1; `draftVersion.versionNumber` is 2.
  3. `200`.
  4. `currentVersion.versionNumber` is 2; version 1 still readable and unchanged.

### TC-01-INT-05: A published version is immutable

- **Level:** Integration
- **Preconditions:** template T published at version 1, no open draft.
- **Steps:** attempt to `PUT .../draft` targeting version 1 explicitly (a crafted request carrying
  the published `versionId`).
- **Expected Result:** the published row is never modified — the call either creates version 2 or
  returns `409`. Assert version 1's `BodyHtml` and `RowVersion` are byte-identical afterwards.

### TC-01-INT-06: Optimistic locking

- **Level:** Integration
- **Preconditions:** draft with `rowVersion = 3`.
- **Steps:**
  1. `PUT .../draft` with `rowVersion: 3`.
  2. `PUT .../draft` again with `rowVersion: 3`.
- **Expected Result:** first `200` (`rowVersion` → 4); second `409 { "error": "stale_version" }`
  with the body unchanged.

### TC-01-INT-07: Sanitization is persisted

- **Level:** Integration
- **Steps:**
  1. `PUT .../draft` with `bodyHtml` containing `<script>alert(1)</script><p>Hello</p>`.
  2. `GET .../document-templates/{id}`.
- **Expected Result:**
  1. `200`, response `bodyHtml` has no `<script>`, `removedElements` contains `script`.
  2. The stored body read back has no `<script>` — sanitization happened on write, not on read.

### TC-01-INT-08: Duplicate name rejected case-insensitively

- **Level:** Integration
- **Preconditions:** template "Mutual NDA" exists in organization O.
- **Steps:** `POST .../document-templates` with `"  mutual nda "`.
- **Expected Result:** `409 { "error": "duplicate_name" }`.

### TC-01-INT-09: Delete blocked once used, archive allowed

- **Level:** Integration
- **Preconditions:** template T published; one envelope created from version 1 (spec 02).
- **Steps:**
  1. `DELETE .../document-templates/{id}`.
  2. `POST .../document-templates/{id}/archive`.
  3. Attempt to create a new envelope from T (spec 02).
- **Expected Result:**
  1. `409 { "error": "template_in_use", "envelopeCount": 1 }`.
  2. `200`, status `archived`.
  3. Rejected — an archived template cannot back new envelopes. The pre-existing envelope is
     unaffected and still resolves its pinned version.

### TC-01-INT-10: Delete allowed for an unused template

- **Level:** Integration
- **Preconditions:** template T, never used by an envelope.
- **Steps:** `DELETE .../document-templates/{id}`, then `GET`.
- **Expected Result:** `204`, then `404`. Its versions and fields are gone.

### TC-01-INT-11: Capability enforcement

- **Level:** Integration
- **Preconditions:** admin A, manager G, user U, viewer V in organization O; template T.
- **Steps:** each role calls `GET .../document-templates` and `PUT .../draft`.
- **Expected Result:** A — 200/200. G — 200 with `canManage: false` / 403. U — 403/403.
  V — 403/403. A legacy `member` role behaves exactly like `user`.

### TC-01-INT-12: Organization scoping

- **Level:** Integration
- **Preconditions:** template T in organization O1; admin B in organization O2.
- **Steps:** As B, `GET /api/organizations/{O1}/document-templates/{T.id}`.
- **Expected Result:** `404` — not `403`, matching the existing `OrgScopeGuard` convention.

### TC-01-INT-13: Body size limit

- **Level:** Integration
- **Steps:** `PUT .../draft` with a 1.5 MB body.
- **Expected Result:** `400 { "error": "body_too_large" }`, nothing persisted.

### TC-01-INT-14: Dangling signer reference

- **Level:** Integration
- **Steps:** `PUT .../draft` with a field whose `filledBy` is `signer:witness` while the roles are
  `company` and `contractor`.
- **Expected Result:** `400 { "error": "unknown_signer_role", "keys": ["witness"] }`.

### TC-01-E2E-01: Admin creates and publishes a template

- **Level:** E2E
- **Preconditions:** logged in as admin; no templates exist.
- **Steps:**
  1. Open `/org/{orgId}/documents/templates`. Verify the empty state.
  2. Click "New template", enter "Contractor agreement BY", submit.
  3. In the editor, type a body containing `{{contractor_full_name}}`.
  4. Open the Fields tab, add field `contractor_full_name` / "Full name" / Text / Sender /
     Required.
  5. Open the Signers tab, set roles `company` / "Company" and `contractor` / "Contractor".
  6. Click "Publish".
  7. Verify toast "Template published"; the version summary reads "v1 published".
  8. Go back to the list and verify the row shows Published and v1.
- **Selectors:** `templates-page`, `template-empty`, `template-new-btn`, `template-new-modal`,
  `template-name-input`, `template-new-submit-btn`, `template-editor`, `template-body-editor`,
  `template-tab-fields`, `template-field-add-btn`, `template-field-modal`,
  `template-field-key-input`, `template-field-label-input`, `template-field-save-btn`,
  `template-tab-signers`, `template-signer-key-1`, `template-signer-key-2`,
  `template-publish-btn`, `toast-template-published`, `template-version-summary`,
  `template-row-{id}`, `template-status-{id}`.

### TC-01-E2E-02: Publish blocked by an undefined placeholder
- **Retired.** Covered by the integration case that names the undefined key and leaves the template a draft. The message reaching the screen goes through the same banner TC-01-E2E-01 already sees.

### TC-01-E2E-03: Script tags are stripped and stay stripped
- **Retired.** Covered by the integration case that stores the sanitized body, so a later read is already clean. Sanitisation is a write-path rule; a browser adds nothing to it.

### TC-01-E2E-04: Editing a published template does not disturb the published version
- **Retired.** Covered by the integration case that leaves the published row byte-identical when a save targets its versionId, and by the version-list case.

### TC-01-E2E-05: Delete is blocked for a used template
- **Retired.** Covered by the integration case that refuses the delete, allows the archive and leaves the existing document intact, plus the canDelete reporting case.

### TC-01-E2E-06: Manager sees templates read-only
- **Retired.** Covered by the integration case that lets a manager read a template and its preview but not publish. Route-level access from a browser is asserted once for this area, by TC-01-E2E-07.

### TC-01-E2E-07: Regular user has no access

- **Level:** E2E
- **Preconditions:** logged in as a `user`.
- **Steps:**
  1. Verify the sidebar has no Documents section.
  2. Navigate directly to `/org/{orgId}/documents/templates`.
- **Expected Result:** the not-found page renders; no template data is visible.
- **Selectors:** `nav-documents` (asserted absent), `templates-page` (asserted absent).

### TC-01-E2E-08: Preview renders with sample values
- **Retired.** Covered at integration by `document-templates.spec.ts`: "substitutes each placeholder with its label in brackets and never reads members", "renders a named version and 404s for a version of another template", and "escapes a field label so preview cannot introduce markup". The preview is server-rendered HTML — the browser adds nothing to the assertion.

