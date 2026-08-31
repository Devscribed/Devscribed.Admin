# Pre-implement — attempt 2 (replan)

Spec: `specs/documents/04-signature-providers.md` (sha256 `1a6ed08c…`, unchanged since init).
Branch `spec/signwell-provider`, diff base `57d55ac`.
Attempt 1's reasoning is preserved next to this file as `pre_implement.attempt-1.md`.

The review stage blocked with two blockers. One is addressed to the plan, so the router sent the
run back here and reset the implementer's budget. I verified both witnesses against the tree
before deciding anything. **Both are correct, both are fixed in the plan, neither is contested.**

---

## F1 — the Infrastructure section was never planned (target: handoff). Fixed: new task T11.

The witness holds, in every part I could check:

| Claim | Checked | Result |
|---|---|---|
| the diff touches no `infra/` file | `git diff 57d55ac...HEAD -- infra/` | zero files |
| nothing names SignWell in Terraform | `grep -rn SIGNWELL infra/` | no match |
| the container's environment is fully enumerated | `infra/terraform/modules/app/api.tf:16-52` (`locals.api_environment`) and `:54-68` (`locals.api_secrets`), rendered into the task definition at `:79-80` | ECS injects nothing that is not in those two maps |
| the code reads exactly those three names | `apps/api/src/signature/provider-registry.ts:87-101` | `SIGNWELL_API_KEY`, `SIGNWELL_API_APPLICATION_ID`, `SIGNWELL_WEBHOOK_SECRET` |
| the spec names the mechanism | spec `## Infrastructure / ### Configuration` | "SSM Parameter Store, `SecureString`, injected by the ECS task definition … Terraform creates the parameter and the policy that reads it, never the value" |

So on a deployed stand the settings screen reads *"SignWell is not configured. Missing: API key,
API application id, webhook secret"* and `PUT …/settings/signing` answers 400 — acceptance criteria
3, 5, 6 and 8 are unreachable there. My first plan named ten tasks and none of them named
`infra/terraform`. That was an omission, not a judgement call: the spec has an Infrastructure
section with a Configuration table, and a plan that skips it plans a feature that cannot be turned
on.

**T11** closes it. The shape it asks for is not invented — every construct already exists a few
lines away:

- Two `aws_ssm_parameter` `SecureString`s beside `session_secret` / `internal_task_secret`
  (`modules/app/main.tf:112-129`), but **without `random_password`**: the value is the vendor's,
  so the resource carries a placeholder plus `lifecycle { ignore_changes = [value] }`. Terraform
  creates the parameter, never the value; nothing reaches the state file.
- Both ARNs into the `ReadContainerSecrets` statement (`modules/app/iam.tf`). `DecryptThoseSecrets`
  already covers them — it is scoped by `kms:ViaService`, not per parameter.
- Injection into `locals.api_secrets` gated on a new `signwell_credentials_present`, using the
  `TEST_FIXTURE_SECRET` merge at `api.tf:63-66` verbatim.
- `SIGNWELL_API_APPLICATION_ID`, `SIGNWELL_TEST_MODE`, `PROVIDER_SYNC_STALE_SECONDS` into
  `locals.api_environment`; the dead `SIGNATURE_PROVIDER = "internal"` (`api.tf:48`) out, since
  `grep -rn 'process.env.SIGNATURE_PROVIDER' apps packages` returns nothing after this spec.

### The one design decision in T11, and why

The obvious wiring — placeholder value, injected unconditionally — **makes the product lie**.
Requirement 32 says *configured* means the values are present, "that is the whole gate", and
`missingConfiguration` only tests for a non-empty string. A placeholder therefore reads as
configured: an admin selects SignWell, and real sends fail with `provider_unavailable`. SSM will
not store an empty string, so there is no honest placeholder.

Hence: **parameters always created** (so there is somewhere for a person to write the value),
**injection gated** on a per-environment flag that is the recorded assertion that both values were
written. Until it flips, the screen says the true thing and the internal provider keeps signing —
the state acceptance criterion 1 protects. The alternative of gating creation too was rejected in
the task text: it leaves nowhere to write the value before the flag exists.

### What T11 must *not* do

The spec says the webhook "sits on the same load balancer as the rest of the API, on a path the
listener rule allows without a session". **There is no such load balancer.** `infra/terraform/main.tf:1-11`
and `outputs.tf` are explicit: "API service. No load balancer, no public address." The public path
already exists and is the web app's Express Mode endpoint rewriting `/api/:path*` to the API
(`apps/web/next.config.mjs:66`), so `POST /api/webhooks/signwell` is reachable at
`{app_url}/api/webhooks/signwell` with nothing added. Registering it with SignWell is an
out-of-band API call. T11 says so, so that an implementer reading the spec does not go looking for
a listener rule to widen. It is also why this is a note (N1 below) rather than a blocker:
requirement 32 makes registration a displayed check and never a gate, so the plan does not depend
on which reading is right.

