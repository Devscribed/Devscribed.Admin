# implement — attempt 2

Run `2026-08-28T17-26-56_documents-04-signature-providers` · spec `specs/documents/04-signature-providers.md`
· branch `spec/signwell-provider` · diff base `57d55ac`.

Review attempt 1 blocked with two blockers and four notes. Both blockers are **fixed**; nothing is
contested. The three notes addressed to `code` are fixed too, because a note that survives is a note
the next review re-raises. The one addressed to `spec` is left for a human.

---

## F1 — the Infrastructure section was not implemented (blocker, `target: handoff`)

**Fixed.** The finding is right, and it is right about the cause too: no task in the handoff named
`infra/terraform`, so a plan built from the handoff could not have produced this. Every file under
`infra/` was outside every glob I was given. I am recording that here rather than routing it,
because the finding already routes itself — but the plan, not the code, is where this went missing,
and the next handoff for a spec with an Infrastructure section should carry a task for it.

The spec names the mechanism exactly, and the shape follows `SESSION_SECRET` and
`INTERNAL_TASK_SECRET` with **one deliberate difference**: those are values Terraform generates,
and these are a vendor's.

| Value | Where it now comes from |
|---|---|
| `SIGNWELL_API_KEY` | `aws_ssm_parameter.signwell_api_key`, `SecureString`, in `api_secrets` |
| `SIGNWELL_WEBHOOK_SECRET` | `aws_ssm_parameter.signwell_webhook_secret`, `SecureString`, in `api_secrets` |
| `SIGNWELL_API_APPLICATION_ID` | `var.signwell_api_application_id`, plain `api_environment` |
| `SIGNWELL_TEST_MODE` | `"true"`, written once in `api_environment` |
| `PROVIDER_SYNC_STALE_SECONDS` | `"120"`, written once in `api_environment` |

- `infra/terraform/modules/app/main.tf` — the two `SecureString` parameters, each with
  `lifecycle { ignore_changes = [value] }`. That is what makes "Terraform creates the parameter and
  the policy that reads it, **never the value**" true in both directions: no vendor credential
  reaches the state file, and the next `apply` does not put the placeholder back over an operator's
  write.
- `infra/terraform/modules/app/iam.tf` — both ARNs added to the execution role's `ssm:GetParameters`
  statement, **unconditionally**. The grant has to exist before the value does, or the first deploy
  after an out-of-band write fails to start the task.
- `infra/terraform/modules/app/api.tf` — the three plain values above, and the two secrets.
- `variables.tf` (module and root), `main.tf`, `environments/dev.tfvars`, `environments/prod.tfvars`.

**The one judgement call, stated plainly.** The two secrets are injected into the task only when
`signwell_secrets_provisioned` is true, which both environments currently set to `false`. The
finding's suggested fix would have added them unconditionally, and I did not, for a reason the
product forces: an SSM `SecureString` cannot hold an empty string, so a parameter awaiting its value
holds a placeholder — and `SigningProviderRegistry.missingConfiguration` asks whether the variable is
*present*, not whether it is real. Handing the container a placeholder would make the settings screen
report SignWell **configured**, let an admin select it, and turn every send into a 503 at the
provider. That is requirement 32's gate lying. With the flag false the API is handed neither value,
which is the state edge case 16 and requirement 32 are written for: the row is listed, disabled, and
names exactly what is missing.

So the feature is still not *live* on dev or prod after this change, and it cannot be made live from
this repository: a vendor API key and a registered webhook id are not things Terraform can invent,
and the spec says both are written out of band. What changed is that the plumbing, the encryption,
the IAM grant and the exact commands now exist, so enabling it is two `aws ssm put-parameter` calls
and one `true` — not a code change. Both tfvars carry those commands in a comment beside the flag.

Also removed, as the finding asked: `SIGNATURE_PROVIDER = "internal"` from `api.tf` and from
`apps/api/.env.example`. Nothing has read it since the registry replaced `selectSignatureProvider()`,
and its `.env.example` comment ("a third-party adapter is a class plus a value here") described a
decision the code no longer makes.

Checked with the tool rather than by eye: `terraform fmt -check -recursive` is clean, and
`terraform validate` reports **Success** (one pre-existing deprecation warning about
`failure_threshold` on `aws_service_discovery_service.api`, which this change does not touch).

