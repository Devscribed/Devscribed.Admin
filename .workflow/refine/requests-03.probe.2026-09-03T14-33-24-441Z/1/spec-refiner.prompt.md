specs/requests/03-client-participants.md

no request given

Judge the document in full. This is its first pass.

Account for all of it. The bundle declares exactly the following, parsed from the document
itself — no item is optional and none is inferred:

- **41 requirements**: REQ-03-001, REQ-03-002, REQ-03-003, REQ-03-004, REQ-03-005, REQ-03-006, REQ-03-007, REQ-03-008, REQ-03-009, REQ-03-010, REQ-03-011, REQ-03-012, REQ-03-013, REQ-03-014, REQ-03-015, REQ-03-016, REQ-03-017, REQ-03-018, REQ-03-019, REQ-03-020, REQ-03-021, REQ-03-022, REQ-03-023, REQ-03-024, REQ-03-025, REQ-03-026, REQ-03-027, REQ-03-028, REQ-03-029, REQ-03-030, REQ-03-031, REQ-03-032, REQ-03-033, REQ-03-034, REQ-03-035, REQ-03-036, REQ-03-037, REQ-03-038, REQ-03-039, REQ-03-040, REQ-03-041
- **16 routes**: POST /api/login, POST /api/invitations/accept, GET /api/me, GET /api/organizations/{orgId}/clients/{clientId}/contacts, POST /api/organizations/{orgId}/clients/{clientId}/contacts, DELETE /api/organizations/{orgId}/clients/{clientId}/contacts/{contactId}, POST /api/organizations/{orgId}/requests, GET /api/organizations/{orgId}/request-topics, GET /api/organizations/{orgId}/requests, GET /api/organizations/{orgId}/requests/{requestId}, POST /api/organizations/{orgId}/requests/{requestId}/answer, POST /api/organizations/{orgId}/requests/{requestId}/decline, POST /api/organizations/{orgId}/requests/{requestId}/grant, POST /api/organizations/{orgId}/requests/{requestId}/messages, GET /api/organizations/{orgId}/members, GET /api/organizations/{orgId}/projects
- **27 message exports**: CLIENT_USER_MESSAGES.emailInvalid, CLIENT_USER_MESSAGES.alreadyLinked, CLIENT_USER_MESSAGES.alreadyRemoved, CLIENT_USER_MESSAGES.principalConflict, CLIENT_USER_MESSAGES.clientCannotCreate, CLIENT_MESSAGES.clientArchived, AUTH_MESSAGES.deactivated, AUTH_MESSAGES.invalidCredentials, INVITE_MESSAGES.tokenInvalid, REQUEST_MESSAGES.clientProjectRequired, REQUEST_MESSAGES.clientProjectMismatch, REQUEST_MESSAGES.notOnProject, REQUEST_MESSAGES.assigneeInvalid, REQUEST_MESSAGES.assigneeInactive, REQUEST_MESSAGES.topicAudienceMismatch, REQUEST_MESSAGES.topicRequired, REQUEST_MESSAGES.topicUnavailable, REQUEST_MESSAGES.classifierNotAccepted, REQUEST_MESSAGES.createForbidden, REQUEST_MESSAGES.scopeForbidden, REQUEST_TOPIC_MESSAGES.pickerEmpty, REQUEST_MESSAGES.notYoursToAnswer, REQUEST_MESSAGES.notYoursToDecline, REQUEST_MESSAGES.notYoursToGrant, REQUEST_MESSAGES.declineReasonRequired, REQUEST_MESSAGES.alreadyTerminal, REQUEST_MESSAGES.threadClosed
- **32 testids**: client-contacts-section, client-contacts-empty-state, client-contact-invite-btn, client-contact-invite-modal, client-contact-invite-email, client-contact-invite-submit, client-contact-invite-error-email, client-contact-row-{id}, client-contact-row-{id}-remove-btn, request-new-assignee-kind, request-new-assignee-client, request-new-assignee-member, request-new-error-assignee, request-new-project, request-new-topic, request-new-topic-empty, request-new-submit, requests-page, sidebar-requests-link, nav-members, nav-projects, nav-clients, request-detail-page, request-detail-assignee, request-detail-answer-btn, request-detail-decline-btn, request-detail-decline-reason, request-detail-decline-confirm, request-detail-grant-btn, request-detail-composer, request-detail-thread, requests-new-btn
- **42 cases**: TC-03-UNIT-01, TC-03-UNIT-02, TC-03-INT-01, TC-03-INT-02, TC-03-INT-03, TC-03-INT-04, TC-03-INT-05, TC-03-INT-06, TC-03-INT-07, TC-03-INT-08, TC-03-INT-09, TC-03-INT-10, TC-03-INT-11, TC-03-INT-12, TC-03-INT-13, TC-03-INT-14, TC-03-INT-15, TC-03-INT-16, TC-03-INT-17, TC-03-INT-18, TC-03-INT-19, TC-03-INT-20, TC-03-INT-21, TC-03-INT-22, TC-03-INT-23, TC-03-INT-24, TC-03-INT-25, TC-03-INT-26, TC-03-INT-27, TC-03-INT-28, TC-03-INT-29, TC-03-INT-30, TC-03-INT-31, TC-03-INT-32, TC-03-INT-33, TC-03-INT-34, TC-03-INT-35, TC-03-E2E-01, TC-03-E2E-02, TC-03-E2E-03, TC-03-E2E-04, TC-03-E2E-05
- **10 repository paths this bundle cites**, each of which carries a
  claim to check against the code as it now stands: apps/api/src/auth/org-scope.guard.ts, apps/api/src/auth/session.guard.ts, apps/api/src/mail/mail.service.ts, apps/api/test/clients.spec.ts, apps/api/test/requests.spec.ts, apps/api/test/session-revocation.spec.ts, apps/web/src/ds.ts, e2e/global-setup.ts, e2e/tests/helpers.ts, packages/validation/src/index.ts

Read every requirement's rule sentence. Open every path above. A message export, a status
or a testid this document states about the repository is checked against the repository,
not against the rest of the document — and a claim you did not check is not a claim you
may report as clear.

Your verdict carries a `covered` object beside `criteria`, recording what this pass
actually reached:

```json
"covered": {
  "requirements": ["REQ-…", "…"],
  "paths": ["apps/…", "…"],
  "unreached": ["REQ-…"]
}
```

`requirements` and `paths` are what you read; `unreached` is what you did not, and an
empty `unreached` is a claim that you reached everything. The loop prints the difference
against the lists above, so an item omitted from all three is reported as unaccounted for
whatever the verdict says elsewhere.

Write your verdict to `.workflow/refine/requests-03.verdict.json`. That file is the only output of this pass: a
judgement that is not in it did not happen, whatever you say in your final message. Write it
even when nothing blocks — `"status": "pass"` with an empty `findings` array is a verdict
and is the outcome this loop is looking for. Then print the same JSON and nothing after it.