---

## F2 — a provider call inside a transaction (target: code). Fixed: T3, with a recipe.

`apps/api/src/signing/signing.service.ts` opens the transaction at `:317`, takes
`SELECT id FROM "SigningToken" … FOR UPDATE` at `:322`, and awaits `locally.applySignature(…)` at
`:397`. Invariant 11 — "A provider call never runs inside a database transaction. Every adapter
method is called before or after one, never within" — and acceptance criterion 12 are both
unqualified. The comment at `:388-396` (echoed in `signing-provider.ts:62-71` and in the class doc
of `internal-signing-provider.ts`) argues the deviation is deliberate because this provider never
touches the network and because moving it would reorder error precedence against spec 02's suite.

I tested that argument rather than accepting either side:

- **Can `applySignature` throw for an input that reaches it?** No. `validateSignature`
  (`packages/validation/src/envelopes.ts:408-453`) already runs at `signing.service.ts:303`, before
  the transaction. For a drawn signature it requires `PNG_DATA_URI` (`:396`,
  `^data:image/png;base64,([A-Za-z0-9+/=\s]+)$`) plus decodable bytes under the size limit plus
  actual ink; `requireDrawnImage` tests `SIGNATURE_IMAGE`
  (`apps/api/src/documents/envelope-renderer.ts:99`), which admits png **and** jpeg, gif, webp and
  svg+xml. The validator's language is a strict subset of the provider's. For a typed signature
  both require a trimmed non-empty name. So the port call is total on everything that gets to it.
- **Does the timestamp move observably?** `signedAt` has to be computed before the transaction if
  the call is. `grep -rn signedAt apps/api/test` finds one assertion, `envelopes.spec.ts:347`,
  `not.toBeNull()`. Nothing compares it to lock acquisition or to event time.
- **Is the precedence argument real?** Partly, and this is the part the reviewer did not have to
  see: `localProviderFor` (`:801-810`) throws 500 `provider_cannot_apply_signature` for a provider
  whose surface is not ours, and it throws it *after* the terminal check, the turn check, the
  document-hash check and field validation. Hoisting that throw would move a 500 in front of a 409
  or a 400 for a SignWell envelope POSTed to our own sign endpoint.

So T3 step 4 keeps the *lookup* inside the transaction as a bare guard — a registry lookup is not a
provider call — and moves only the awaited port method above it. The observable behaviour of the
endpoint is then identical in every branch, which is what requirement 10 demands, and invariant 11
holds without an exception. The three comments that argue for the deviation are corrected in the
same task; a comment that argues against a rule the code now follows is how the next reader learns
the wrong thing.

`TC-04-INT-22` currently blocks on `createSession` only (`apps/api/test/signwell-send.spec.ts:554`),
which is why the suite was green over this. T3 offers an optional extension of that same case to
the internal path, in spec 04's own file, and says to skip it rather than write a flaky one — a
`pg_stat_activity` assertion needs the call to block, and the internal provider does not.

---

## What did not change

The other nine tasks stand as written. The review stage read the same diff and faulted none of
them, and I re-checked what the plan asserts: all 70 paths cited by attempt 1 still exist, the
single additive migration `20260828140000_spec_04_signature_providers` is still the only one, and
the send path already obeys invariant 11 at the place it matters most —
`envelopes.service.ts:800-838` reads the provider once, freezes the document in memory, calls
`createSession` **outside** the transaction, and only then opens it.

Coverage after the replan, checked mechanically rather than by eye:

- requirements 1–42: every one assigned to at least one task; nothing assigned that the spec does
  not number.
- all 40 `TC-04-*` ids: present in `testCases` and mapped in `testCaseTasks`. No case in this spec
  reads `- **Retired.**`.
- every `files` entry and every `reuse.where`: exists on disk.
- exactly one task carries a `migration` block (T1), and it is additive.
- 11 tasks, one dependency graph, no dangling `dependsOn`.

## Notes carried, not raised again

Attempt 1 raised three spec notes (N1 the `SignWellEmbed` sentence in the first-signer flow, N2 the
missing DS-gaps table, N3 the area README saying an envelope's provider is written at creation) and
one self note. They are recorded in `run.json` and **none has been fixed**; they still stand and do
not need restating here. This attempt adds one new spec note and one self note, in the verdict.

Verdict: **pass**. The spec compiles into a plan; the two blockers were planning defects and code
defects respectively, not ambiguities, and neither needs a human.