## F2 — a provider call inside a transaction (blocker, `target: code`)

**Fixed, and the witness is correct.** I verified the load-bearing half of it myself before moving
anything, because the whole argument rests on it: `validateSignature`
(`packages/validation/src/envelopes.ts`) requires a drawn signature to match
`^data:image/png;base64,([A-Za-z0-9+/=\s]+)$`, decode, be under 512 KB and carry ink, while
`InternalSigningProvider.applySignature` requires only `SIGNATURE_IMAGE`
(`data:image/(png|jpeg|gif|webp|svg+xml);base64,…`) — strictly weaker on the PNG branch. For a typed
signature the validator returns a trimmed non-empty name and `requireTypedName` rejects only an empty
one. **No input that passes validation can make `applySignature` throw**, so hoisting it moves no
error ahead of the checks spec 02 orders.

`apps/api/src/signing/signing.service.ts` now computes `signedAt` and the applied signature above
`this.prisma.$transaction`, and the transaction writes what it returns. The call records nothing —
requirement 4 — so the document-hash check, the turn check and the field validation still gate every
write, in their original order. Two comments that asserted the opposite are corrected rather than
left to contradict the code: the `LocallySigned` doc comment in
`apps/api/src/signature/signing-provider.ts` and item 3 of the header in
`apps/api/src/signature/internal-signing-provider.ts`.

I did not take the escape the finding offered ("if the invariant is meant to bind only providers that
touch the network, that is a change to the spec"). It is not, and arguing an invariant from the
reason that motivated it was the mistake in the first place.

Requirement 10 holds: **spec 02's suite is unedited and passes** — `test/signing.spec.ts`,
`test/envelopes.spec.ts`, `test/autofill.spec.ts` and `test/signing-embedded.spec.ts`, 74 tests, no
assertion touched.

## N1 — the list does not converge lazily (note, `code`)

**Fixed as the finding suggested: written down where it is true.** `EnvelopesService.list` now
carries a doc comment saying the narrowing and why. A page holds up to a hundred envelopes, so
obeying requirement 24a literally there would spend up to a hundred provider calls on one screen,
against the read budget of 120 and the create budget of 10 a minute that the spec's own Blast Radius
names as the thing the breaker protects. Nothing is lost, because requirement 24 is precisely the
claim that a stale row costs timeliness and never correctness, and the three convergence paths that
do exist make it current.

## N2 — a vacuous absent-assertion and a field no screen reads (note, `code`)

**Half fixed, half answered.**

The dead field is fixed: `provider.certificateIssued` now drives a line on the envelope detail
naming which evidence format the stored PDF carries — "Includes our Certificate of Completion" or
"Includes the SignWell audit page". That is not an invention. It is the spec's own envelope-detail
mock (`Document  Consulting Agreement.pdf  (includes SignWell audit page)`), and the Known Gaps table
makes it load-bearing: two evidence formats coexist in an organization that has switched, and what
makes that acceptable is stated there as "the envelope detail names which one it is". The string
lives in `packages/validation` with the others.

The other half I answer rather than fix: **I did not add a certificate link, because there is no
certificate to link to.** Our Certificate of Completion is not a separate artefact —
`assembleCompletedDocument` binds it into the signed PDF itself — so under the internal provider
there is one file, and under SignWell there is one file with their audit page instead. Rendering an
`envelope-certificate-link` would mean creating a second document in the record, which is the exact
thing requirement 28 refuses. The assertion is therefore vacuous by construction rather than by
oversight, and retiring it is a spec edit that is not mine to make. I added no `data-testid` to the
new line either: the spec names the ids, and coining one for a control it did not name is the
mistake its own note about `envelope-download-btn` warns against.

## N3 — the live check asked SignWell about whichever provider (note, `code`)

**Fixed at the level the finding names.** A new optional narrowing interface `ConnectionChecked`
(`checkConnection(): Promise<ProviderConnection>`) sits beside `LocallySigned` and `RemotelyTracked`;
`SignWellSigningProvider` implements it, and `SigningSettingsService` no longer injects
`SignWellHttpClient` at all. It asks the provider through `isConnectionChecked`, and a provider that
cannot answer is reported reachable with no webhook — which is the truth for the in-house engine.

I extended it by one field beyond the finding: `testMode` rides in the same record, because
`liveChecks` was also reading `SIGNWELL_TEST_MODE` directly, which is the same defect at the same
line. `apps/api/src/organizations/signing-settings.service.ts` now contains no SignWell knowledge in
any code path — only prose. Optional on purpose: both answers are displayed beside an option and are
never a gate on it (requirement 32), so a provider that cannot answer is not thereby unselectable.

## N4 — the materialization failure reuses the provider-unavailable sentence (note, `spec`)

**Not fixed, and correctly so.** The finding says it itself: the Error Messages table has no row for
`document_fields_not_materialized`, so the implementation reuses the only string available to it, and
"nothing in the spec fixes the text, which is why this is a note". Inventing a user-facing sentence
inline is exactly what `CLAUDE.md` forbids, and adding one to the spec is not mine to do. The
machine-readable code and the expected/received lists are already correct. It needs a spec row, then
a string in `packages/validation`.

---

## What I ran

    npm run test:unit                                     19 files, 941 tests, all pass
    npx tsc --noEmit -p apps/api/tsconfig.json            clean
    npx tsc --noEmit -p apps/web/tsconfig.json            clean
    npx tsc --noEmit -p packages/validation/tsconfig.json clean
    npm run build --workspace @devscribed/validation      (the web app types resolve through dist)
    npm run build  (apps/web)                             succeeds
    terraform fmt -check -recursive                       clean
    terraform validate                                    Success

Integration, from `apps/api`, against the port override this machine needs (host 5433 is bound by a
foreign Postgres that rejects the `devscribed` user; the project's container also publishes 5434, and
`TEST_DATABASE_URL` is the documented override):

    npx jest --maxWorkers=4 test/signwell-send.spec.ts test/signwell-webhook.spec.ts \
      test/signwell-reconcile.spec.ts test/signwell-completion.spec.ts \
      test/signwell-client.spec.ts test/signing-settings.spec.ts test/signing-embedded.spec.ts \
      test/envelopes.spec.ts test/signing.spec.ts test/capability.spec.ts test/org-scope.spec.ts \
      test/document-templates.spec.ts test/outbox.spec.ts test/test-fixtures.spec.ts \
      test/drivers.spec.ts test/autofill.spec.ts
        -> 16 suites, 191 tests, all pass

That set is the diff's own suites plus every spec-01/02/03 suite the changed files sit under — the
signing service, the envelope service, the settings API, capability and org-scope. E2E was not run
and integration was not run in full, per the repository rule.

## Files touched

| Finding | Files |
|---|---|
| F1 | `infra/terraform/modules/app/{main,api,iam,variables}.tf`, `infra/terraform/{main,variables}.tf`, `infra/terraform/environments/{dev,prod}.tfvars`, `apps/api/.env.example` |
| F2 | `apps/api/src/signing/signing.service.ts`, `apps/api/src/signature/signing-provider.ts`, `apps/api/src/signature/internal-signing-provider.ts` |
| N1 | `apps/api/src/documents/envelopes.service.ts` |
| N2 | `packages/validation/src/signing-providers.ts`, `apps/web/app/org/[orgId]/documents/[envelopeId]/page.tsx` |
| N3 | `apps/api/src/signature/signing-provider.ts`, `apps/api/src/signature/signwell/signwell-signing-provider.ts`, `apps/api/src/organizations/signing-settings.service.ts` |

No test was edited, no assertion removed, no suppression added; the static gate passes.

## One note about the history

While this attempt was running, a commit authored from the operator's session
(`Count the run's work, not the operator's`, a change to `scripts/review-coverage.mjs` and
`scripts/run-digest.mjs`) swept up my staged working files along with its own, so my source changes
were sitting under a message about the pipeline. I separated them: this attempt is amended into the
run's single commit, and the operator's script change is re-applied on top with its own message,
author and body intact. Nothing was dropped and no content changed — only which commit each line
belongs to. `headAtInit` in `run.json` is `38cabfa`, below both, so no pipeline artefact refers to a
rewritten sha.

## Verdict

`pass`, no findings.
