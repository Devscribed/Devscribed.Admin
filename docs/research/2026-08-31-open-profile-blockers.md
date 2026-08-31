# Открытый профиль ревью: полные блокеры, по моделям

**2026-08-31.** Приложение к [2026-08-30-review-sharding.md](2026-08-30-review-sharding.md) —
сырые данные, а не выводы. Здесь выписаны **все блокеры всех прогонов, где шард шёл без чеклиста**
(профиль `open`), с полным текстом правила, утверждения, свидетеля и предложенного исправления.

Источник каждой записи — `review.verdict.json` соответствующего прогона на диске. Ничего не
пересказано по памяти агента и ничего не переписано: `rule`, `claim`, `witness` и `suggestedFix`
приведены дословно.

## Что считается «пустым промптом»

Шард-агент без чеклиста: `review-shard-open` в прогонах E17–E20 и `review-shard` в A3, B3, E1–E3 —
до того, как в него добавили sweeps. Проверено на диске: `grep -c -i sweep` по определению агента
шарда даёт 0 во всех девяти прогонах, и в логе каждого из E17–E20 корень диспетчеризует именно
`review-shard-open`.

**Модель в заголовке — это модель шарда.** Корень (`code-reviewer`, он же сборщик вердикта) во
всех девяти прогонах — opus; это видно в `stages/review.attempt-1.start.json`. Прогон «на sonnet»
означает sonnet в шардах и opus в корне.

## Конфигурации

| прогон | воркtree | шард | effort шарда | файлов на шард | шардов | блокеров | заметок | wall (exit.json) | cost (лог) | строка в 08-30 |
|---|---|---|---|---|---|---|---|---|---|---|
| **A3** | `ds-lab-review` | opus | xhigh (default) | ~15 | 5 | 14 | 22 | 2001s | $36.07 | 4 |
| **B3** | `ds-lab-slice` | opus | xhigh (default) | ~13 | 6 | 12 | 15 | 2269s | $43.67 | 3 |
| **E18** | `ds-lab-e18` | opus | medium | 30 | 3 | 6 | 19 | 828s | $21.31 | 21 |
| **E20** | `ds-lab-e20` | opus | medium | 20 | 4 | 11 | 24 | 809s | $22.94 | 23 |
| **E1** | `ds-lab-e1` | sonnet | medium | 20 | 4 | 6 | 5 | 559s | $8.78 | 5 |
| **E2** | `ds-lab-e2` | sonnet | medium | 10 | 10 | 4 | 14 | 705s | $10.37 | 6 |
| **E3** | `ds-lab-e3` | sonnet | high | 15 | 7 | 3 | 11 | 697s | $13.60 | 7 |
| **E17** | `ds-lab-e17` | sonnet | xhigh | 20 | 4 | 4 | 8 | 836s | $14.65 | 20 |
| **E19** | `ds-lab-e19` | sonnet | xhigh | 15 | 5 | 5 | 11 | 1007s | $18.67 | 22 |

Итого: **43 блокера на opus** (4 прогона) и **22 на sonnet** (5 прогонов).

## Три известных дефекта против этих списков

Ground truth из 08-30: **B1** — секция Infrastructure не реализована, ни один файл не несёт три
значения SignWell в таск; **B2** — вызов провайдера внутри открытой транзакции
(`signing.service.ts`); **B3** — `POST /documents` ретраится пять раз без поиска сироты между
попытками (`signwell-http-client.ts`).

Ниже — **механический поиск по `findings[]`** каждого вердикта, а не ручная проверка: где
дефект найден, назван id находки и её severity; «—» значит, что этот поиск ничего не нашёл.

| прогон | B1 infra | B2 транзакция | B3 ретрай create |
|---|---|---|---|
| **A3** opus/xhigh | — | F13 (blocker) | F4 (blocker) |
| **B3** opus/xhigh | — | F11 (blocker) | F1 (blocker) |
| **E18** opus/medium | — | F5 (blocker) | — |
| **E20** opus/medium | — | F1 (blocker) | F5 (blocker) |
| **E1** sonnet/medium | — | — | F1 (blocker) |
| **E2** sonnet/medium | — | F1 (blocker) | — |
| **E3** sonnet/high | — | N1 (note) | — |
| **E17** sonnet/xhigh | — | F4 (blocker) | — |
| **E19** sonnet/xhigh | — | — | — |

**B1 не найден нигде.** Отдельно прогрепаны A3 и B3 целиком по `infra/`, `Terraform`,
`Infrastructure`, `no files`, `zero files`, включая прозаические поля `notes`, `pass` и
`covered`: единственные упоминания инфраструктуры там — о **порядке миграций**
(A3·F7, A3·F14, B3·F12) и о переменных окружения, которых нет в таблице спеки
(E20·N22, E19·N10, E17·F11). Ни одна находка не утверждает, что секция Infrastructure не
реализована.

**Где это расходится с 08-30.** Там A3 и B3 стоят как 3/3, а по этому поиску у обоих 2 из 3
(B2 и B3, без B1); E2 стоит как 2/3, а найден только B2. Поиск здесь механический и мог
пропустить иную формулировку — но в 08-30 сказано, что колонка «3 known» проверена руками,
так что расхождение стоит перепроверить человеку, а не считать его шумом скорера.

## Повторяемость: один файл — сколько прогонов

| файл | прогоны, поднявшие по нему блокер | n |
|---|---|---|
| `apps/api/src/signature/signwell/signwell-http-client.ts` | A3·F4, A3·F6, B3·F1, B3·F2, E18·F6, E20·F5, E20·F6, E1·F1, E2·F2, E17·F2 | 10 |
| `apps/api/src/documents/provider-reconciler.service.ts` | A3·F1, A3·F3, B3·F3, E1·F2, E2·F3, E3·F2, E17·F1, E19·F1 | 8 |
| `e2e/tests/signature-providers.spec.ts` | A3·F9, A3·F10, A3·F11, B3·F8, B3·F9, B3·F10, E18·F3 | 7 |
| `apps/api/src/signing/signing.service.ts` | A3·F13, B3·F11, E18·F5, E20·F1, E1·F3, E2·F1, E17·F4 | 7 |
| `docs/deployment.md` | A3·F7, B3·F12, E20·F9, E3·F1 | 4 |
| `specs/documents/04-signature-providers.md` | A3·F14, E1·F5, E19·F3 | 3 |
| `apps/api/src/organizations/signing-settings.controller.ts` | E18·F1, E1·F4, E3·F3 | 3 |
| `apps/api/src/documents/envelopes.service.ts` | E18·F2, E18·F4, E20·F2 | 3 |
| `apps/api/src/documents/envelope-completion.ts` | A3·F2, E20·F3 | 2 |
| `apps/web/app/org/[orgId]/documents/[envelopeId]/page.tsx` | A3·F12, E19·F4 | 2 |
| `apps/api/test/signing-settings.spec.ts` | B3·F6, E20·F10 | 2 |
| `apps/api/src/webhooks/webhook-rate-limit.guard.ts` | E20·F4, E19·F2 | 2 |
| `scripts/review-coverage.mjs` | E20·F7, E20·F8 | 2 |
| `apps/api/src/auth/capability.guard.ts` | E2·F4, E17·F3 | 2 |
| `apps/api/src/signature/signwell/signwell-signing-provider.ts` | A3·F5 | 1 |
| `apps/api/test/signwell-webhook.spec.ts` | A3·F8 | 1 |
| `apps/api/src/internal/envelope-sweep.service.ts` | B3·F4 | 1 |
| `apps/api/src/organizations/signing-settings.service.ts` | B3·F5 | 1 |
| `packages/validation/src/envelopes.test.ts` | B3·F7 | 1 |
| `apps/api/test/signwell-completion.spec.ts` | E20·F11 | 1 |
| `CLAUDE.md` | E1·F6 | 1 |
| `apps/web/app/org/[orgId]/settings/signing/ChangeProviderModal.tsx` | E19·F5 | 1 |

## Расхождения с 08-30, замеченные при сборке этого файла

- Таблица сравнения профилей в 08-30 приписывает A3 **13** блокеров; в вердикте на диске их **14**
  (сводная таблица результатов, строка 4, тоже говорит 14).
- Wall для A3 и B3: `exit.json` даёт 2001s и 2269s, 08-30 — 1164s и 1265s. Стоимость совпадает
  до цента ($36.07 и $43.67), то есть это те же прогоны, а не другие; в 08-30, судя по всему,
  критический путь, а не полное время стадии. Для остальных семи прогонов оба числа совпадают.

---

# Opus 5, пустой промпт

## A3 — opus/`xhigh (default)`, ~15 файлов, 5 шардов

`ds-lab-review/.workflow/runs/lab-A3/review.verdict.json` · status `blocked` · находок на шард: 6, 8, 5, 7, 11 · 2001s · $36.07 · старт 2026-08-30T11:21:43.977Z

**Блокеров: 14.**

### A3 · F1 — `apps/api/src/documents/provider-reconciler.service.ts:386` — `applyState`

**target:** `code`

**rule.** spec 04 invariant 9: Convergence never moves an envelope out of a terminal state. (also requirement 23)

**claim.** The terminal-state guard is taken against a copy of the envelope loaded BEFORE the fetchState network call and is never re-taken inside the convergence transaction, which holds no row lock. A void, decline or expiry committing during the provider round trip is overwritten.

**witness.** **kind:** scenario · **source:** `specs/documents/04-signature-providers.md:680`

Envelope E is sent on signwell. A document_signed delivery calls converge(E), which loads E with status sent, passes isTerminal at line 229, and awaits fetchState - a 10s-timeout HTTPS call with up to five backoff attempts. During that window an admin voids E: voidEnvelope takes SELECT FOR UPDATE at envelopes.service.ts:1331, deletes the remote document and commits status voided. applyState then opens its transaction at line 297 with no lock and no re-read, evaluates the branch against the stale copy, and writes status partially_signed at line 386. Observable: an envelope the admin voided is back in partially_signed, with a signed event written after the voided one. Verified by grep: FOR UPDATE and queryRaw appear nowhere in provider-reconciler.service.ts. The same hole exists on the declined branch and against an expired status the sweep materialized.

**suggestedFix.** Open the applyState transaction with the same SELECT FOR UPDATE that send and voidEnvelope already take, re-read the envelope and signers inside it, and abort with ignored_terminal if the fresh status is terminal. Compare against the re-read rows, never the pre-fetch copy.

### A3 · F2 — `apps/api/src/documents/envelope-completion.ts:203` — `EnvelopeCompletionService.store`

**target:** `code`

**rule.** spec 04 invariant 9: Convergence never moves an envelope out of a terminal state. Invariant 10: the bytes are in S3 before status completed commits.

**claim.** The write-once guard is an updateMany whose WHERE clause names only the id and a null signedPdfKey. It constrains signedPdfKey, never status. Under markCompleted it therefore sets status completed on an envelope that became voided, declined or expired while the provider PDF was downloading.

**witness.** **kind:** scenario · **source:** `specs/documents/04-signature-providers.md:680`

Envelope E is partially_signed. Convergence sees Completed and enqueues provider-complete. The job calls provider.completedDocument, an HTTPS download outside any transaction. During it an admin voids E: status voided commits, signedPdfKey still null. The job reaches store; the WHERE clause matches because it tests only signedPdfKey, and the update writes status completed plus a completed event. Observable: an envelope with a voided event in its chain reports completed, is downloadable, and sends completion mail for a contract the sender stopped. The pre-read at line 125 does not help, because it tests for an already-completed envelope rather than a terminal one.

**suggestedFix.** Add the status predicate to the same updateMany WHERE clause so the guard stays one atomic conditional update: status in sent or partially_signed when markCompleted. Zero rows then means terminal-or-already-claimed and must not write the completed event, exactly as the existing loser path does.

### A3 · F3 — `apps/api/src/documents/provider-reconciler.service.ts:327` — `applyState and openNextTurn`

**target:** `code`

**rule.** spec 04 TC-04-INT-05: Exactly one signed event. The chain verifies. checklist.md: Every path reachable twice is idempotent, with the mechanism named and a concurrency test. Concurrent access to the same row states its locking strategy.

**claim.** Two convergences of one envelope can run concurrently with no lock and no in-transaction re-read. The signed and declined branches guard only on the in-memory signer status loaded before the transaction, and the alreadyInvited count in openNextTurn is a READ COMMITTED read that both racers see as zero.

**witness.** **kind:** scenario · **source:** `specs/documents/04-signature-providers.md:1376`

No queue driver is needed: EnvelopesService.get awaits convergeIfStale on the request thread at envelopes.service.ts:398. Two concurrent GETs for a signwell envelope whose providerSyncedAt is two hours old both pass the staleness test, both call fetchState, both load the signer as notified, and both evaluate the signed branch as true at line 327 - there is no database re-check on that branch at all, unlike the viewed branch above it. Result: two signed EnvelopeEvent rows for one signature, where TC-04-INT-05 demands exactly one, and both racers read alreadyInvited as zero so signer 2 receives two invitations carrying two independently valid links. EnvelopeEventsService.record reads the previous event with an unlocked findFirst, so two records landing before either commits write the same previousEventHash and verifyChain reports the chain broken - which is what TC-04-INT-13 asserts against. Every other event writer in this codebase serializes first; the reconciler is the only one that does not.

**suggestedFix.** Same lock as F1: take the envelope row FOR UPDATE at the top of the applyState transaction so convergences of one envelope serialize, and re-read the EnvelopeSigner and signingToken rows inside it.

### A3 · F4 — `apps/api/src/signature/signwell/signwell-http-client.ts:291` — `HttpSignWellClient.attempt`

**target:** `code`

**rule.** spec 04 requirement 26: POST /documents is not idempotent on SignWell side and our retry must not create two documents for one envelope. Before retrying a create that failed without a response, the client looks for a document already carrying this envelope id in metadata.

**claim.** The generic five-attempt retry loop is applied to the create-document family with no idempotency key and no orphan lookup between attempts, so one send can issue up to five POST /documents. The orphan search runs only after all attempts are exhausted, never before a retry - the exact moment requirement 26 names.

**witness.** **kind:** scenario · **source:** `specs/documents/04-signature-providers.md:414`

Attempt 1 reaches SignWell and creates document A; the response is lost at the 10s deadline. The catch branch at line 323 records the failure - its own comment says a timeout is indistinguishable from the request never arriving, which is exactly the case requirement 26 orphan recovery exists for - and then continues the loop. Attempt 2 creates document B. The envelope pins B while A stays open on SignWell with a live embedded signing URL per recipient, fires webhooks recorded as unknown_ref, and is never adopted because adoptExisting is only set on a later send. apps/api/test/signwell-client.spec.ts:98-109 asserts five calls were spent for one createDocument.

**suggestedFix.** Restrict create-document retries to 429, where the request was rejected and may safely be repeated, and hand the failed-without-a-response path back to createOrAdopt so the metadata scan runs before any second POST.

### A3 · F5 — `apps/api/src/signature/signwell/signwell-signing-provider.ts:282` — `verifyMaterialized`

**target:** `code`

**rule.** spec 04 requirement 38: verifies that the parsed fields are the ones our translation emitted. Edge case 24: text tags parse into the wrong count or the wrong recipient - the document is deleted rather than left open.

**claim.** The materialization check is a subset check, not the set equality requirement 38 states. It walks the expected fields, claims a match for each, and returns as soon as nothing is missing. The claimed flag is set but never asserted across the received list, so a parse producing MORE fields than our translation emitted passes verification.

**witness.** **kind:** scenario · **source:** `specs/documents/04-signature-providers.md:581`

Two signers, with one required signature expected per recipient. The poll returns three required signature fields: recipient 1, recipient 1, recipient 2 - a tag split, or a residual brace requirement 14c missed. Both expectations find a match, nothing is missing, the method returns, the envelope flips to sent, and the counterparty receives a contract carrying a third signature field nobody expected, invisible in the output because requirement 14d paints tags in the page background colour. The document is neither deleted nor reported as document_fields_not_materialized, contradicting the wrong-count half of edge case 24. The received list is already passed to the error constructor, so the data needed to fail is present and unused.

**suggestedFix.** After the expectation loop, fail when any received field is left unclaimed: delete the document and throw ProviderFieldsNotMaterializedError naming the unexpected fields, as it already does for the missing ones. Add an integration case beside TC-04-INT-03b for the too-many direction.

### A3 · F6 — `apps/api/src/signature/signwell/signwell-http-client.ts:259` — `HttpSignWellClient.call`

**target:** `code`

**rule.** spec 04 requirement 19: The client serializes per organization, retries 429 with exponential backoff and jitter, five attempts, then surfaces provider_unavailable. Blast Radius, outbound network: a hung provider could exhaust the request pool, mitigated by a hard 10s timeout per call.

**claim.** Only createDocument passes an organizationId. getDocument, listDocuments, deleteDocument, completedPdf, ping and hooks all omit it, so every read falls into the single shared lane and is serialized globally rather than per organization. The comment at line 256 describes the opposite of what the code does.

**witness.** **kind:** scenario · **source:** `specs/documents/04-signature-providers.md:349`

Organization A reconciler calls fetchState; SignWell hangs, so the call burns five attempts at the 10s deadline plus backoff, roughly 41 seconds. During that window every signer of every OTHER organization opening a signing link calls signerAccess and then getDocument, which queues behind it in the shared lane. Their page open blocks for up to 41 seconds while their own provider path is healthy, and each blocked request holds a request slot - the pool exhaustion the 10s timeout exists to prevent. Blast Radius names signerAccess on every page open as the hot path.

**suggestedFix.** Thread the organization id through the read calls so the lane key is genuinely per organization, or stop queueing calls that carry no organization at all - reads report a limit of 120 and it is the create budget of 10 per minute that needs a lane. Also drop finished lanes from the queue map, which currently grows one never-removed entry per organization for the life of the process.

### A3 · F7 — `docs/deployment.md:84` — `Every day and Troubleshooting, migration ordering`

**target:** `code`

**rule.** spec 04 Backward Compatibility 3: the mechanism for the window is a release-procedure concern, and the choice belongs in docs/deployment.md. CLAUDE.md: the runbook for releasing, rolling back, and what to do when a deploy fails is docs/deployment.md.

**claim.** The 41 added lines are the deliverable Backward Compatibility 3 delegates to the runbook, and their load-bearing statements are false about the pipeline they describe. infra/deploy.sh has migrated BEFORE the rollout since commit b7a167e, and infra is untouched by this diff. So the claims that migrations run after the rollout by default, that push to main deploys dev rollout-first migration-second, and that the first release needing the other order is spec 04, are all wrong - deploy.sh lines 36-39 name the user-management merge as the release that forced the order.

**witness.** **kind:** scenario · **source:** `infra/deploy.sh:27`

An operator follows the new recipe at docs/deployment.md lines 100-103. Step 1 is make migrate-dev: Makefile lines 162-164 run infra/migrate.sh, which only does an aws ecs run-task against an existing task definition at migrate.sh lines 31-33; it never applies a new one. The migrate task image is var.api_image at infra/terraform/modules/app/api.tf:250, whose default is null in variables.tf lines 64-68, so it is the digest from the last apply - the PREVIOUS release image, which contains no 20260828140000_spec_04_signature_providers directory. The task prints no pending migrations and exits 0, and the operator believes the schema is ahead of the code when it is not. Step 2, make deploy-dev, is the only thing that applies it, and deploy.sh lines 177 to 191 already migrate before rolling out, so the documented hazard never existed for this release. Separately the troubleshooting entry at lines 306-314 describes a green-rollout-then-red-migration state that deploy.sh cannot produce, because it runs under set -euo pipefail with the migration at line 184 and the rollout apply at line 187.

**suggestedFix.** Rewrite both sections against what infra/deploy.sh does: migrations run before the rollout, from the image about to be deployed, for every API release. Delete the migrate-then-deploy recipe and the paragraph naming spec 04 as the first release to need it, and rewrite the troubleshooting entry for the state the script can actually produce - a red migration means nothing was rolled out and the environment still serves the previous release.

### A3 · F8 — `apps/api/test/signwell-webhook.spec.ts:193` — `TC-04-INT-07`

**target:** `code`

**rule.** spec 04 TC-04-INT-04, TC-04-INT-05, TC-04-INT-07 and TC-04-INT-08, all at integration level. CLAUDE.md: test cases are numbered in the specs and the code references those ids.

**claim.** ProviderReconcilerService is referenced at lines 193 and 214 but never imported. The import block runs from line 1 to line 30 and contains no entry for the provider-reconciler module. Under ts-jest this is TS2304 and the whole file fails to compile, taking four integration cases with it.

**witness.** **kind:** test · **source:** `apps/api/test/signwell-webhook.spec.ts:193`

TC-04-INT-04, TC-04-INT-05, TC-04-INT-07 and TC-04-INT-08 cannot execute. Verified statically: grep for ProviderReconcilerService in the file returns exactly one line, 193, and the import list holds no such entry. The symbol is exported from apps/api/src/documents/provider-reconciler.service.ts:63 and is imported correctly by signwell-completion.spec.ts:15. This deletes the only integration coverage of requirement 21 that state is never taken from the notification body, of webhook redelivery idempotency, of the unknown-reference non-leakage rule in requirement 25, and of the bad-hash 401.

**suggestedFix.** Add the ProviderReconcilerService import from ../src/documents/provider-reconciler.service to the import block. Nothing else in the cases needs to change, since unknownRefCount already exists on the service.

### A3 · F9 — `e2e/tests/signature-providers.spec.ts:209` — `TC-04-E2E-02`

**target:** `code`

**rule.** spec 04 TC-04-E2E-02, expected result 1: the browser URL stays on our origin.

**claim.** The origin assertion constructs a URL from the link value, but signingLinkFor returns a pathname rather than an absolute URL. Constructing a URL from a path-only string with no base throws TypeError ERR_INVALID_URL, so the case fails at this line before any later assertion runs.

**witness.** **kind:** test · **source:** `e2e/tests/helpers.ts:409`

TC-04-E2E-02 fails deterministically. e2e/tests/helpers.ts:409 ends signingLinkFor by returning the pathname of the signing URL, and its doc comment at line 400 says it returns the path so it can be opened against the Playwright baseURL. Every other caller uses it as a relative path - envelopes-signing.spec.ts:157 and 200, regressions.spec.ts:412, 429 and 505, field-autofill.spec.ts:400 and 403. Line 209 is the only site feeding it to a URL constructor without a base.

**suggestedFix.** Assert against the project baseURL instead of re-parsing the relative link, for example by checking that the signer URL starts with the base. If an absolute link is wanted, add an absolute variant to signingLinkFor rather than re-parsing its return value.

### A3 · F10 — `e2e/tests/signature-providers.spec.ts:164` — `TC-04-E2E-01`

**target:** `code`

**rule.** spec 04 TC-04-E2E-01, expected result 4: the confirm button is disabled until the checkbox is ticked, and enabled after. UI Description: the confirm checkbox gates the confirm button.

**claim.** The check call on signing-change-confirm resolves to a label, not an input. ChangeProviderModal.tsx:74 passes the testid to the design-system Checkbox, which spreads unknown props onto its wrapping label and leaves the real checkbox input untagged, so Playwright throws Not a checkbox or radio button.

**witness.** **kind:** test · **source:** `1_DS for dev/components/forms/Checkbox.jsx:9`

TC-04-E2E-01 fails deterministically at line 164, taking with it the only assertion that the deliberate confirmation actually gates the submit. Verified: the design-system Checkbox at line 9 of its source destructures checked, onChange, label, disabled and style, then renders a label spreading the remaining props, while the real input at line 24 carries no testid and is hidden with position absolute, opacity 0 and pointer events none. The established repo pattern for this same component is a click, not a check - envelopes-signing.spec.ts:189 and 209 and regressions.spec.ts:422, 447 and 512 all click signing-consent-checkbox, which is the identical shape.

**suggestedFix.** Use click as every other spec in this suite does for the design-system Checkbox. Do not add a testid inside the design system for this, since that edits the DS, which this spec does not authorise.

### A3 · F11 — `e2e/tests/signature-providers.spec.ts:293` — `TC-04-E2E-04`

**target:** `code`

**rule.** spec 04 TC-04-E2E-04, expected result 3: a user navigating to the same route gets the not-found page and has no Settings item in the sidebar.

**claim.** The logout-button click is issued without first opening the account menu. logout-button lives inside a conditionally rendered menu in Topbar.tsx and is not in the DOM until topbar-account-button is clicked, so the click times out and the case never reaches its user half.

**witness.** **kind:** scenario · **source:** `apps/web/src/layout/Topbar.tsx:117`

Signed in as the manager on the signing settings route, the account menu is closed, so the locator resolves to zero elements and the click fails on the action timeout. Verified: apps/web/src/layout/Topbar.tsx:117 opens the conditional guarding the menu div, and the logout-button testid sits inside it at line 152. The only other E2E that logs out, app-shell.spec.ts lines 34-35, clicks topbar-account-button first. The half that is lost is the one proving the nav item is absent and the route is not rendered for a user, which is the CLAUDE.md rule that a nav item the current role cannot use is not rendered.

**suggestedFix.** Insert a click on topbar-account-button before the logout click, matching app-shell.spec.ts:34.

### A3 · F12 — `apps/web/app/org/[orgId]/documents/[envelopeId]/page.tsx:226` — `EnvelopeScreen`

**target:** `code`

**rule.** spec 04 requirement 28: for a SignWell envelope our Certificate of Completion is not generated. Acceptance criterion 8: and no Certificate of Completion of ours. Required data-testid Attributes lists envelope-certificate-link under Envelope detail.

**claim.** Requirement 28 has no falsifiable coverage at any level. The spec requires an envelope-certificate-link testid on the envelope detail; no component in apps/web renders it, and no component renders any certificate control at all. The API computes a certificateIssued flag at envelopes.service.ts:1711 for a consumer that does not exist.

**witness.** **kind:** test · **source:** `apps/web/app/org/[orgId]/documents/[envelopeId]/page.tsx:259`

Both assertions that claim to prove requirement 28 pass under every possible implementation, including one that generates a certificate. First, e2e/tests/signature-providers.spec.ts:327 asserts envelope-certificate-link has count zero, and a repository-wide search of apps/web for that id returns no match, so it is zero for internal envelopes too. Second, apps/api/test/signwell-completion.spec.ts:170 asserts the response certificateUrl is undefined, and a grep for certificateUrl across apps, packages and e2e returns exactly one hit - that assertion line itself. The neighbouring signedPdfHash assertion proves the stored bytes are the provider bytes but cannot detect a certificate generated in addition.

**suggestedFix.** Render the certificate control for internal completed envelopes under envelope-certificate-link, driven by the certificateIssued flag the API already returns. That makes the E2E absence assertion meaningful and satisfies the Known Gaps line that the envelope detail names which evidence format it is. At integration, give the StubPdfRenderer in signwell-completion.spec.ts the rendered log its sibling in signwell-send.spec.ts:46 already has, assert it is still empty after completion, and delete the certificateUrl line.

### A3 · F13 — `apps/api/src/signing/signing.service.ts:397` — `SigningService.sign`

**target:** `spec`

**rule.** spec 04 invariant 11: a provider call never runs inside a database transaction, and every adapter method is called before or after one, never within. Acceptance criterion 12: no provider call is made while a database transaction is open. Requirement 10: the existing spec 02 test suite passes unchanged, and nothing else in that suite may be touched.

**claim.** Two written rules contradict each other and no implementation satisfies both. applySignature, a method of the SigningProvider port LocallySigned interface, is awaited inside the transaction opened at line 317, after the SELECT FOR UPDATE at line 321. Invariant 11 and acceptance criterion 12 are both stated absolutely, while requirement 10 forbids the spec 02 test edits that hoisting the call would force by reordering error precedence.

**witness.** **kind:** rule · **source:** `specs/documents/04-signature-providers.md:684`

Invariant 11 says every adapter method is called before or after a transaction, never within, and acceptance criterion 12 restates it as an observable check. The code asserts the opposite in two places and documents why: signing-provider.ts lines 66-70 call it the one call that runs inside a transaction, deliberately, and signing.service.ts lines 386-395 repeat the reasoning. The spec shows the shape it uses when it means an exception - requirement 10 says one exception, enumerated rather than left to judgement - and no such enumeration exists for invariant 11. TC-04-INT-22 exercises only createSession, so the suite passes while the invariant does not hold. Two independent shards reached this finding from different files.

**suggestedFix.** A person decides. Either amend invariant 11 and acceptance criterion 12 with an enumerated exception for a signing surface of ours, in the same shape requirement 10 uses - the reason is already written in the code comment, that a local provider never touches the network - or confirm that hoisting the call above the transaction preserves spec 02 error precedence, in which case this becomes a code fix. Routed to spec because sending it to code without settling that risks a loop that cannot terminate.

### A3 · F14 — `specs/documents/04-signature-providers.md:1180` — `Backward Compatibility 3`

**target:** `spec`

**rule.** CLAUDE.md, Watch out for: make deploy-env rolls the services out and then runs prisma migrate deploy, so the new code is serving before the schema changes, which is only safe because migrations are additive - stated as a rule, not an observation. spec 04 Backward Compatibility 3 restates the same order as fact.

**claim.** A written rule in CLAUDE.md, restated as fact in the spec Backward Compatibility 3 and again in the migration file header, describes a deploy order the pipeline does not have. infra/deploy.sh migrates before the rollout and has since commit b7a167e, and infra is not touched by this diff. Every downstream conclusion drawn from the stale premise is unsound, including this spec claim to have discovered the hazard.

**witness.** **kind:** rule · **source:** `infra/deploy.sh:27`

CLAUDE.md asserts rollout-then-migrate as a rule. infra/deploy.sh:27 states the opposite in terms: migrations run BEFORE the rollout, and the order is the whole point. Its header already makes the exact argument the spec presents as new - additive migrations make old code against a new schema safe, and say nothing about new code against an old schema - naming the user-management merge, not spec 04, as the release that forced it. The order in code is line 177 apply the migrate task definition, line 184 run the migration, line 187 apply the rollout. The same stale premise is repeated in the migration header at lines 5-11.

**suggestedFix.** A person corrects the CLAUDE.md bullet and the spec Backward Compatibility 3 to match infra/deploy.sh, and decides whether the migration header may be edited - Prisma checksums migration files, so editing it after the migration has been applied anywhere would break prisma migrate deploy on that copy. Leave the SQL itself alone, since it is correctly additive. F7 covers the runbook half.

## B3 — opus/`xhigh (default)`, ~13 файлов, 6 шардов

`ds-lab-slice/.workflow/runs/lab-B3/review.verdict.json` · status `blocked` · находок на шард: 11, 9, 6, 15, 9, 10 · 2269s · $43.67 · старт 2026-08-30T11:21:46.360Z

**Блокеров: 12.**

### B3 · F1 — `apps/api/src/signature/signwell/signwell-http-client.ts:323` — `HttpSignWellClient.attempt`

**target:** `code`

**rule.** spec req 26 - Before retrying a create that failed without a response, the client looks for a document already carrying this envelope id in metadata.

**claim.** The transport retries POST /documents up to five times with no orphan lookup between attempts; the metadata scan runs only after all five are spent.

**witness.** **kind:** scenario · **source:** `specs/documents/04-signature-providers.md:415`

Send an envelope under SignWell. Attempt 1 POSTs /documents; SignWell accepts it and begins its two-phase asynchronous create (req 13), but the reply does not arrive inside the 10s AbortController deadline. The transport throws, the catch at line 323 records the failure and continues to attempt 2, which POSTs the identical body. SignWell has no idempotency key, so a second document is created carrying the same metadata.envelope_id. createSession pins the second; the first stays live with the real counterparties on it, each holding a working embedded_signing_url, unreachable by us, answering every webhook with unknown_ref. findOrphan inside createOrAdopt at signwell-signing-provider.ts:195 runs only in the catch, after all five attempts are gone. The pre-emptive scan at line 178 is gated on adoptExisting, which is set only by a PREVIOUS send that left the ORPHANED_SESSION marker, so it never fires within the send that creates the duplicate. The comment at line 324 names this exact case and retries anyway.

**suggestedFix.** Do not retry the create-document family inside the transport loop, or pass a findExisting callback the loop must consult before each repeat. apps/api/test/signwell-client.spec.ts:109 currently asserts the unsafe behaviour and must move with it.

### B3 · F2 — `apps/api/src/signature/signwell/signwell-http-client.ts:259` — `HttpSignWellClient.call`

**target:** `code`

**rule.** spec req 19 - The client serializes per organization, retries 429 with exponential backoff and jitter, five attempts, then surfaces provider_unavailable.

**claim.** Serialization is keyed by the request organizationId falling back to a shared literal, and only createDocument passes an organizationId. Every read shares one global lane across all organizations, and the port shape makes per-organization keying impossible for reads.

**witness.** **kind:** scenario · **source:** `specs/documents/04-signature-providers.md:349`

Signer A in org 1 and signer B in org 2 open the signing page at the same moment. Both reach provider.signerAccess, then http.getDocument, then serialize on the shared key. B does not start until A finishes. If SignWell is hung for A, A burns the 10s deadline five times with backoff between them, roughly 50 seconds, and B, in a different organization, waits behind it before its own first packet leaves. The Blast Radius names a hard 10s timeout per call as the mitigation for a hung provider exhausting the request pool; global serialization defeats it, because the Nth queued caller waits N times the whole retry sequence. Worse in the ordinary case, completedPdf downloads multi-megabyte PDFs on that same shared lane, so every signer page load queues behind every completion download process-wide. SignerAccessRequest at signing-provider.ts:177, CompletedDocumentRequest at line 261 and fetchState taking only a providerRef string at line 89 carry no organization, so this cannot be fixed inside the client alone.

**suggestedFix.** Add organizationId to SignerAccessRequest, CompletedDocumentRequest, CancelRequest and fetchState, and key serialize by it for every route family. Health checks with no organization in scope keep the shared lane.

### B3 · F3 — `apps/api/src/documents/provider-reconciler.service.ts:279` — `ProviderReconcilerService.applyState`

**target:** `code`

**rule.** checklist.md:20 - Every path reachable twice is idempotent, with the mechanism named and a concurrency test; checklist.md:25 - Concurrent access to the same row states its locking strategy; spec req 23 and edge case 8.

**claim.** Convergence computes its difference from a snapshot loaded before the transaction and never re-read or locked inside it. send at envelopes.service.ts:854 and voidEnvelope at line 1331 each open with a SELECT FOR UPDATE on the envelope row; the reconciler, the second writer of the same rows and the same hash chain, takes no lock at all.

**witness.** **kind:** scenario · **source:** `apps/api/src/documents/provider-reconciler.service.ts:279-406`

Envelope E on signwell, status sent, signer 1 notified. SignWell delivers two notifications whose event.time differs by one second, so both survive the composite dedupe key - the shape signwell-completion.spec.ts:358 already constructs. Both provider-reconcile jobs dispatch concurrently. Both load signer 1 as notified; both fetchState report recipient 1 signed. The guard at line 309 tests the remote status against the PRE-transaction copy of signer.status, so both enter the branch: B blocks on the envelopeSigner row lock, resumes after A commits, and writes a SECOND signed EnvelopeEvent plus a second provider_synced. The audit trail then lists Signed twice for one signer, against the promise in edge case 8 that convergence writes a transition once per signer. The viewed branch is safe only because it re-reads inside the transaction via tx.envelopeEvent.count at line 290; the signed branch has no such re-read. A second instance of the same root cause: when the only difference is that the provider opened the turn of signer 2, nothing is locked before openNextTurn, both transactions read the live-token count as zero under READ COMMITTED, and both create one - two live signing tokens and two SES invitations to the same counterparty. TC-04-INT-13 exercises concurrency only for completed, which the signedPdfKey IS NULL guard already protects, so it passes while this is broken.

**suggestedFix.** Open the applyState transaction with the same SELECT FOR UPDATE the sibling paths use and re-read the signers inside it, so every signer.status guard is evaluated against committed state. Add a concurrency case counting signed and email_accepted events.

### B3 · F4 — `apps/api/src/internal/envelope-sweep.service.ts:48` — `EnvelopeSweepService.run`

**target:** `code`

**rule.** spec req 27 and invariant 10, with checklist.md:22 - A failure in a derived artifact cannot lose the irreplaceable one.

**claim.** materializeExpired runs before retryProviderDownloads in the same sweep and expires on status in sent or partially_signed with expiresAt in the past, with no pdfStatus or providerRef exclusion. A SignWell envelope the provider has completed but whose PDF failed to download sits in exactly those statuses by invariant 10, and once expired there is no path back.

**witness.** **kind:** scenario · **source:** `apps/api/src/internal/envelope-sweep.service.ts:39-105`

Envelope E on signwell with expiresAt at time T. At T minus 40 minutes the last signer signs; the webhook converges, fetchState says Completed, provider-complete is enqueued, and completedDocument fails because S3 refuses the put or completed_pdf answers 500. completeFromProvider sets pdfStatus pending and providerError and correctly leaves status partially_signed. The next hourly sweep at T plus 20 minutes evaluates materializeExpired at line 48 before retryProviderDownloads at line 57, because object literal properties evaluate in source order, so E flips to expired with an expired event, and retryProviderDownloads then finds nothing since it filters on status in sent or partially_signed at line 69. sweepStale filters the same two statuses, and converge returns ignored_terminal for a terminal envelope. Observable: the envelope detail permanently reads Expired for a contract both counterparties executed, and the SignWell completed PDF with its audit page - the record of execution under req 27, which we did not produce and cannot reproduce - is never fetched into our bucket by any sweep, read or webhook.

**suggestedFix.** Exclude from materializeExpired any envelope that is remotely settled but not yet downloaded, meaning providerRef non-empty, pdfStatus pending and signedPdfKey null; or run retryProviderDownloads first and admit the expired status to its filter.

### B3 · F5 — `apps/api/src/organizations/signing-settings.service.ts:211` — `SigningSettingsService.liveChecks`

**target:** `code`

**rule.** spec req 32 - reachable and webhookRegistered are live checks displayed beside the option - with Actors and Preconditions item 4, which defines a registration as one pointing at our URL whose id is stored as SIGNWELL_WEBHOOK_SECRET.

**claim.** webhookRegistered is computed as the hook list being non-empty, which answers whether this SignWell account has any webhook rather than whether our webhook is registered. Both the callback_url and the id we hold are discarded.

**witness.** **kind:** scenario · **source:** `specs/documents/04-signature-providers.md:1165`

SIGNWELL_WEBHOOK_SECRET holds hook id A, and per req 20b the id IS the secret. Hook A was deleted in the SignWell UI; hook B, registered by a colleague against a dead ngrok hostname, still exists in the same account. An admin opens the signing settings GET: hooks returns one row for B whose callback_url points at the dead tunnel, the non-empty test is true, and the response carries webhookRegistered true. The screen tells the admin the webhook is registered while no delivery will ever reach us, and every delivery that does arrive is hashed with id B and answered 401, because verifySignWellHash keys on id A. This is exactly the case the Blast Radius row on a stale webhook registration names this check as the mitigation for, and that row rates the underlying risk as the ability to sign as the recipient. SignWellHook already carries callback_url at signwell-types.ts:84, so the data needed to answer correctly is discarded rather than absent.

**suggestedFix.** Compare each hook id against SIGNWELL_WEBHOOK_SECRET, and surface the callback_url of the matched hook on the option so an unexpected address is visible on the screen.

### B3 · F6 — `apps/api/test/signing-settings.spec.ts:126` — `TC-04-INT-16`

**target:** `code`

**rule.** spec TC-04-INT-16 expected result 1 - manager, user and viewer get 403 with the spec message - the Error Messages table row for Permission denied, and CLAUDE.md Validation, which puts message text in packages/validation and forbids inline user-facing messages.

**claim.** The 403 body on both signing-settings endpoints is the templates copy from spec 01, and the string spec 04 mandates exists nowhere in the repository. The new test asserts the wrong constant, so it pins the divergence in place instead of catching it.

**witness.** **kind:** scenario · **source:** `specs/documents/04-signature-providers.md:1088`

A manager opens the signing settings screen and presses Save. The PUT reaches CapabilityGuard, which finds no ManageSigningSettings and throws forbidden at capability.guard.ts:63, returning message equal to TEMPLATE_MESSAGES.generic.forbidden, which is the literal You do not have permission to manage templates at packages/validation/src/documents.ts:125. The manager is told they may not manage templates on a screen that has nothing to do with templates. Spec 04 requires the message You do not have access to this resource in both the GET and PUT API contracts and in the Error Messages table; a grep for that string across apps, packages and e2e returns nothing, so no code path can produce it. signing-settings.spec.ts:126 asserts the templates constant, so QA goes green on the divergence.

**suggestedFix.** Add the spec-04 permission-denied message to packages/validation, have the signing-settings 403 carry it, and assert that constant here instead.

### B3 · F7 — `packages/validation/src/envelopes.test.ts:404` — `TC-02-UNIT-02`

**target:** `code`

**rule.** spec req 10 - That single assertion may be updated to seventeen. Nothing else in the spec 02 suite may be touched, and any other edit is the defect this requirement describes.

**claim.** The edit to the spec 02 suite goes past the one enumerated exception: besides updating the two counts from fifteen to seventeen it adds two new membership assertions, renames the test, and adds a comment.

**witness.** **kind:** rule · **source:** `specs/documents/04-signature-providers.md:234`

The diff of packages/validation/src/envelopes.test.ts shows, inside TC-02-UNIT-02, two added assertions that ENVELOPE_EVENT_TYPES contains provider_synced and provider_error, plus a renamed test title and a three-line comment. Requirement 10 enumerates the permitted change rather than leaving it to judgement, and closes the argument explicitly: nothing else may be touched. This is a bright-line rule rather than a behavioural defect, since the added assertions are harmless in themselves and even strengthen the test, but the spec pre-empted exactly this judgement call, so the fix is to honour the line rather than relitigate it.

**suggestedFix.** Keep only the fifteen-to-seventeen update; move the two membership assertions into a spec 04 unit case.

### B3 · F8 — `e2e/tests/signature-providers.spec.ts:209` — `TC-04-E2E-02`

**target:** `code`

**rule.** spec TC-04-E2E-02, expected results 1 through 5.

**claim.** The origin comparison constructs a URL from link, which is a pathname, with no base argument, so it throws a TypeError before the case asserts anything.

**witness.** **kind:** scenario · **source:** `e2e/tests/helpers.ts:398-411`

signingLinkFor returns the pathname of the signing URL at e2e/tests/helpers.ts:410, and its doc comment at line 399 says it returns the path so it can be opened against the Playwright baseURL. So link is a bare path beginning with /sign/. The goto call succeeds because Playwright resolves it against baseURL, but the next statement constructs a URL from that bare path with one argument, which is a WHATWG parse failure and throws Invalid URL. TC-04-E2E-02 therefore errors at line 209 on every run, before asserting the frame src, the test badge, or the absent signature canvas - the three things the case exists to prove.

**suggestedFix.** Compare pathnames instead, which needs no base argument.

### B3 · F9 — `e2e/tests/signature-providers.spec.ts:149` — `TC-04-E2E-01 and TC-04-E2E-04`

**target:** `code`

**rule.** CLAUDE.md Testing - Selectors are data-testid only, and the ids are named in the specs.

**claim.** The suite reaches past the ids the spec names into the hidden input of the design system, via a radio role query at lines 149, 150 and 289, and then drives it with check at lines 154 and 164, which cannot succeed against an input the DS renders with pointer-events none.

**witness.** **kind:** scenario · **source:** `CLAUDE.md`

Radio renders its real input absolutely positioned at one pixel, zero opacity, with pointerEvents none, in the design system at components/forms/Radio.jsx:20, and Checkbox is identical at Checkbox.jsx:28. The Playwright check call retargets the label to its control and runs the full actionability set on that input including the hit-target check; an element with pointer-events none is excluded from elementsFromPoint, so the hit element resolves to the label, an ancestor rather than a descendant, and the action fails instead of ticking anything. TC-04-E2E-01 therefore never reaches the modal, so expected results 3, 4 and 5 - the in-flight count, the gated confirm button and the saved toast - are never evaluated. signature-providers.spec.ts is the only file under e2e/tests using check or a radio role query; every other file drives these same DS controls by clicking the labelled testid, at envelopes-signing.spec.ts:189, document-templates.spec.ts:73 and projects.spec.ts:104.

**suggestedFix.** Click the DS label through its testid as the rest of the suite does, and keep toBeChecked and toBeDisabled for the assertions, which are read-only and work fine against the hidden input. If selection or disabled-ness must be observable, put it on the signing-provider-option element the spec already names.

### B3 · F10 — `e2e/tests/signature-providers.spec.ts:247` — `setProviderHealth`

**target:** `code`

**rule.** spec TC-04-E2E-02 preconditions, a sent SignWell envelope, and TC-04-E2E-05 preconditions, one completed SignWell test-mode envelope seeded through the API.

**claim.** TC-04-E2E-03 makes the SignWell stub unhealthy process-wide for the duration of a page load plus several assertions, while playwright.config.ts:49 sets fullyParallel true and the stub health is a single field on a single Nest singleton.

**witness.** **kind:** scenario · **source:** `e2e/playwright.config.ts:49`

StubSignWellHttpClient holds one private healthy field at stub-signwell-http-client.ts:39, and assertHealthy guards createDocument, getDocument, listDocuments, deleteDocument and completedPdf at lines 75, 128, 141 and 153. Worker A runs TC-04-E2E-03 and posts healthy false at line 247, then spends seconds on the page load and four assertions before restoring it at line 263. Worker B concurrently runs TC-04-E2E-02 or TC-04-E2E-05 and calls createEnvelope with send true on an organization already switched to SignWell; the send reaches createDocument, assertHealthy throws ProviderUnavailableError, and createEnvelope fails its precondition. For a signing-page open instead, the sign API answers 503 and the page renders sign-embedded-error where the case expects sign-embedded-frame. The justification the config gives for parallelism is that every test mints its own account, which covers database rows and says nothing about a shared in-process switch.

**suggestedFix.** Scope the health switch per organization or per document id, keyed by the body of the health fixture route, or put the file in a serial describe with a comment recording that the stub is process-global.

### B3 · F11 — `apps/api/src/signing/signing.service.ts:397` — `SigningService.sign`

**target:** `spec`

**rule.** spec invariant 11 - A provider call never runs inside a database transaction. Every adapter method is called before or after one, never within - acceptance criterion 12 - No provider call is made while a database transaction is open - and the specs/documents/README.md cross-spec rule of the same name, owned by 04 and affecting 02.

**claim.** applySignature, an adapter method of the port defined by requirement 3, is awaited inside the transaction opened at line 317. The deviation is deliberate and documented and its reasoning is sound, but three unqualified written rules say otherwise, and satisfying them collides with requirement 10.

**witness.** **kind:** rule · **source:** `specs/documents/04-signature-providers.md:684`

Invariant 11 is unconditional, saying every adapter method, and acceptance criterion 12 restates it as an observable; the area README registers it as a shared rule affecting spec 02, so it is not local to this spec. signing.service.ts:317 opens the transaction and line 397 awaits a port method inside it. But the stated rationale of the invariant, that a five-attempt backoff inside a transaction would hold a row lock for a minute, cannot apply to a provider whose signingSurface is ours: InternalSigningProvider.applySignature at internal-signing-provider.ts:89 is pure string work with no I/O. Meanwhile requirement 9 demands that spec 02 behaviour be preserved exactly and requirement 10 forbids editing its suite, and moving the call out would reorder error precedence, because the requireDrawnImage and requireTypedName throws would then precede the field-value validation at signing.service.ts lines 366 to 384. TC-04-INT-22 exercises only createSession, so the test the spec itself wrote scopes the invariant to the network case its rationale describes. Routing this to code would send the implementer to refactor the signing transaction of a shipped signature engine - the highest-risk row in the Blast Radius of this very spec - to satisfy a rule whose purpose is already met, with requirement 10 removing the test cover that would catch a regression.

**suggestedFix.** Narrow invariant 11, acceptance criterion 12 and the README shared rule to an adapter method that performs I/O to a remote provider, and record the LocallySigned applySignature exemption with its reason; then the code stands unchanged. The alternative, ordering the refactor, requires the requirement 10 exemption list to grow deliberately.

### B3 · F12 — `docs/deployment.md:84` — `Every day and When a deploy fails`

**target:** `spec`

**rule.** spec Backward Compatibility 3, which asserts that make deploy-env rolls services out before prisma migrate deploy and delegates the window to docs/deployment.md, and the matching CLAUDE.md Watch out for bullet.

**claim.** The premise is false for this repository and has been since before the diff base. infra/deploy.sh already migrates BEFORE the rollout, so Backward Compatibility 3, the thirty new runbook lines added here, and the migration.sql header all reason from a stale statement in CLAUDE.md - and the manual step the runbook now prescribes cannot work.

**witness.** **kind:** scenario · **source:** `infra/deploy.sh:27`

infra/deploy.sh:27 reads that migrations run BEFORE the rollout and that the order is the whole point, and its header explicitly retires the old reasoning as backwards. Lines 176 to 184 register the migrate task definition against the NEW api_image and run infra/migrate.sh; only then does line 188 apply the rollout. That commit is b7a167e, Run migrations before the rollout not after, and git merge-base --is-ancestor b7a167e 57d55ac confirms it predates the diff base; infra is untouched by this diff. Three statements added here are therefore wrong: line 84, that migrations run after the rollout by default; line 105, that make deploy-env still runs prisma migrate deploy at the end; and line 107, that a push to main deploys dev rollout first and migration second. Worse, following the prescribed sequence at lines 100 to 103 is a no-op: make migrate-dev runs the migrate task definition currently in state, whose image is the digest from the PREVIOUS deploy, which contains no 20260828140000_spec_04_signature_providers directory, so prisma migrate deploy applies nothing. CLAUDE.md and the Makefile line 4 comment carry the same stale claim, so an implementer told to correct deployment.md would be contradicted by CLAUDE.md, which is why this halts for a person rather than routing to code.

**suggestedFix.** Correct the CLAUDE.md Watch out for bullet and the Makefile comment first, then collapse Backward Compatibility 3 and docs/deployment.md lines 84 to 115 and 303 to 314 to the truth: deploy.sh already migrates first, which is the order this release wants, so no manual step exists. The migration.sql header comment needs the same correction.

## E18 — opus/`medium`, 30 файлов, 3 шарда

`ds-lab-e18/.workflow/runs/lab-E18/review.verdict.json` · status `blocked` · находок на шард: 8, 8, 15 · 828s · $21.31 · старт 2026-08-30T17:48:25.920Z

**Блокеров: 6.**

### E18 · F1 — `apps/api/src/organizations/signing-settings.controller.ts:26` — `SigningSettingsController`

**target:** `code`

**rule.** specs/documents/04-signature-providers.md:1088 — Error Messages: "| Permission denied | You do not have access to this resource |"; :984 — "`403` `{\"message\":\"You do not have access to this resource\"}` for `user`/`viewer`"; :1090 — "All of these live in `packages/validation` so web and API cannot disagree."

**claim.** The signing-settings routes answer 403 with spec 01's template message instead of the message spec 04 names, and the string spec 04 requires exists nowhere in the repository. TC-04-INT-16 pins the wrong string, so the run's own suite certifies the defect rather than catching it.

**witness.** **kind:** scenario · **source:** `specs/documents/04-signature-providers.md:984`

A manager of Acme, signed in, sends PUT /api/organizations/{their own orgId}/settings/signing with {"provider":"signwell","confirmed":true}. CapabilityGuard refuses ManageSigningSettings and returns {"error":"forbidden","message":"You do not have permission to manage templates"} — capability.guard.ts:64 returns TEMPLATE_MESSAGES.generic.forbidden, defined at packages/validation/src/documents.ts:125. The spec requires "You do not have access to this resource"; `grep -rn "You do not have access to this resource" --include=*.ts --include=*.tsx .` returns zero hits. A manager trying to change the signature provider is told they may not manage templates.

**suggestedFix.** Add the message to SIGNING_PROVIDER_MESSAGES in packages/validation/src/signing-providers.ts and have the signing-settings routes answer it (a route-level message, not a change to the shared guard, so spec 01's template 403 is untouched). Then correct apps/api/test/signing-settings.spec.ts:126 to assert the spec's string.

### E18 · F2 — `apps/api/src/documents/envelopes.service.ts:1080` — `send`

**target:** `code`

**rule.** specs/documents/04-signature-providers.md:1077 — Error Messages: "| Signer incomplete at send | Every signer needs a name and an email address |"; :1057 — Validation rule 5: "Every `EnvelopeSigner` must have a non-empty name and email before a remote session is created"

**claim.** The send path emits spec 02's ENVELOPE_MESSAGES.send.incompleteSigners ('Both signers need a name and an email address') on every provider, so spec 04's message is never returned. SIGNING_PROVIDER_MESSAGES.send.signerIncomplete is defined and has no reader in apps/api or apps/web; its only test asserts the constant equals its own literal, which passes whether or not any code path emits it.

**witness.** **kind:** scenario · **source:** `specs/documents/04-signature-providers.md:1077`

An organization whose signatureProviderKey is 'signwell'; a draft envelope with two signers, the second having an empty email. POST /api/organizations/{orgId}/envelopes/{id}/send returns 400 {"error":"incomplete_signers","message":"Both signers need a name and an email address"} from envelopes.service.ts:1083. Validation rule 5 and the Error Messages table require "Every signer needs a name and an email address" for the remote-session path. packages/validation/src/signing-providers.ts:97 holds the correct string; grep shows its only reference is the assertion at signing-providers.test.ts:157.

**suggestedFix.** Emit SIGNING_PROVIDER_MESSAGES.send.signerIncomplete when the provider pinned for this send declares a remote session, keeping spec 02's message for the internal path so requirement 9 (no observable change to an internal envelope) still holds. If that split is judged wrong, the Error Messages table is the thing to change — say so and contest.

### E18 · F3 — `e2e/tests/signature-providers.spec.ts:164` — `TC-04-E2E-01`

**target:** `code`

**rule.** specs/documents/04-signature-providers.md:1520 — TC-04-E2E-01, Expected Result 4: "The confirm button is disabled until the checkbox is ticked, and enabled after."; CLAUDE.md, Testing: "Selectors are `data-testid` only, and the ids are named in the specs."

**claim.** `getByTestId('signing-change-confirm').check()` targets a <label>, not a checkbox. The DS Checkbox spreads ...rest — and therefore data-testid — onto its <label> wrapper, and Playwright's check() throws on any element that is not an input[type=checkbox|radio] or role=checkbox. TC-04-E2E-01 fails deterministically at this line and never reaches the toast or the post-reload assertions, so the case that proves the deliberate-confirmation gate proves nothing.

**witness.** **kind:** test · **source:** `specs/documents/04-signature-providers.md:1520`

TC-04-E2E-01 fails with `locator.check: Error: Not a checkbox or radio button` at e2e/tests/signature-providers.spec.ts:164. ChangeProviderModal.tsx:71-76 renders <Checkbox data-testid="signing-change-confirm" />; 1_DS for dev/components/forms/Checkbox.jsx:16 spreads {...rest} onto the <label>, and the real input at :27-28 is width:1, height:1, opacity:0, pointerEvents:'none'.

**suggestedFix.** Use the pattern every other E2E file in the repository uses for this DS control — `await page.getByTestId('signing-change-confirm').click()` (see e2e/tests/envelopes-signing.spec.ts:189) — keeping toBeDisabled()/toBeEnabled() on signing-change-submit, which is a real <button>. Check line 154's radio the same way: it resolves through getByRole('radio') to the real input, but that input is also pointer-events:none, so its actionability should be confirmed rather than assumed.

### E18 · F4 — `apps/api/src/documents/envelopes.service.ts:341` — `list`

**target:** `code`

**rule.** specs/documents/04-signature-providers.md:401 — requirement 24a: "**Lazily, on read.** Any read of a non-terminal envelope whose `providerKey` is remote and whose `providerSyncedAt` is older than `PROVIDER_SYNC_STALE_SECONDS` (default 120) triggers a synchronous re-fetch before the response is composed."

**claim.** convergeIfStale has exactly two callers — envelopes.service.ts:398 (get) and signing.service.ts:127 (view). The envelope list, which is the screen a sender actually watches, composes its response straight from findMany and never converges, so remote non-terminal envelopes are served from rows up to an hour stale rather than the 120 seconds requirement 24a bounds.

**witness.** **kind:** scenario · **source:** `specs/documents/04-signature-providers.md:401`

An organization on 'signwell' with a sent envelope; signer 1 signs; no webhook is delivered — the Infrastructure section records that no deployed environment has a public address SignWell can reach, so this is the normal case and not an edge one. providerSyncedAt is 30 minutes old. GET /api/organizations/{orgId}/envelopes still reports status 'sent' and signers[].status 'notified'. The same envelope read through GET .../envelopes/{id} converges and reports 'partially_signed', so the two screens disagree about the same row in the same second.

**suggestedFix.** Converge the remote, non-terminal, stale rows of the page being returned before composing the list response, bounded to the page slice so TC-04-INT-12's read budget still holds. If a per-page fan-out is judged too expensive against requirement 19's rate limits, that is a real argument — but then requirement 24a is the thing to change, deliberately, rather than leaving 'any read' unmet in silence.

### E18 · F5 — `apps/api/src/signing/signing.service.ts:397` — `sign`

**target:** `spec`

**rule.** specs/documents/04-signature-providers.md:685 — invariant 11: "A provider call never runs inside a database transaction. Every adapter method is called before or after one, never within"; :1266 — Acceptance Criterion 12: "No provider call is made while a database transaction is open."; against :228 — requirement 10: "A test that has to be edited to accommodate the new port is a signal that behaviour moved, and is a defect of this spec's implementation, not of the test."

**claim.** LocallySigned.applySignature — a port method — is awaited inside the prisma.$transaction opened at line 317, after a SELECT ... FOR UPDATE. Invariant 11 and acceptance criterion 12 both say 'never' with no carve-out, so the shipped code violates them. The code's own comment argues the invariant's stated reason (a five-attempt backoff holding a row lock) cannot apply to a provider whose surface is 'ours' and never touches the network, and that moving the call out would reorder error precedence against spec 02's suite — which requirement 10 forbids. Both rules cannot be satisfied at once, which is why this is addressed to the spec rather than to the implementer: sending it back to code would ask for a change requirement 10 prohibits.

**witness.** **kind:** rule · **source:** `specs/documents/04-signature-providers.md:685`

Invariant 11 admits no exception and acceptance criterion 12 restates it as a checkable statement; apps/api/src/signing/signing.service.ts:391-396 asserts an exception in a comment and lines 317 and 397 take it. TC-04-INT-22 exercises invariant 11 only for createSession, so the suite does not detect the case.

**suggestedFix.** Amend invariant 11 and acceptance criterion 12 to except LocallySigned.applySignature under signingSurface: 'ours', with the reason already written in the code comment — a provider that never reaches the network cannot hold a row lock on a backoff. Leaving it as written means every future reviewer checking criterion 12 finds a violation and has to re-derive that it is intended.

### E18 · F6 — `apps/api/src/signature/signwell/signwell-http-client.ts:259` — `HttpSignWellClient.call`

**target:** `code`

**rule.** specs/documents/04-signature-providers.md:349 — requirement 19: "The client serializes per organization, retries `429` with exponential backoff and jitter, five attempts, then surfaces `provider_unavailable`."

**claim.** Serialization is per organization only for createDocument, the one call site that passes organizationId. Every read route — getDocument, listDocuments, deleteDocument, completedPdf, ping, hooks — omits it and falls into a single global '_shared' lane, so the whole read surface is serialized across all organizations. That includes the getDocument behind signerAccess, which requirement 6 puts on the request path of every /sign/{token} open.

**witness.** **kind:** scenario · **source:** `apps/api/src/signature/signwell/signwell-http-client.ts:259`

Two sent SignWell envelopes in different organizations A and B, with a transport that takes 2s per call. Signer A and signer B open /sign/{token} simultaneously. Requirement 19's per-organization serialization predicts both pages in ~2s; the shipped code returns the second in ~4s because both getDocument calls queue in '_shared' (line 259: `this.serialize(request.organizationId ?? '_shared', ...)`, with organizationId passed only at line 162). With N concurrent signers across N organizations the Nth waits N x 2s, and one hung provider read converts the per-call 10s bound the Blast Radius row promises into an unbounded queue on a signer-facing route.

**suggestedFix.** Thread the organization id through SignerAccessRequest, CompletedDocumentRequest, CancelRequest and fetchState into call(), so every route family serializes per organization. Keep '_shared' for the settings connection check, which is the only case the comment at :256-258 actually describes.

## E20 — opus/`medium`, 20 файлов, 4 шарда

`ds-lab-e20/.workflow/runs/lab-E20/review.verdict.json` · status `blocked` · находок на шард: 9, 11, 5, 12 · 809s · $22.94 · старт 2026-08-30T18:14:42.406Z

**Блокеров: 11.**

### E20 · F1 — `apps/api/src/signing/signing.service.ts:397` — `SigningService.sign`

**target:** `spec`

**rule.** specs/documents/04-signature-providers.md invariant 11: "A provider call never runs inside a database transaction. Every adapter method is called before or after one, never within"; and Acceptance Criterion 12: "No provider call is made while a database transaction is open."

**claim.** The port method LocallySigned.applySignature is awaited inside this.prisma.$transaction, between the SELECT ... FOR UPDATE row lock and the commit. Invariant 11 and acceptance criterion 12 are unconditional and name no exception for signingSurface: 'ours'; the only carve-out is written in a code comment that argues the invariant's stated reason does not apply. Raised independently by two shards.

**witness.** **kind:** rule · **source:** `specs/documents/04-signature-providers.md:685`

signing.service.ts:317 opens the transaction; :321 takes SELECT id FROM "SigningToken" ... FOR UPDATE; :396 awaits locally.applySignature while that lock is held. The rule is unconditional at spec:684-686, restated as an observable acceptance criterion at spec:1266, and again as an area-wide shared rule at specs/documents/README.md:58. .claude/skills/code-review/SKILL.md:156-162: "A comment in the code under review is not a source... Code that argues its own exception to a rule is the finding, not the answer to it. When a rule is unconditional as written and the code gives a reason it should not apply, that is a contradiction between the code and the spec. Report it, with target: spec, and let a human rule on it."

**suggestedFix.** A human must rule. Reviewer's note for that ruling: the code offers two reasons, and only the first survives checking. (a) 'a provider whose surface is ours never touches the network' — true; InternalSigningProvider.applySignature is pure computation. (b) 'moving it out would reorder error precedence against spec 02's suite, which requirement 10 forbids' — this does not appear to hold. The user-facing signature validation that spec 02's suite pins (signature_too_large, invalid_typed_signature at signing.service.ts:933-936, asserted at test/signing.spec.ts:220-238) already runs before the transaction opens; requireDrawnImage/requireTypedName inside applySignature can only fire on input that validation has already accepted. So moving the call out looks achievable without editing spec 02's suite, which means this is probably resolvable in code rather than being a genuine two-rule contradiction. Routed to spec anyway because SKILL.md prescribes that route for this shape and the decision is not mine to make.

### E20 · F2 — `apps/api/src/documents/envelopes.service.ts:856` — `EnvelopesService.send`

**target:** `code`

**rule.** .claude/skills/code-review/SKILL.md predicate sweep: "the guard is read from a copy loaded before the transaction that is supposed to protect it, so the value it tests is already stale when it is tested"

**claim.** The send now freezes the document from a read taken before the row lock. prepareSend(envelope) at line 829 uses the copy loaded at line 815; the in-transaction re-read at line 856 selects { status: true } only, so the lock protects the status check and nothing else. Before this change the freeze read `fresh` inside the transaction after FOR UPDATE, so title, fieldValues and signer name/email all came from the locked row. Requirement 5 forces createSession between the read and the transaction, which widens that window to a full provider round trip.

**witness.** **kind:** scenario · **source:** `.claude/skills/code-review/SKILL.md:124`

Envelope in draft, fieldValues {salary:'1000'}, signer 2 = old@vendor.test. Admin A POSTs /send: load() reads the row, prepareSend freezes HTML containing 1000 and builds SignWell recipients with old@vendor.test, createSession takes ~2s. During those 2s Admin B PUTs the envelope changing salary to 9000 and signer 2's email to new@vendor.test — permitted, status is still draft and update() takes no lock. A's transaction then takes FOR UPDATE, sees status=draft, and commits renderedHtml+documentHash frozen at 1000 while Envelope.fieldValues says 9000, and the remote document was created for old@vendor.test while EnvelopeSigner.email now reads new@vendor.test. Verified against the base: 57d55ac:apps/api/src/documents/envelopes.service.ts:758-800 read `fresh` with its signers inside the transaction and validated and rendered from it. TC-04-INT-22 does not cover this — it only asserts a reader is not blocked during the call.

**suggestedFix.** Carry envelope.updatedAt into the transaction and add it to the guard, or re-read the envelope with its signers and fieldValues inside the transaction and refuse with 409 when anything the freeze depended on has moved.

### E20 · F3 — `apps/api/src/documents/envelope-completion.ts:204` — `EnvelopeCompletionService.store`

**target:** `code`

**rule.** specs/documents/04-signature-providers.md State Machine invariant 9: "Convergence never moves an envelope out of a terminal state."

**claim.** The conditional write that flips a remote envelope to completed constrains only signedPdfKey: null. The early return at line 125 covers only status === completed, and the updateMany where at line 204 has no status predicate. provider-complete is an asynchronous job whose body performs a network download before the write, so the terminal check the reconciler made when it enqueued the job is stale by the time the write lands.

**witness.** **kind:** scenario · **source:** `specs/documents/04-signature-providers.md:680`

A SignWell envelope is partially_signed. The last signer signs, document_completed arrives, the reconciler enqueues provider-complete (provider-reconciler.service.ts:413), and provider.completedDocument spends seconds downloading the PDF. During that window an admin voids the envelope: voidEnvelope commits status=voided, invalidates the tokens and records the voided event. The job then resumes, store(..., {markCompleted:true}) matches because signedPdfKey is still null, and writes status=completed, completedAt, pdfStatus=ready and a completed event onto the voided envelope. Observable: a voided envelope reappears as completed, with a voided event followed by a completed event in the hash chain. Edge case 25 and requirement 40 say the void is supposed to win this race.

**suggestedFix.** Add the state to the guard: where: { id, signedPdfKey: null, status: { in: [sent, partially_signed] } }, and distinguish 'a concurrent writer won' from 'the envelope is no longer completable' in the return.

### E20 · F4 — `apps/api/src/webhooks/webhook-rate-limit.guard.ts:62` — `WebhookRateLimitGuard.canActivate`

**target:** `code`

**rule.** specs/documents/04-signature-providers.md API Contracts, POST /api/webhooks/signwell: "Rate limited to 600 requests per minute per source, above which it answers 429"; requirement 25

**claim.** The limiter's bucket key is clientIp(request), which returns the first entry of the X-Forwarded-For chain. An AWS ALB appends the connecting client's address to an X-Forwarded-For header the client already supplied, so the first entry on a public route is caller-controlled. The rate limit on the product's second unauthenticated route can therefore be bypassed by varying one request header. clientIp itself is pre-existing and unchanged (it is fine for its spec 02 use, recording an audit IP); what is new in this diff is electing it as a trust boundary.

**witness.** **kind:** scenario · **source:** `specs/documents/04-signature-providers.md:1005`

Attacker sends 10,000 POSTs/min to /api/webhooks/signwell, each with a distinct X-Forwarded-For: 10.0.0.<n>. The ALB forwards '10.0.0.<n>, <real client>'; clientIp() (envelopes.service.ts:201-207) returns 10.0.0.<n>; WebhookRateLimiter.allow() opens a fresh window per value and never returns false. Expected per the API contract: 429 after 600 requests from that source. Observed: every request is admitted to hash verification. The comment at envelopes.service.ts:196-199 asserts the load balancer prepends the real client; ALB appends it, so the first entry is the untrusted end of the chain.

**suggestedFix.** Key the webhook limiter on the connection peer (req.socket.remoteAddress, or req.ip with 'trust proxy' set to the exact number of trusted hops) rather than on the first, client-writable X-Forwarded-For entry.

### E20 · F5 — `apps/api/src/signature/signwell/signwell-http-client.ts:328` — `HttpSignWellClient.attempt`

**target:** `code`

**rule.** specs/documents/04-signature-providers.md requirement 26: "POST /documents is not idempotent on SignWell's side and our retry must not create two documents for one envelope. Before retrying a create that failed without a response, the client looks for a document already carrying this envelope's id in metadata."

**claim.** The generic five-attempt retry loop retries POST /documents blindly. createDocument goes through the same attempt() as every read; a transport timeout or a 5xx is retried with no lookup for a document this envelope may already have created. The adapter's orphan scan (createOrAdopt, signwell-signing-provider.ts:190) runs only after all five attempts have failed, so it never sees the case the requirement is about. The catch block's own comment names the exact condition — "Indistinguishable from 'the request never arrived', which is exactly the case requirement 26's orphan recovery exists for" — and then continues the loop.

**witness.** **kind:** scenario · **source:** `specs/documents/04-signature-providers.md:414`

Admin sends envelope env-1. POST /documents reaches SignWell, the document is created and the counterparties are live, but the response is lost and the 10s abort fires. attempt() catches at line 327, sleeps, and POSTs the identical body again. SignWell creates a second document for env-1. The second id is returned and pinned as providerRef; the first is an orphan nobody will delete — two live contracts with the same counterparties, each with a working embedded_signing_url, and the orphan answers every webhook with unknown_ref. The integration suite cannot see this: every case overrides SignWellHttpClient, which is the layer above the retry loop.

**suggestedFix.** Give call() a per-family retry policy: create-document either does not retry at all, or invokes the orphan scan between attempts.

### E20 · F6 — `apps/api/src/signature/signwell/signwell-http-client.ts:259` — `HttpSignWellClient.call`

**target:** `code`

**rule.** specs/documents/04-signature-providers.md requirement 19: "The client serializes per organization, retries 429 with exponential backoff and jitter, five attempts, then surfaces provider_unavailable."

**claim.** The serialization key is request.organizationId ?? '_shared', and exactly one call site passes organizationId (createDocument, line 162). Every other route — getDocument, listDocuments, deleteDocument, completedPdf, ping, hooks — falls to '_shared', so all reads for all organizations are serialized into one global FIFO chain. That is not per-organization serialization; it is a single lane in front of the hot path, and the code comment describing '_shared' as being for the settings screen's connection check understates what actually lands there.

**witness.** **kind:** scenario · **source:** `specs/documents/04-signature-providers.md:349`

The reconciler sweep issues listDocuments for org A while the provider is hung. That call burns five attempts at a 10s timeout plus backoff (~52s) in the '_shared' lane. In the same window a counterparty of org B opens /sign/{token}; signerAccess -> getDocument is queued behind it and does not start for ~52s, so the signing page hangs past any request timeout even though org B's provider calls were healthy. One hung tenant's reads stall every other tenant's — the coupling the per-organization key exists to prevent, and the blast-radius row at spec:1161 ('A hung provider could exhaust the request pool') is the risk it was meant to bound.

**suggestedFix.** Thread organizationId through SignerAccessRequest / CompletedDocumentRequest / fetchState into call(), or key the lane on providerRef for document-scoped routes.

### E20 · F7 — `scripts/review-coverage.mjs:86` — `the openedIn loop`

**target:** `code`

**rule.** .claude/skills/code-review/SKILL.md predicate sweep: "write two things — the rule it is there to enforce, and the exact question the code asks. Blocks when those are not the same question."

**claim.** A file is credited as opened by a review when any review tool call's input string contains its path — not when its content was read. The predicate the coverage ledger needs is 'the reviewer read this file'; the question the code asks is 'did some command line mention this substring'. The error direction is upward, not the 'errs downward' the file header claims.

**witness.** **kind:** scenario · **source:** `.claude/skills/code-review/SKILL.md:110`

review-coverage.mjs:83 builds text from [i.file_path, i.command, i.path, i.pattern, i.glob] and line 86 tests text.includes(path). .claude/agents/code-reviewer.md:51 instructs the reviewer to run `node scripts/review-coverage.mjs`; that Bash input string contains 'scripts/review-coverage.mjs', which is a path in this diff, so the ledger records the coverage tool itself as opened — by the act of asking what has not been opened. The same happens for any `git diff -- <path>` or `git log -- <path>` that names a file without reading it, and for a grep whose pattern happens to contain a path substring.

**suggestedFix.** Credit only Read (file_path) inputs, and Grep with an explicit single-file path; do not scan free-form command text.

### E20 · F8 — `scripts/review-coverage.mjs:49` — `sizes construction`

**target:** `code`

**rule.** .claude/skills/code-review/SKILL.md boundary sweep: "Enumerate every pair that must agree across a file boundary: ... a constant and its consumer ... Blocks when they do not."

**claim.** The denominator is git diff --numstat <base>...HEAD with no pathspec, while scripts/review-slice.mjs:71 uses SCOPE = ['--', '.', ':(exclude).workflow'] and a two-dot range. The two tools that must agree about 'the diff' do not: this run's slice is 75 files and review-coverage.mjs computes 117. Commit 38cabfa changed scripts/ship.mjs for exactly this reason ('Excluding .workflow takes this branch's review from 117 files to 75') and did not carry the change into this script.

**witness.** **kind:** scenario · **source:** `.claude/skills/code-review/SKILL.md:141`

On this run review-slice.mjs yields a 75-file slice; review-coverage.mjs enumerates 117 and lists roughly 42 .workflow/runs/** entries under 'Never opened by any review — start here', topped by a digest.json of several thousand changed lines. A reviewer following code-reviewer.md:51 ('work the never-opened list, largest first') spends its context on the pipeline's own journal, and can never satisfy code-reviewer.md's 'read + unreached = the slice' because the two numbers are computed from different sets. Secondary divergence: three-dot ...HEAD here versus two-dot ..HEAD in the slice.

**suggestedFix.** Import the same SCOPE (':(exclude).workflow') and the same two-dot range as scripts/review-slice.mjs.

### E20 · F9 — `docs/deployment.md:216` — `Releasing to prod`

**target:** `code`

**rule.** specs/documents/04-signature-providers.md Backward Compatibility 3: "it is a release-procedure concern, not a schema one — either the runbook covers it, or this migration runs before the rollout... The choice belongs in docs/deployment.md"; CLAUDE.md: "a `v*` tag on `main` does the same and deploys `prod`."

**claim.** The migrate-first procedure this release needs is written only for the dev/merge path. The new text ends at 'a release in this class has its migration applied before the merge'. The 'Releasing to prod' section is untouched and still describes npm run release pushing a v* tag that starts a fully automated rollout-then-migrate, with no step at which make migrate-prod is run first. The spec delegates this decision to this document and the document answers for only one of the two environments.

**witness.** **kind:** scenario · **source:** `specs/documents/04-signature-providers.md:1190`

An operator follows 'Releasing to prod' verbatim: npm run release tags v1.4.0, the pipeline rolls prod out and then migrates. Between the new tasks going healthy and prisma migrate deploy finishing, every Envelope read names providerTestMode/providerStatus/providerSyncedAt/providerError and every Organization read names signatureProviderKey, none of which exist yet; Postgres answers 42703 and the documents list and detail screens return 500 for the whole window. This is the exact failure the spec's Backward Compatibility 3 and the migration's own header comment describe, and the runbook they point at does not tell that operator to run make migrate-prod first.

**suggestedFix.** State the prod ordering in 'Releasing to prod' — make migrate-prod before the tag is pushed — or make the pipeline migrate first for this class of release.

### E20 · F10 — `apps/api/test/signing-settings.spec.ts:126` — `TC-04-INT-16`

**target:** `code`

**rule.** specs/documents/04-signature-providers.md API Contracts: "403 {\"message\":\"You do not have access to this resource\"} for user/viewer"; Error Messages table: "| Permission denied | You do not have access to this resource |"; "All of these live in packages/validation so web and API cannot disagree."

**claim.** The 403 body for a manager/user/viewer on the signing-settings routes is asserted to be TEMPLATE_MESSAGES.generic.forbidden = "You do not have permission to manage templates", which is spec 01's templates message. The string spec 04 requires occurs nowhere in the repository outside the spec file, so this Error Messages row is implemented nowhere and the test pins the wrong string — which is why no sweep of the diff catches it. My own sweep 5 initially missed this too and reported 18 of 18 messages present.

**witness.** **kind:** test · **source:** `specs/documents/04-signature-providers.md:984`

TC-04-INT-16 expected result 1 (spec:1472) is "Admin 200; manager, user, viewer 403 with the spec message." The case asserts refused.body.message equals "You do not have permission to manage templates" — what CapabilityGuard emits. A manager calling PUT /api/organizations/{orgId}/settings/signing receives that string where the documented contract at spec:984 promises "You do not have access to this resource". Grep for the promised string across the tree returns only specs/documents/04-signature-providers.md:984 and :1088.

**suggestedFix.** Add the permission-denied sentence to packages/validation, answer 403 with it on the signing-settings routes, and assert that constant in TC-04-INT-16 — or, if reusing spec 01's shared guard message is deliberate, amend spec 04's API Contracts and Error Messages table instead. Do not leave the two disagreeing.

### E20 · F11 — `apps/api/test/signwell-completion.spec.ts:170` — `TC-04-INT-09`

**target:** `code`

**rule.** .claude/skills/code-review/SKILL.md test sweep: "A test nothing can break is a finding: an assertion about a value nothing produces, a selector nothing renders..."

**claim.** expect(detail.body.certificateUrl).toBeUndefined() is the only assertion carrying requirement 28 in this case, and certificateUrl is produced by no code path in the repository. The assertion is true for an internal envelope too, so it cannot fail and requirement 28 ('For a SignWell envelope our Certificate of Completion is not generated') is unproven at integration.

**witness.** **kind:** test · **source:** `.claude/skills/code-review/SKILL.md:102`

Grep for certificateUrl across apps/, packages/ and e2e/ returns exactly one hit: this assertion. Replace the SignWell envelope in TC-04-INT-09 with an internal one and the assertion still passes, because no envelope-detail response has ever carried that field. The value that actually answers requirement 28 is already computed and returned: provider.certificateIssued at envelopes.service.ts:1711.

**suggestedFix.** Assert detail.body.provider.certificateIssued === false, and true on an internal envelope for contrast.

---

# Sonnet 5, пустой промпт

## E1 — sonnet/`medium`, 20 файлов, 4 шарда

`ds-lab-e1/.workflow/runs/lab-E1/review.verdict.json` · status `blocked` · находок на шард: 1, 3, 2, 3 · 559s · $8.78 · старт 2026-08-30T12:41:20.617Z

**Блокеров: 6.**

### E1 · F1 — `apps/api/src/signature/signwell/signwell-http-client.ts:323` — `HttpSignWellClient.attempt`

**target:** `code`

**rule.** specs/documents/04-signature-providers.md requirement 26 — "Before retrying a create that failed without a response, the client looks for a document already carrying this envelope's id in `metadata`." Reinforced by requirement 19 — "A retried `POST /documents` is **not** safe to repeat blindly — see requirement 26."

**claim.** The generic retry loop re-POSTs /documents blindly. The orphan lookup only runs after all five attempts are exhausted and the whole call throws, so a retry that succeeds after a lost response creates a second live contract that nothing ever finds.

**witness.** **kind:** scenario · **source:** `specs/documents/04-signature-providers.md:414-416, 350-351`

Envelope E is sent under SignWell. Attempt 1 of POST /documents reaches SignWell, which creates document A, but the response is lost to a socket timeout. `attempt()` catches at line 323, calls recordFailure(), and `continue`s the loop — its own comment at line 324 says the case is "indistinguishable from 'the request never arrived', which is exactly the case requirement 26's orphan recovery exists for", and then retries anyway without looking. Attempt 2 POSTs the identical body; SignWell creates a second document B and returns 201. `createDocument()` returns B normally, so `createOrAdopt`'s catch block at signwell-signing-provider.ts:190 — the only caller of `findOrphan` on this path — never runs. The envelope is pinned to B. Document A stays open on the SignWell account with the real counterparties on it and a live `embedded_signing_url` per recipient, holds no `providerRef` anywhere in our database, and answers every webhook it fires with `unknown_ref`. That is precisely the duplicated contract requirement 26 exists to prevent, and it is worse than the failed send the requirement is willing to accept.

**suggestedFix.** Do not let `attempt()` retry the `create-document` family internally. Either give that family maxAttempts=1 and let `createOrAdopt` drive retries with a `findOrphan` check before each one, or call `findOrphan(envelopeId)` before every retried create attempt, which is what requirement 26's "before retrying" literally asks for.

### E1 · F2 — `apps/api/src/documents/provider-reconciler.service.ts:309` — `ProviderReconcilerService.applyState`

**target:** `code`

**rule.** .claude/skills/spec/references/checklist.md:20 — "Every path reachable twice is idempotent, with the mechanism named and a concurrency test." And specs/documents/04-signature-providers.md requirement 21 — "This makes replay, reordering, and duplicate delivery harmless **by construction** rather than by careful handling."

**claim.** Convergence decides which transitions to write from a snapshot loaded outside the transaction and never re-read or locked inside it, so two overlapping converge() calls for one envelope both write the same `signed` event and both open the next turn.

**witness.** **kind:** scenario · **source:** `.claude/skills/spec/references/checklist.md:20; specs/documents/04-signature-providers.md:381-384`

Signer 1 signs a SignWell envelope and SignWell POSTs `document_signed`, enqueuing a reconcile job. Before that job's transaction commits, the sender opens the envelope detail page; `EnvelopesService.get()` calls `reconciler.convergeIfStale()` directly at envelopes.service.ts:398, bypassing the queue entirely, and `providerSyncedAt` is stale. Both invocations run `load()` at line 201 outside any transaction and both see `signer.status === notified`. Inside the transaction the `signed` branch at line 309 tests only that stale `signer.status`, with no row lock and no in-transaction guard — unlike the `viewed` branch immediately above it, which does defend itself with `tx.envelopeEvent.count(...)` at line 290. Under READ COMMITTED neither transaction blocks the other, so both execute `tx.envelopeSigner.update({status: signed})` and both `events.record(tx, {type: 'signed'})`. The result is two `signed` rows in the hash chain for one physical signature, and two calls to `openNextTurn`, which can mint two live signing tokens and send signer 2 two invitations for the same turn. TC-04-INT-13 does not cover this: it races two `document_completed` deliveries, which are protected by the separate `updateMany` write-once guard in envelope-completion.ts, not by anything on this path.

**suggestedFix.** Lock the envelope row at the start of the converge transaction (SELECT ... FOR UPDATE, the pattern EnvelopesService.send/voidEnvelope and SigningService.sign/decline already use) and re-read signer state under that lock before deciding transitions.

### E1 · F3 — `apps/api/src/signing/signing.service.ts:747` — `SigningService.embeddedSurface`

**target:** `code`

**rule.** specs/documents/04-signature-providers.md Edge Cases, row 18 — "A signer opens the link after completion | Spec 02 requirement 25 applies unchanged — read-only view plus download. No provider call is made."

**claim.** The provider-registration check runs before the terminal-state guard, so a completed SignWell envelope answers 503 instead of the read-only view once the adapter is unconfigured.

**witness.** **kind:** scenario · **source:** `specs/documents/04-signature-providers.md:575`

A SignWell envelope completes; its PDF is already downloaded and stored in S3 with `signedPdfKey` set, so nothing about serving it needs the provider. Later `SIGNWELL_API_KEY` is removed or rotated out — the situation edge case 16 explicitly contemplates — and `providers.find('signwell')` returns null because the registry reads configuration at call time. A signer then opens their still-valid /sign/{token} link to re-download the executed contract. `view()` calls `embeddedSurface()` unconditionally; at line 745 the lookup returns null, and line 747-752 throws `providerUnavailable()` (503) because the key is not 'internal'. The `state !== 'ready_to_sign'` guard that would have returned the read-only surface sits three lines further down at 759 and is never reached. The signer is told the signing service is unavailable for a document that was finished weeks ago and whose bytes are in our own bucket.

**suggestedFix.** Move the `state !== 'ready_to_sign'` check above the provider-registration check, so only a live signing turn requires a configured adapter.

### E1 · F4 — `apps/api/src/organizations/signing-settings.controller.ts:26` — `SigningSettingsController`

**target:** `code`

**rule.** specs/documents/04-signature-providers.md, API Contracts — "`403` `{\"message\":\"You do not have access to this resource\"}` for `user`/`viewer`", and the Error Messages table row "Permission denied | You do not have access to this resource". Also CLAUDE.md — "Rules and message text live in `packages/validation` ... Never write a user-facing validation message inline."

**claim.** The signing-settings endpoints answer 403 with the documents-area message "You do not have permission to manage templates". The message the spec names for this endpoint was never added to packages/validation and exists nowhere in the codebase.

**witness.** **kind:** rule · **source:** `specs/documents/04-signature-providers.md:983-984, 1088; CLAUDE.md:60-63`

The controller mounts the shared `CapabilityGuard`, whose `forbidden()` at apps/api/src/auth/capability.guard.ts:61-64 always throws `TEMPLATE_MESSAGES.generic.forbidden`, defined at packages/validation/src/documents.ts:125 as 'You do not have permission to manage templates'. A `user` or `viewer` calling GET /api/organizations/{orgId}/settings/signing therefore receives a message about templates on a signing screen. Grepping packages/validation and apps/api for the spec's literal string 'You do not have access to this resource' returns nothing — it lives only in the spec. TC-04-INT-16 asserts the templates message at apps/api/test/signing-settings.spec.ts:126, so the test locks the deviation in rather than catching it.

**suggestedFix.** Add the permission-denied message to packages/validation (SIGNING_PROVIDER_MESSAGES) and have the signing-settings routes answer with it, then update TC-04-INT-16 to assert the spec's string. Note the blast radius: CapabilityGuard is shared, so changing its message globally would move other areas' 403 bodies — prefer a route-level message over editing the shared guard.

### E1 · F5 — `specs/documents/04-signature-providers.md:1136` — `Required data-testid Attributes / TC-04-E2E-05`

**target:** `spec`

**rule.** specs/documents/04-signature-providers.md, Required data-testid Attributes — "**Envelope detail:** `envelope-provider`, `envelope-test-badge`, `envelope-download-btn`, `envelope-certificate-link` (asserted absent under SignWell)" — contradicted by specs/documents/02-envelopes-and-signing.md requirement 28 — "The final PDF contains the signed document followed by a **Certificate of Completion** page".

**claim.** Spec 04 requires a `envelope-certificate-link` control that the product does not have and that spec 02's design precludes — the certificate is a page inside the signed PDF, not a separate linkable artefact — so TC-04-E2E-05's absence assertion can never fail.

**witness.** **kind:** rule · **source:** `specs/documents/04-signature-providers.md:1136, 1553; specs/documents/02-envelopes-and-signing.md:136`

Spec 02 requirement 28 makes the Certificate of Completion a page appended to the signed PDF, and certificate-of-completion.ts implements exactly that (a `.certificate` page-break section inside the assembled document). There is consequently no separate certificate artefact and no control that could link to one: grepping apps/web, apps/api, packages and specs/documents/02 for `envelope-certificate-link` returns only spec 04's two mentions and the E2E assertion at e2e/tests/signature-providers.spec.ts:327. That assertion, `toHaveCount(0)`, is therefore vacuously true for every provider including internal, and proves nothing about requirement 28. An implementer told to satisfy the required-testid list would have to invent a certificate-download control that spec 02 never specified, which is why this is not addressed to code: spec 04 is naming an id for a control that does not exist, the mirror of the case its own note at line 1140-1144 warns about.

**suggestedFix.** Drop `envelope-certificate-link` from spec 04's required-testid list and from TC-04-E2E-05's selectors, leaving requirement 28 proved server-side where it belongs. If a separate certificate control is genuinely wanted, it is spec 02's to define first. Shard 3 raised this addressed to `code`; I disagree with that target and have rerouted it, because no implementation can satisfy both documents.

### E1 · F6 — `CLAUDE.md:97` — `Watch out for / migrations`

**target:** `spec`

**rule.** CLAUDE.md — "Migrations should be **additive**. `make deploy-<env>` rolls the services out and *then* runs `prisma migrate deploy`, so the new code is serving before the schema changes — which is only safe because migrations are additive. This is a rule, not an observation about the current migrations." — contradicted by specs/documents/04-signature-providers.md, Backward Compatibility 3 — "**It is not safe in either deploy order, and an earlier draft claimed it was.**"

**claim.** CLAUDE.md states as a repository rule that additivity makes rollout-before-migration safe; this change ships a spec and a runbook that state the opposite and require the reverse order. Both cannot govern, and CLAUDE.md was not updated.

**witness.** **kind:** rule · **source:** `CLAUDE.md:97-99; specs/documents/04-signature-providers.md:1180-1193; docs/deployment.md`

CLAUDE.md:97-99 grounds the deploy-then-migrate order in additivity. Spec 04's Backward Compatibility 3 (lines 1180-1188) rebuts exactly that reasoning: Prisma's client enumerates columns rather than using SELECT *, so between rollout and migration every read of Envelope, EnvelopeSigner and Organization asks for columns that do not exist and fails with Postgres 42703, and the document list and detail screens answer 500 for the window. docs/deployment.md as changed here agrees and prescribes `make migrate-dev` before `make deploy-dev`, naming spec 04 as the first release in that class. The two documents now give opposite instructions for the same release, and the automated path takes the losing one: CLAUDE.md notes that `main` deploys itself, deploy.yml calls infra/deploy.sh, and infra/deploy.sh runs the service rollout and only then invokes infra/migrate.sh at line 183-184. Nothing in the pipeline enforces the runbook's 'migrate before the merge' step, so merging this to main produces the 500 window unless a human remembers. Routing this to code would send the implementer after an implementation that already matches its spec; the conflict is between two written rules and needs a person.

**suggestedFix.** Amend CLAUDE.md's migration bullet so it says what additivity actually buys — a safe rollback, not a safe rollout window — and points at docs/deployment.md for ordering. Then decide whether this release's migrate-first step is enforced by the pipeline or left to the runbook; today it is neither stated in CLAUDE.md nor enforced by deploy.sh.

## E2 — sonnet/`medium`, 10 файлов, 10 шардов

`ds-lab-e2/.workflow/runs/lab-E2/review.verdict.json` · status `blocked` · находок на шард: 1, 2, 2, 1, 0, 2, 2, 2, 1, 4 · 705s · $10.37 · старт 2026-08-30T12:53:49.270Z

**Блокеров: 4.**

### E2 · F1 — `apps/api/src/signing/signing.service.ts:397` — `sign`

**target:** `spec`

**rule.** specs/documents/04-signature-providers.md invariant 11: "A provider call never runs inside a database transaction. Every adapter method is called before or after one, never within"; Acceptance Criterion 12: "No provider call is made while a database transaction is open."; restated as a cross-spec shared rule in specs/documents/README.md:57 "No provider call runs inside a database transaction"

**claim.** The internal provider's `applySignature` — an adapter method on the `SigningProvider` port via `LocallySigned` — is awaited inside an open Prisma transaction, which invariant 11 and Acceptance Criterion 12 forbid without qualification. The implementation is deliberate and self-documented, so this is a contradiction between spec rules rather than an oversight: invariant 11 and AC 12 are unconditional, while requirements 9 and 10 require the in-house engine's behaviour to be preserved exactly and spec 02's suite to pass unedited. A human must decide which gives way.

**witness.** **kind:** rule · **source:** `specs/documents/04-signature-providers.md:684`

signing.service.ts:317 opens `this.prisma.$transaction(async (tx) => {`, and at :397, still inside that callback and before commit, calls `await locally.applySignature({...})`. The comment at signing-provider.ts:66-70 and signing.service.ts:391-395 states the departure openly: 'This is the one call that runs **inside** a transaction, and deliberately... moving it out would also reorder error precedence against spec 02's suite, which requirement 10 forbids.' The spec's text admits no such exception, and unlike requirement 10 — which enumerates its single permitted exception explicitly — invariant 11 enumerates none. TC-04-INT-22, the case that exists to pin this invariant, drives only the SignWell `createSession` path (signwell-send.spec.ts:568 stubs `signwell.onCreate`), so it passes while the internal path violates the rule; no test covers the violated case.

**suggestedFix.** Decide the spec question first. Either amend invariant 11 and Acceptance Criterion 12 to carve out `LocallySigned.applySignature` explicitly — mirroring how requirement 10 enumerates its one permitted exception, and stating the reason (a provider whose surface is ours performs no I/O, so the row-lock rationale cannot apply) — or keep the invariant absolute and require the call to move outside the transaction. Do not route this to the implementer as written: no implementation satisfies both the unconditional invariant and requirements 9/10 simultaneously.

### E2 · F2 — `apps/api/src/signature/signwell/signwell-http-client.ts:259` — `HttpSignWellClient.call`

**target:** `code`

**rule.** specs/documents/04-signature-providers.md requirement 19: "The client serializes per organization, retries 429 with exponential backoff and jitter, five attempts, then surfaces provider_unavailable."

**claim.** Only `createDocument` threads an organizationId into `call()`. Every other route — `getDocument`, `listDocuments`, `deleteDocument`, `completedPdf`, `ping`, `hooks` — takes no organizationId on the abstract signature, so all of them fall through `request.organizationId ?? '_shared'` into a single process-wide queue. Reads are therefore serialized globally across every organization, not per organization, and the hot path named in Blast Radius (`signerAccess` on every page open) is inside that one lane.

**witness.** **kind:** scenario · **source:** `specs/documents/04-signature-providers.md:349`

Organization A has a SignWell envelope whose `GET /documents/{id}` is retrying — one 5xx then success, costing several seconds of backoff, and up to five attempts at a 10s timeout in the worst case. At the same moment a signer for unrelated organization B opens `/sign/{token}`; `signerAccess` calls `getDocument`, which reaches `call('read', {...})` at signwell-http-client.ts:171 with no organizationId and so queues on key `_shared`. `serialize()` (line 264) chains it behind A's outstanding call, so B's signer sits on `sign-embedded-loading` until A's retry sequence finishes, despite having no relationship to A. The code's own comment at line 256-258 claims the shared lane carries only 'the settings screen's connection check', which is not true of the code beneath it.

**suggestedFix.** Add an organizationId parameter to the `SignWellHttpClient` abstract methods that act on one organization's document (`getDocument`, `listDocuments`, `deleteDocument`, `completedPdf`) and pass it through from the adapter's call sites, so the queue key is the real organization id. Leave `ping` and `hooks` on the shared lane, which is what the comment already describes.

### E2 · F3 — `apps/api/src/documents/provider-reconciler.service.ts:464` — `openNextTurn`

**target:** `code`

**rule.** .claude/skills/spec/references/checklist.md:20 "Every path reachable twice is idempotent, with the mechanism named and a concurrency test." and :25 "Concurrent access to the same row states its locking strategy."

**claim.** `openNextTurn` mints the next signer's token with a check-then-act — `tx.signingToken.count({ where: { envelopeSignerId, isInvalidated: false } })` at :464 followed by `tx.signingToken.create` at :473 — with no row lock and no unique constraint making the pair atomic. `converge()` is reachable concurrently for the same envelope from three unsynchronized entry points, so two of them can both read zero and both mint a live token.

**witness.** **kind:** scenario · **source:** `.claude/skills/spec/references/checklist.md:20`

A SignWell envelope is `sent` and signer 1 has just signed. A `document_signed` webhook job begins `converge()` (runJob -> :116). Concurrently the sender opens the envelope detail and `envelopes.service.ts` calls `convergeIfStale()` (:124), which invokes `converge()` directly on the request thread because `providerSyncedAt` is older than 120s — it does not pass through the webhook controller's per-document job-queue grouping, and `sweepStale` (:160) likewise calls `converge()` in a bare loop. Both calls do their `fetchState` outside the transaction, then each opens `this.prisma.$transaction` at :279 with no `SELECT ... FOR UPDATE` on the envelope or signer row. Under Postgres READ COMMITTED both count zero non-invalidated tokens for signer 2, both insert one, and `notifyNextTurn` (:417) fires twice. Signer 2 receives two invitation emails carrying two different working `/sign/{token}` links, so a path reachable twice is not a no-op. The same file's sibling path shows the established mechanism: signing.service.ts:321 takes `SELECT id FROM "SigningToken" ... FOR UPDATE` with the comment 'The row lock is what makes signing idempotent under concurrency'; the reconciler omits it.

**suggestedFix.** Serialize convergence per envelope — take a `SELECT ... FOR UPDATE` on the envelope row at the top of the transaction at :279, the way signing.service.ts:321 does — or add a partial unique index allowing at most one non-invalidated SigningToken per envelopeSignerId so the second insert loses instead of duplicating.

### E2 · F4 — `apps/api/src/auth/capability.guard.ts:64` — `forbidden`

**target:** `code`

**rule.** specs/documents/04-signature-providers.md, API Contracts / GET /api/organizations/{orgId}/settings/signing: "`403` `{\"message\":\"You do not have access to this resource\"}` for `user`/`viewer`"; Error Messages table line 1088: "Permission denied | You do not have access to this resource"

**claim.** The string the spec mandates for a 403 on both signing-settings endpoints exists nowhere in the codebase. `CapabilityGuard.forbidden()` returns `TEMPLATE_MESSAGES.generic.forbidden` — 'You do not have permission to manage templates' — for every capability-gated route, so the new signing-settings routes answer with a message about templates. TC-04-INT-16 asserts that wrong constant, which locks the violation in rather than catching it.

**witness.** **kind:** scenario · **source:** `specs/documents/04-signature-providers.md:984`

A manager with a valid session issues `PUT /api/organizations/{orgId}/settings/signing`. CapabilityGuard finds `ManageSigningSettings` absent for the normalized role and throws from capability.guard.ts:61-66, so the response body is `{"error":"forbidden","message":"You do not have permission to manage templates"}` instead of the specified `{"message":"You do not have access to this resource"}` — a message about templates on a signing-settings screen. Grepping the whole tree for the specified string returns only the two spec lines and no source file. apps/api/test/signing-settings.spec.ts:126 asserts `refused.body.message).toBe(TEMPLATE_MESSAGES.generic.forbidden)`, so the suite passes on the wrong contract.

**suggestedFix.** This is reconcilable without touching spec 01's or spec 02's suites, so it does not need a spec change: make the forbidden message selectable per capability (or per route) rather than one global constant, add the shared 'You do not have access to this resource' message to packages/validation, use it for ViewSigningSettings/ManageSigningSettings, and update TC-04-INT-16 to assert it. Leave TEMPLATE_MESSAGES.generic.forbidden as the message for the template capabilities so document-templates.spec.ts:576 keeps passing unedited.

## E3 — sonnet/`high`, 15 файлов, 7 шардов

`ds-lab-e3/.workflow/runs/lab-E3/review.verdict.json` · status `blocked` · находок на шард: 1, 2, 2, 0, 2, 3, 4 · 697s · $13.60 · старт 2026-08-30T13:16:13.595Z

**Блокеров: 3.**

### E3 · F1 — `docs/deployment.md:94`

**target:** `spec`

**rule.** CLAUDE.md/additive-migrations

**claim.** CLAUDE.md states as a rule that rollout-then-migrate is safe because migrations are additive; this change's migration header, docs/deployment.md and the spec all state that it is not safe for this release, and CLAUDE.md was not amended. The runbook's remedy is a manual pre-merge step that nothing in the pipeline enforces.

**witness.** **kind:** scenario · **source:** `CLAUDE.md:97`

CLAUDE.md:97-99 reads: 'Migrations should be **additive**. `make deploy-<env>` rolls the services out and *then* runs `prisma migrate deploy`, so the new code is serving before the schema changes — which is only safe because migrations are additive. This is a rule, not an observation about the current migrations.' docs/deployment.md:94 (added here) reads: 'A release that adds columns to a table the running code reads must migrate first.' I verified the underlying fact rather than taking either document's word: apps/api/src/documents/envelopes.service.ts:351 lists envelopes with `findMany({ include: {...} })` and no `select`, so the generated client enumerates every Envelope column, including the four added by apps/api/prisma/migrations/20260828140000_spec_04_signature_providers/migration.sql:29-32 (providerTestMode, providerStatus, providerSyncedAt, providerError), plus EnvelopeSigner.providerRef (:35) and Organization.signatureProviderKey (:24). Concrete failure: a developer merges this branch to `main` without first running `make migrate-dev` by hand. Per CLAUDE.md:85 push to `main` runs the suite and then deploys `dev`; `git diff 57d55ac..HEAD -- .github/workflows/deploy.yml infra/deploy.sh` is empty, so the pipeline still rolls services out before `prisma migrate deploy`. From the moment the new tasks are healthy until the migration lands, GET /api/organizations/{orgId}/envelopes and the envelope detail both fail with Postgres 42703 and answer 500. Nothing in the diff prevents this; the only guard is a paragraph a human must remember.

**suggestedFix.** A human decides which rule wins: amend CLAUDE.md:97-99 to the narrower truth (additive makes the *rollback* safe; forward safety additionally requires that no already-serving query names a column the migration has not created), or enforce the migrate-first order in deploy.yml/infra/deploy.sh so it does not depend on memory. Routed to `spec` rather than `code` because no implementation satisfies both documents as written, and sending it to the implementer would spend attempts on a contradiction it cannot resolve.

### E3 · F2 — `apps/api/src/documents/provider-reconciler.service.ts:309` — `applyState`

**target:** `code`

**rule.** checklist.md/concurrent-access-locking

**claim.** The 'signed' and 'declined' branches decide from a signer snapshot loaded before the transaction opens, with no row lock and no in-transaction re-read — the guard the adjacent 'viewed' branch does take. Two concurrent converges write the transition twice and fork the event hash chain.

**witness.** **kind:** scenario · **source:** `.claude/skills/spec/references/checklist.md:25`

Rule: checklist.md:25 — 'Concurrent access to the same row states its locking strategy.' and checklist.md:20 — 'Every path reachable twice is idempotent, with the mechanism named and a concurrency test.' Envelope E is `sent` on signwell, signer 1 is `notified`, providerSyncedAt is 3 hours old, and SignWell reports signer 1 as `signed` (the webhook was dropped). `converge()` has four entry points and three bypass the job queue entirely: envelopes.service.ts:398 and signing.service.ts:127 call `convergeIfStale` synchronously on the request thread, and envelope-sweep.service.ts:46 calls `sweepStale` on the hourly cron. So the sender opening the envelope detail while the sweep runs gives two concurrent `converge(E.id)` calls. Both `load()` the envelope and see signer.status='notified'; both fetchState and get 'signed'; both enter `applyState`'s `$transaction`; both satisfy `remote.status === 'signed' && signer.status !== SignerStatus.signed` at line 309 because neither re-reads inside the transaction. Observable result 1: two `signed` EnvelopeEvents for one signer. Observable result 2, which is worse and which I confirmed at envelope-events.service.ts:51-53 — `record()` picks the chain tail with `findFirst` under READ COMMITTED and no lock, so both rows are written with the same `previousEventHash`. The chain forks, one branch becomes unreachable to a verifier walking it, and that is exactly the condition `tamper_detected` exists to report. Spec 04's blast-radius row for 'The event chain' offers 'It writes through EnvelopeEventsService like everything else, so invariant 4 holds by construction' — but invariant 4 buys atomicity, not serialization, so the named mitigation does not address this risk. TC-04-INT-13 covers the concurrent-completion race, which is guarded separately by the write-once `updateMany`; no case covers concurrent signer convergence.

**suggestedFix.** Apply the defence the 'viewed' branch already uses: re-read the signer row (or count existing `signed`/`declined` events) via `tx` inside the transaction before writing, or take a `SELECT ... FOR UPDATE` on the envelope at the top of the transaction as envelopes.service.ts:854 and :1331 already do. Add a concurrency case for two simultaneous converges on one signer, asserting one `signed` event and a chain that verifies.

### E3 · F3 — `apps/api/src/organizations/signing-settings.controller.ts:25` — `SigningSettingsController`

**target:** `code`

**rule.** CLAUDE.md/spec-authoritative

**claim.** The signing-settings routes use the plain CapabilityGuard, whose 403 body is spec 01's templates message. Spec 04's required permission-denied text was never added to packages/validation, and the integration test locks in the wrong string by asserting against the production constant.

**witness.** **kind:** scenario · **source:** `specs/documents/04-signature-providers.md:983`

Rule: CLAUDE.md:3-4 — 'Spec-driven: `specs/` is authoritative and code is written to match it. When behaviour and spec disagree, the spec wins.' The spec's API contract for GET /api/organizations/{orgId}/settings/signing (specs/documents/04-signature-providers.md:983-984) requires `403 {"message":"You do not have access to this resource"}`, and its Error Messages table repeats it at :1088 with :1090 stating 'All of these live in packages/validation so web and API cannot disagree.' Concrete failure: a manager of org A with a valid session sends PUT /api/organizations/A/settings/signing with {"provider":"signwell","confirmed":true}. The controller (signing-settings.controller.ts:25,37) stacks the unmodified CapabilityGuard, whose `forbidden()` (apps/api/src/auth/capability.guard.ts:61-66) always returns `TEMPLATE_MESSAGES.generic.forbidden` = 'You do not have permission to manage templates' (packages/validation/src/documents.ts:125). So a manager on the signing settings screen is told they cannot manage templates. I confirmed the required string exists nowhere in the repository: a grep for 'You do not have access to this resource' across all .ts files returns no match. The defect is unreachable by the suite because apps/api/test/signing-settings.spec.ts:126 asserts `expect(refused.body.message).toBe(TEMPLATE_MESSAGES.generic.forbidden)` — it re-derives its expectation from the production code rather than from the spec, so it will keep passing while the contract is violated.

**suggestedFix.** Add the permission-denied message to SIGNING_PROVIDER_MESSAGES in packages/validation/src/signing-providers.ts, override the guard's message for the two settings routes (leaving the guard's default alone for existing callers), and change the assertion in TC-04-INT-16 to compare against the spec-04 constant.

## E17 — sonnet/`xhigh`, 20 файлов, 4 шарда

`ds-lab-e17/.workflow/runs/lab-E17/review.verdict.json` · status `blocked` · находок на шард: 4, 1, 2, 3 · 836s · $14.65 · старт 2026-08-30T17:48:18.241Z

**Блокеров: 4.**

### E17 · F1 — `apps/api/src/documents/provider-reconciler.service.ts:201` — `converge / applyState / openNextTurn`

**target:** `code`

**rule.** specs/documents/04-signature-providers.md requirement 21: "This makes replay, reordering, and duplicate delivery harmless by construction rather than by careful handling." and edge case 8: "convergence is state-based, so `viewed` is written once per signer — spec 02 requirement 17 survives."

**claim.** converge() loads the envelope outside the transaction and applyState then decides what to write from that stale snapshot inside the transaction without re-reading or locking, so two concurrent convergences of one envelope each write a second `signed` event and can mint a second signing token and mail a second invitation.

**witness.** **kind:** scenario · **source:** `specs/documents/04-signature-providers.md:384`

Envelope E is SignWell-backed, status='sent', providerSyncedAt older than PROVIDER_SYNC_STALE_SECONDS, and SignWell reports signer 1 = 'signed'. Two readers open the envelope at the same moment. Each calls EnvelopesService.get() -> reconciler.convergeIfStale(E.id). convergeIfStale (line 124) does a plain findUnique and an age comparison with no claim-guard, so BOTH pass the staleness check and both call converge(). Each converge() runs `this.load(envelopeId)` at line 201 before either has committed, so both hold a snapshot with signer.status='notified'; both call fetchState() and both see remote.status='signed'. Each opens its own $transaction at line 279 and evaluates `remote.status === 'signed' && signer.status !== SignerStatus.signed` at line 309 against that pre-transaction snapshot, which is never re-read or locked inside the tx. Postgres row-locks the EnvelopeSigner UPDATE so transaction B blocks, but once A commits B's UPDATE proceeds and B then calls events.record(tx, {type:'signed'}) at line 314 — EnvelopeEvent has no unique constraint (schema.prisma:483-508) that would abort it, so two 'signed' events exist for one transition and verifyChain still passes because previousEventHash links them in commit order. If that transition also opens the next turn, openNextTurn's `tx.signingToken.count` guard at line 464 is likewise unlocked under READ COMMITTED, so both transactions see zero live tokens, each creates a SigningToken (line 473), and notifyNextTurn fires after each commit — the next signer receives two invitation emails carrying two different, both-valid signing links. Contrast signing.service.ts:321, which takes `SELECT id FROM "SigningToken" ... FOR UPDATE` and then re-reads every row inside the transaction (line 323) precisely to make this idempotent; the reconciler does neither. Note the FIFO MessageGroupId=envelopeId in the job queue only serializes webhook-dispatched 'provider-reconcile' jobs against each other — convergeIfStale (every stale read) and sweepStale (the cron) never go through the queue.

**suggestedFix.** Open converge()'s transaction with the same `SELECT id FROM "Envelope" WHERE id = ${envelopeId} FOR UPDATE` that signing.service.ts:321 uses on its token row, and re-derive each signer's status from a query issued inside that locked transaction rather than from the pre-transaction snapshot, so the second concurrent convergence observes the first one's writes and becomes a no-op.

### E17 · F2 — `apps/api/src/signature/signwell/signwell-http-client.ts:259` — `HttpSignWellClient.call`

**target:** `code`

**rule.** specs/documents/04-signature-providers.md requirement 19: "The client serializes per organization, retries `429` with exponential backoff and jitter, five attempts, then surfaces `provider_unavailable`."

**claim.** Only createDocument supplies an organizationId, so every other client method serializes in one process-wide '_shared' lane instead of per organization — including the hot path the spec's own Blast Radius names.

**witness.** **kind:** rule · **source:** `specs/documents/04-signature-providers.md:349`

call() keys the queue on `request.organizationId ?? '_shared'` at line 259. createDocument passes `organizationId: body.metadata.organization_id` (line 162); getDocument (line 171), listDocuments (line 178), deleteDocument (line 190), completedPdf (line 202), ping (line 218) and hooks (line 226) all omit it, and the abstract SignWellHttpClient signatures take no organizationId at all, so a caller cannot thread one through. Consequence: organization A's reconcile does a getDocument that walks the full retry ladder (five attempts, each up to the hard 10s timeout); organization B's GET /api/sign/{token} -> signerAccess -> getDocument queues behind it for that whole duration, though B's document and B's rate-limit budget are untouched. The spec's Blast Radius names `signerAccess` on every page open as "the hot path", and names request-pool exhaustion as the risk this serialization is meant to bound — a single global lane concentrates rather than bounds it.

**suggestedFix.** Thread organizationId through getDocument, listDocuments, deleteDocument and completedPdf (each is always called in an envelope's, and therefore an organization's, context) and pass it from SignWellSigningProvider, so the per-organization key covers the whole client surface rather than only creates.

### E17 · F3 — `apps/api/src/auth/capability.guard.ts:60` — `forbidden`

**target:** `code`

**rule.** CLAUDE.md: "**Spec-driven**: `specs/` is authoritative and code is written to match it. When behaviour and spec disagree, the spec wins — change the spec first, deliberately."

**claim.** A 403 from the signing-settings endpoints returns "You do not have permission to manage templates" instead of the "You do not have access to this resource" that spec 04's API Contracts and Error Messages table both specify, and the new integration test asserts the code's string rather than the spec's.

**witness.** **kind:** scenario · **source:** `specs/documents/04-signature-providers.md:1088`

PUT /api/organizations/{orgId}/settings/signing as a `user` or `viewer` member of that organization. CapabilityGuard.forbidden() returns {"error":"forbidden","message":TEMPLATE_MESSAGES.generic.forbidden} = "You do not have permission to manage templates" — a message about templates on an endpoint that has nothing to do with templates. Spec 04 states the body twice: API Contracts for GET (line 984) and for PUT (line 1000) give `403 {"message":"You do not have access to this resource"}`, and the Error Messages table (line 1088) lists "Permission denied | You do not have access to this resource", with the closing line "All of these live in `packages/validation` so web and API cannot disagree." apps/api/test/signing-settings.spec.ts:126 asserts `expect(refused.body.message).toBe(TEMPLATE_MESSAGES.generic.forbidden)` — so TC-04-INT-16 is green against the deviation and would go red against the spec, which is the test encoding the defect rather than catching it.

**suggestedFix.** Give CapabilityGuard a per-capability (or per-route) forbidden message so the signing-settings endpoints answer the spec's string, add it to packages/validation beside the other spec 04 messages, and update TC-04-INT-16 to assert the spec's text. If the team would rather keep one shared message everywhere, that is a spec change and must be made in spec 04 first.

### E17 · F4 — `apps/api/src/signing/signing.service.ts:397` — `sign`

**target:** `spec`

**rule.** specs/documents/04-signature-providers.md State Machine, invariant 11: "A provider call never runs inside a database transaction. Every adapter method is called before or after one, never within — a five-attempt backoff inside a transaction would hold a row lock for a minute." — contradicted by requirement 10: "The rewrite is verified by the existing spec 02 test suite passing unchanged. A test that has to be edited to accommodate the new port is a signal that behaviour moved, and is a defect of this spec's implementation, not of the test."

**claim.** Two spec rules cannot both be satisfied: invariant 11 forbids calling any adapter method inside a transaction, while requirement 10 forbids the test changes that moving this call out would force.

**witness.** **kind:** rule · **source:** `specs/documents/04-signature-providers.md:684`

signing.service.ts opens `this.prisma.$transaction(async (tx) => {` at line 317 and calls the port method `locally.applySignature({...})` at line 397, inside it. applySignature is an adapter method on the SigningProvider port's LocallySigned narrowing (requirement 3), so invariant 11's "Every adapter method is called before or after one, never within" forbids it, and acceptance criterion 12 restates it as an observable: "No provider call is made while a database transaction is open." The implementer left a comment at lines 391-395 arguing the invariant's stated rationale (a five-attempt network backoff holding a row lock) cannot apply to the internal provider, which touches no network, and that moving the call out would reorder error precedence against spec 02's suite — which requirement 10 forbids editing. Both readings are defensible from the text, so no implementation satisfies both rules and routing this to `code` would spend attempts on a loop that cannot terminate. The resolution is one line of spec: narrow invariant 11 and acceptance criterion 12 to calls that cross the network (or to providers whose capabilities put the surface off-box), which is what the invariant's own rationale already says it is about.

**suggestedFix.** Amend invariant 11 and acceptance criterion 12 in spec 04 to scope them to remote provider calls, so a local adapter method that performs no I/O is explicitly permitted inside a transaction. Deliberate spec change, per CLAUDE.md.

## E19 — sonnet/`xhigh`, 15 файлов, 5 шардов

`ds-lab-e19/.workflow/runs/lab-E19/review.verdict.json` · status `blocked` · находок на шард: 3, 4, 3, 3, 2 · 1007s · $18.67 · старт 2026-08-30T17:58:00.108Z

**Блокеров: 5.**

### E19 · F1 — `apps/api/src/documents/provider-reconciler.service.ts:353` — `applyState`

**target:** `code`

**rule.** specs/documents/04-signature-providers.md invariant 9 — "Convergence never moves an envelope out of a terminal state."

**claim.** Convergence guards the terminal-state invariant against a stale in-memory snapshot taken before a network call, and never re-reads or locks the envelope row inside the transaction that writes its status, so a void committed during the fetch is silently overwritten.

**witness.** **kind:** scenario · **source:** `specs/documents/04-signature-providers.md:680`

Envelope E is `sent` under SignWell. A read triggers convergeIfStale(E) -> converge(E), which loads status='sent' via an unlocked findUnique (line 201) and evaluates isTerminal() on it (line 211), then awaits fetchState() — an outbound HTTPS call with a 10s timeout and five backoff attempts per requirement 19, so the window is seconds. During that window an admin calls POST /envelopes/E/void, which takes `SELECT id FROM "Envelope" WHERE id = ... FOR UPDATE` (envelopes.service.ts:1331), sets status='voided' and commits. fetchState then returns partially_signed. applyState opens its $transaction at line 279 with no lock and no re-read, evaluates `state.status === 'partially_signed' && envelope.status === EnvelopeStatus.sent` against the pre-void snapshot (line 364), and executes tx.envelope.update({ data: { status: partially_signed } }) at line 368 — un-voiding an envelope an admin explicitly voided. The identical hole exists at line 354 for the `declined` branch. The send and void paths in envelopes.service.ts (lines 854 and 1331) both take FOR UPDATE and re-check status inside their transactions for exactly this reason; the reconciler does neither.

**suggestedFix.** Take `SELECT id FROM "Envelope" WHERE id = ... FOR UPDATE` at the top of applyState's transaction and re-read status there, re-evaluating isTerminal() against the locked row before any envelope.update — mirroring envelopes.service.ts:854 and :1331.

### E19 · F2 — `apps/api/src/webhooks/webhook-rate-limit.guard.ts:62` — `WebhookRateLimitGuard.canActivate`

**target:** `code`

**rule.** specs/documents/04-signature-providers.md, POST /api/webhooks/signwell — "Rate limited to 600 requests per minute per source, above which it answers 429 — SignWell's own send rate is far below this, so the limit only ever bites on abuse."

**claim.** The rate limiter for the product's new public unauthenticated endpoint is keyed on a value the caller controls, so the 600/minute limit can be evaded entirely by the only caller it exists to stop.

**witness.** **kind:** scenario · **source:** `specs/documents/04-signature-providers.md:1005`

clientIp(req) returns the FIRST comma-separated entry of the client-supplied X-Forwarded-For header (envelopes.service.ts:201-207), and no `trust proxy` setting exists anywhere in the app (grep over apps/api/src and main.ts returns nothing). AWS ALB appends the peer address to X-Forwarded-For rather than overwriting it, so the first entry is attacker-chosen. POST /api/webhooks/signwell 601 times in one minute, each request carrying a distinct fabricated `X-Forwarded-For: 1.0.0.<n>`: per the spec, request 601 answers 429. Observed: WebhookRateLimiter.allow() sees a new key every request, no bucket ever reaches WEBHOOK_RATE_LIMIT, and every request proceeds to hash verification. The endpoint's own test pins a fixed source string (signwell-webhook.spec.ts:248), so it proves the counter increments but never that the source is unspoofable. The spec's Blast Radius names the rate limit as one of five mitigations for this new public attack surface.

**suggestedFix.** Key the webhook limiter on a value the caller cannot choose — configure Express `trust proxy` to the known ALB hop count and use req.ip, or read the rightmost X-Forwarded-For entry — rather than the first, client-supplied hop.

### E19 · F3 — `specs/documents/04-signature-providers.md:1180` — `Backward Compatibility 3`

**target:** `spec`

**rule.** CLAUDE.md:97 — "`make deploy-<env>` rolls the services out and *then* runs `prisma migrate deploy`, so the new code is serving before the schema changes" — contradicted by infra/deploy.sh:27 — "**Migrations run BEFORE the rollout**, and the order is the whole point."

**claim.** Two written rules contradict each other on deploy order, and the spec, the runbook prose and the migration header added by this diff all rest on the stale one — describing an outage window that the shipped pipeline already prevents by construction.

**witness.** **kind:** rule · **source:** `infra/deploy.sh:27`

infra/deploy.sh:27 states "**Migrations run BEFORE the rollout**, and the order is the whole point", and its body runs infra/migrate.sh (line 184) before the final `tf apply` that rolls services out (line 188), whenever the API image is in SERVICES. `make deploy-dev` is exactly `infra/deploy.sh dev api web` (Makefile:104-105). That ordering was committed as b7a167e "Run migrations before the rollout, not after" on 2026-08-27, an ancestor of this diff's base 57d55ac. CLAUDE.md:97 still asserts the opposite. The spec's Backward Compatibility 3 (rewritten in this diff, lines 1180-1193) builds its whole argument on the CLAUDE.md claim — "`make deploy-<env>` rolls services out *before* `prisma migrate deploy`... every read fails with `42703`... The document list and detail screens return 500 for that window" — and docs/deployment.md and the migration.sql header repeat it, presenting a manual migrate-first step as new and spec-04-specific when the pipeline has done it unconditionally since before this work began.

**suggestedFix.** A human decides which source is authoritative. If infra/deploy.sh is right, correct CLAUDE.md:97, the spec's Backward Compatibility 3, the new docs/deployment.md prose and the migration.sql header together. Routed to `spec` and not `code` deliberately: the implementation faithfully matches the spec here, so sending it back to the implementer would ask it to write documentation that contradicts its own contract, which it may not edit.

### E19 · F4 — `apps/web/app/org/[orgId]/documents/[envelopeId]/page.tsx:273` — `EnvelopeScreen`

**target:** `code`

**rule.** CLAUDE.md:62 — "**Testing.** Selectors are `data-testid` only, and the ids are named in the specs."

**claim.** A data-testid introduced by this diff is named in no spec and referenced by no test.

**witness.** **kind:** rule · **source:** `CLAUDE.md:62`

`data-testid="envelope-provider-unconfigured"` is new in this diff. A repository-wide grep across *.md, *.ts and *.tsx returns exactly one occurrence — this source line. It appears in no section of specs/documents/04-signature-providers.md (not the UI Description table, not Required data-testid Attributes), in no other spec, and in no test at any level. The spec added a note in this very diff on precisely this discipline: "An id for a control that already exists is not this spec's to name."

**suggestedFix.** Drop the data-testid from the InfoBanner — the banner itself is required by edge case 16 and can stay — or add the id to the spec's UI Description and Required data-testid tables with a TC-04 case that exercises it.

### E19 · F5 — `apps/web/app/org/[orgId]/settings/signing/ChangeProviderModal.tsx:63` — `ChangeProviderModal`

**target:** `code`

**rule.** specs/documents/04-signature-providers.md, Error Messages — "All of these live in `packages/validation` so web and API cannot disagree"; CLAUDE.md:50 — "Never write a user-facing validation message inline."

**claim.** A sentence from the spec's Error Messages table is inlined in JSX as a second copy, in a file that imports the shared module for the very next paragraph.

**witness.** **kind:** rule · **source:** `specs/documents/04-signature-providers.md:1090`

Line 63 renders the literal `New documents will be signed through {providerName}.` The same sentence is the spec's "Settings saved" row and already exists as SIGNING_PROVIDER_MESSAGES.settings.saved(provider) in packages/validation/src/signing-providers.ts:77, whose own header says "Nothing in `apps/web` or `apps/api` may inline one of these." The file imports SIGNING_PROVIDER_MESSAGES at line 3 and uses it correctly six lines later for settings.inFlight (line 69), so the module is in scope and the inline copy is an oversight. Two copies of one sentence are two sentences that can drift, which is the exact failure the rule exists to prevent.

**suggestedFix.** Replace the literal with SIGNING_PROVIDER_MESSAGES.settings.saved(providerName).

---

# Приложение: заметки (severity ≠ blocker)

Только `id`, место и `claim` — полные свидетели остаются в вердиктах на диске.

## A3 — 22 заметок

- **N1** (note) `apps/api/src/webhooks/webhook-rate-limit.guard.ts:62` — `WebhookRateLimitGuard.canActivate` — The limiter keys on clientIp, which returns the first entry of the X-Forwarded-For header when one is present. main.ts sets no trust proxy, so the header is taken from whatever the caller sent. On the product second unauthenticated route the bucket key is fully attacker-controlled and the limit cannot bite. Held at note rather than blocker only because the 600 per minute figure lives in API Contracts rather than in a numbered requirement, but it is the most consequential note in this set.
- **N2** (note) `apps/api/src/webhooks/redact-payload.ts:59` — `redactProviderPayload` — The post-serialization failure check re-scans only for credential keys. Requirement 35 names three redaction classes - signing URLs, field values, and foreign metadata keys - and only the first fails closed. The walk marks the in-fields state only when descending through a key literally named fields, so values under a differently named collection are stored verbatim and nothing throws.
- **N3** (note) `apps/api/src/documents/envelopes.service.ts:341` — `EnvelopesService.list` — Lazy convergence is wired into get at line 398 but not into list, so the documents list shows a stale status for up to an hour. Requirement 24a says any read. Converging a 25-row page would spend 25 provider calls against the 20-per-minute test-mode budget that Blast Radius protects, so the right answer may be to narrow the requirement instead.
- **N4** (note) `apps/api/src/documents/provider-reconciler.service.ts:526` — `recordProviderError` — provider_error is declared in the Prisma enum and in the shared event type list, and the single permitted edit to spec 02 suite under requirement 10 was spent raising the count to seventeen to admit it. But no code path ever writes an event of that type - recordProviderError writes only the providerError column on the envelope.
- **N5** (note) `apps/api/src/internal/envelope-sweep.service.ts:71` — `retryProviderDownloads` — The completion-retry pass keys on a pending pdfStatus, a flag only the catch block of completeFromProvider sets, so a provider-complete job that is never delivered leaves the status at not_required and is invisible to it. Correctness still holds via sweepStale re-converging hourly, provided some consumer runs the handler.
- **N6** (note) `apps/api/test/signwell-send.spec.ts:128` — `TC-04-INT-01` — TC-04-INT-01 is the only case inspecting the outgoing create body, and it asserts five of the fourteen fields requirement 13 names. Nothing anywhere asserts the base64 body and the absence of file_url, nor draft, text_tags, embedded_signing_notifications, allow_decline or allow_reassign. Two are load-bearing: file_url would publish an unsigned contract at a public URL, and the notifications flag is what stops SignWell mailing the counterparty directly under requirement 12.
- **N7** (note) `apps/api/test/signing-settings.spec.ts:106` — `TC-04-INT-16` — The role loop writes only manager, user and viewer, so the legacy value the schema actually produces today - member - never passes through the session, org-scope and capability guards on either new endpoint. A guard comparing the raw column instead of calling normalizeRole would pass every case here while granting the wrong thing on real data. The mapping is covered at unit level, which is why this is a note.
- **N8** (note) `apps/api/test/signing-settings.spec.ts:44` — `the two signing settings endpoints` — The two new session-guarded endpoints have no case for an absent or invalid session - every request carries the signed-in cookies. The 403 and 404 halves of the contract are both proved; the 401 half is not, so a route registered without the session guard, or with the guard ordered after the capability guard, would not be caught here.
- **N9** (note) `apps/api/test/signwell-client.spec.ts:79` — `TC-04-INT-21` — The case is realised as three pure client-level tests with no Nest application, no database and no send. What is proved is that the client retries and that the breaker opens and closes, not that a send survives a 429 and still reaches sent exactly once. Given F4, the interaction between the retry budget and the requirement 26 orphan scan is exactly what is left unpinned.
- **N10** (note) `apps/api/test/setup-env.ts:32` — `the poll interval override` — The suite sets the poll interval to zero, so only the attempt half of the requirement 38 bound is exercised and the thirty-second wall is never observed. TC-04-INT-03c compounds this by asserting the getDocument count equals a constant imported from the implementation, so it passes for any value of that constant, including one that no longer matches the spec ten. Neither the poll interval nor the API base URL appears in the spec Configuration table, which is framed as a contract.
- **N11** (note) `specs/documents/04-signature-providers.md:569` — `Edge case 12` — The spec contradicts itself. The client download URL is byte for byte what requirement 17 specifies and never sends a file_format parameter, so the edge case 12 premise is false of the shipped client and its reasoning that a ZIP would be a provider fault has nothing holding it up. The code follows requirement 17 exactly, so this is a spec defect rather than an implementation one.
- **N12** (note) `apps/web/app/sign/[token]/EmbeddedSigning.tsx:142` — `the embedded iframe` — The frame is created with an allow attribute granting camera, microphone and clipboard-write, delegating three powerful permissions to the embed origin on the one session-less page in the product. The spec authorises exactly one widening, frame-src, and says nothing about a permissions delegation. Nothing in requirement 15 needs a camera or a microphone to draw a signature.
- **N13** (note) `apps/web/app/org/[orgId]/settings/signing/ProviderOption.tsx:116` — `ProviderOption and StatusPill` — Reader-facing copy is inlined in the component: the missing-items sentence at lines 116 to 118, the connection and webhook labels at lines 101 to 104, and the pill words at lines 146 to 151. None duplicates a message in the spec Error Messages table, but a providerNotConfigured helper already exists in packages/validation/src/signing-providers.ts:242 for the same idea and the screen does not use it, which is how two sentences about one condition start to drift.
- **N14** (note) `packages/validation/src/signwell-webhook.test.ts:7` — `cross-workspace test imports` — Three new unit suites in packages/validation reach upward into the API workspace: two import modules from apps/api/src and apps/api/test, and signing-providers.test.ts walks apps/api/src from disk. apps/api depends on the validation package, so the test layer now points back the other way, and the suite CLAUDE.md calls the free one breaks when an unrelated file moves inside apps/api.
- **N15** (note) `packages/validation/src/envelopes.test.ts:404` — `TC-02-UNIT-02` — The permitted exception was to update the count assertion to seventeen. The edit also renames the test title and adds two membership assertions. Both additions strengthen rather than weaken, and no spec 02 behaviour assertion moved, so this is recorded rather than blocked - but it is more than the single assertion requirement 10 authorises, and one of the two values it pins has no writer, as N4 records.
- **N16** (note) `e2e/tests/signature-providers.spec.ts:203` — `TC-04-E2E-02` — The loading assertion races the iframe load event. EmbeddedSigning.tsx:129 renders the placeholder only while the frame is not ready, readiness flips on the load handler, and the stub embed URL is same-origin and loads in milliseconds. Playwright polls rather than observing, so a fast load can retire the placeholder before the first poll.
- **N17** (note) `apps/web/app/org/[orgId]/settings/signing/page.tsx:107` — `testModeOn` — The test-mode banner renders only when the current provider is in test mode, so it is absent while an organization is on Built-in with SignWell listed as available in test mode - exactly the state the spec own screen mock draws it in. No numbered requirement pins it, and TC-04-E2E-01 asserts the banner only after the switch, so nothing catches the divergence either way.
- **N18** (note) `apps/web/app/org/[orgId]/settings/signing/page.tsx:179` — `the save handler` — When the selected provider equals the stored one, pressing Save shows the saved toast without issuing the PUT, so the screen states a save that did not happen and set no signatureProviderSetAt. Harmless today, but it makes the toast a statement about the button rather than about the write.
- **N19** (note) `apps/api/src/signature/signwell/signwell-http-client.ts:344` — `readRateLimit and rateLimitFor` — The per-family rate-limit state is written on every reply and read only by rateLimitFor, which nothing under apps/api/src calls. Nothing consults the remaining budget before spending a call, so the observed limits are recorded and then ignored, and exhaustion is discovered by taking the 429. Requirement 19 asks for tracking and 429 retry, both of which exist, so this is judgement rather than a violation.
- **N20** (note) `apps/api/src/signature/signwell/signwell-http-client.ts:315` — `HttpSignWellClient.attempt` — The breaker is consulted once at the top of attempt and again only in the transport-error catch. A run of 5xx responses can open the breaker mid-loop while the loop keeps issuing calls, and after the loop the failure is recorded a second time for the same call, so the consecutive-failure count overcounts. No observable spec outcome changes, since edge case 22 concerns a send attempted while the breaker is already open, which is handled.
- **N21** (note) `e2e/tests/signature-providers.spec.ts:149` — `TC-04-E2E-01 and TC-04-E2E-04` — Three locators chain a role selector off a testid, at lines 149, 150 and 289. Demoted because the rule is already relaxed repo-wide and because the design-system Radio offers no way to place a testid on its input, so a pure-testid selector cannot express the radio without editing the design system.
- **N22** (note) `apps/api/src/signature/internal-signing-provider.ts:1` — `the rename pair` — Positive finding. The rename from internal-signature-provider to internal-signing-provider lost nothing: applySignature, requireDrawnImage, requireTypedName and typedSignatureImage are byte-identical to the deleted file, and the finalize body moved verbatim to certificate-of-completion.ts. The only behaviour of issueInvitation now lives in signing-token.ts lines 20 to 49. The signature-provider to signing-provider rename drops only types that had no caller, and nothing in the repository still imports either deleted module. Secret handling is clean: the API key appears only as a request header, no log line carries it or the webhook id, the provider-unavailable detail is dropped before the response, and the stub driver is refused outright when NODE_ENV is production, a stricter fence than the mail sink. Requirement 2 also holds: there are zero literal signwell comparisons in any service, and issuesOwnCertificate resolves the provider from the registry and branches on capabilities.

## B3 — 15 заметок

- **N1** (note) `apps/api/src/webhooks/webhook-rate-limit.guard.ts:62` — `WebhookRateLimitGuard.canActivate` — The rate limit on the second unauthenticated route in the product is keyed on a caller-controlled value, and the bucket map is never evicted.
- **N2** (note) `apps/api/test/signwell-client.spec.ts:80` — `TC-04-INT-21` — The id is claimed by three cases driving createDocument through a fake transport, with no envelope and no send endpoint. Every integration file replaces the whole SignWellHttpClient, so no integration case ever runs the retry, rate-limit or breaker path.
- **N3** (note) `apps/api/src/documents/provider-reconciler.service.ts:508` — `recordProviderError` — Every failure path writes providerError but leaves providerSyncedAt untouched, so the envelope stays permanently stale and re-fetches on every subsequent read. Only the circuit breaker bounds the resulting call rate.
- **N4** (note) `apps/api/src/documents/provider-reconciler.service.ts:241` — `convergeIfStale` — converge guards fetchState with try and catch but not applyState, whose transaction can throw. sweepStale and the queue dispatcher are both wrapped; the lazy-read path is not, so a provider-side hiccup becomes a 500 on the envelope detail and on the signing page.
- **N5** (note) `apps/web/app/sign/[token]/EmbeddedSigning.tsx:142` — `iframe allow attribute` — The frame is rendered with an allow attribute granting camera, microphone and clipboard-write, delegating camera and microphone permission to the embed origin on the only session-less page in the product. Nothing in the spec says the widget needs either.
- **N6** (note) `apps/web/app/sign/[token]/EmbeddedSigning.tsx:80` — `message listener` — The completion hint is matched by testing whether the action contains the substring complet, so values such as incomplete_fields, not_completed or completion_pending would swap the widget for the confirmation and, with no way back, leave the signer unable to sign without a manual reload.
- **N7** (note) `apps/web/app/sign/[token]/page.tsx:356` — `terminal panels` — sign-test-badge is rendered only inside the embedded-surface branch at line 493; the terminal-state branch returns before reaching it. A signer reopening their link after signing a test-mode document, which edge case 18 keeps reachable, sees the document and the download control with no test marking at all.
- **N8** (note) `apps/web/app/org/[orgId]/settings/signing/page.tsx:179` — `Save provider onClick` — When the selection equals the stored provider, pressing Save raises the saved toast without issuing any request, so an admin is told a change was saved when nothing was sent.
- **N9** (note) `e2e/tests/signature-providers.spec.ts:327` — `TC-04-E2E-05` — The assertion that envelope-certificate-link has zero count can never fail: no component in apps/web renders that id, and spec 02 has no such control, since its Certificate of Completion is a page inside the PDF rather than a link on the detail screen. The assertion is identically true for an internal envelope, so it distinguishes nothing and does not prove requirement 28.
- **N10** (note) `apps/api/src/documents/envelopes.service.ts:341` — `EnvelopesService.list` — Only get and SigningService.view converge; list never does, so the documents list can show statuses up to an hour behind while the detail screen is current. The implementation choice is the right one, since converging a 25-row page would spend 25 provider reads against the budget the Blast Radius rations, but requirement 24a as written says any read.
- **N11** (note) `apps/api/src/documents/provider-reconciler.service.ts:616` — `staleAfterSeconds` — Coercing an empty string to a number yields zero, which is finite and non-negative, so setting the variable to an empty value silently produces a zero-second threshold and converges on every single read rather than falling back to the documented 120.
- **N12** (note) `scripts/review-coverage.mjs:107` — `openedIn loop` — The coverage ledger reintroduces the tool-call inference that review-slice.mjs exists to replace, and it is wrong in both directions: it credits no Read at all on this platform, comparing repo-relative diff paths against absolute Windows paths with backslashes, while crediting any Bash command that merely names a file - so a grepped-but-unread file is reported as judged and then excluded from the next pass by ship.mjs:142.
- **N13** (note) `.claude/ai-workflow.config.json:41` — `convergence` — The retry and infra budgets were raised, maxCodeAttempts from five to eight and infraRetries from two to three, while docs/ai-workflow.md:121 still reads five code attempts, one replan, two infrastructure retries. Because wf.mjs resets codeAttempts on a handoff replan, the worst case is now sixteen implement invocations rather than ten.
- **N14** (note) `specs/documents/04-signature-providers.md:79` — `Exists, and is reused unchanged` — The table says token minting in apps/api/src/signature/signing-token.ts is Unchanged. The diff adds signingPageUrl to that file. The addition is correct and well-motivated, absorbing what the removed issueInvitation port method did for its three call sites, so the code is right and the table cell is stale.
- **N15** (note) `apps/api/src/signature/signwell/signwell-signing-provider.ts:262` — `verifyMaterialized` — The materialization check is one-directional: every expected field must find an unclaimed match, but a received field that nothing expected is never reported, so a wrong count in the too-many direction passes verification and the envelope reaches sent.

## E18 — 19 заметок

- **N1** (note) `packages/validation/src/roles.test.ts:43` — Requirement 10 permits exactly one edit to spec 02's suite (the TC-02-UNIT-02 enum count). This diff also rewrites two exhaustive toEqual assertions here — the ROLE_CAPABILITIES matrix at :43 and capabilitiesFor at :113 — to add the two new capabilities. Demoted from shard 3's blocker: the touched describes carry no spec-02 case id (TC-02-UNIT-06 at :141 is untouched), the edits are additive with no assertion weakened, and reverting them would not compile against the widened Capability union. The spec's exception list is arguably one item short; that is a judgement for a human, not a retry.
- **N2** (note) `specs/documents/04-signature-providers.md:566` — Edge cases 9, 10, 11, 12, 16 and 28 have no test case at any level. The sharpest one: assertLooksLikePdf (apps/api/src/documents/envelope-completion.ts:374) implements edge cases 11 and 12, and grep shows zero references to it or to 'not_a_pdf' anywhere in apps/api/test — every completion fixture feeds bytes beginning '%PDF-'. Deleting that guard would turn a ZIP or a truncated body into a 'completed' envelope whose record of execution is not a PDF, and every test in this diff would still pass. Demoted from shard 3's blocker because the rule it cites is .claude/skills/spec/references/checklist.md, which is the rubric for writing specs and is not one of the three sources a blocking finding may draw on.
- **N3** (note) `apps/api/src/signature/signwell/signwell-http-client.ts:315` — The circuit breaker counts retry attempts rather than calls, and recordFailure runs once more after the loop, so a single call that meets a 5xx on all five attempts records six failures and opens the breaker — one failed send then fails every SignWell call fast for 60s, including signerAccess for unrelated organizations. Symmetrically, recordSuccess runs on any non-429/non-5xx response, so a permanently wrong SIGNWELL_API_KEY answering 401 never opens the breaker at all.
- **N4** (note) `apps/api/src/webhooks/webhook-rate-limit.guard.ts:62` — The rate-limit bucket keys on clientIp(), which returns the first X-Forwarded-For entry — a caller-supplied header — on the product's only inbound public route. Rotating it gives an unbounded budget and also grows the limiter's map without bound, since an entry is pruned only when its own key recurs. Inherited verbatim from the shipped SigningRateLimiter, and the blast is bounded by the hash guard (a caller without the webhook id gets 401, writes no row, makes no provider call), so it is a convention question rather than a new invention — but 'per source' is currently caller-chosen.
- **N5** (note) `apps/api/src/webhooks/signwell-webhook.controller.ts:142` — provider-reconcile is enqueued with envelopeId set to facts.providerRef (the SignWell document id) while provider-complete and pdf-render use the real envelope id. Under the SQS FIFO driver the group key is the message group, so the two land in different groups and can run concurrently for one envelope — the guarantee job-queue.ts:22-26 says the group key exists to provide. The write-once updateMany guard still protects the stored PDF (edge case 7), so this is timeliness and event-ordering rather than a corrupt artefact.
- **N6** (note) `apps/api/src/queue/job-queue.ts:20` — provider-complete is enqueued with no payload, so under the SQS driver two enqueues for one envelope inside five minutes serialize to identical bodies and are collapsed by content-based deduplication — a retry after a failed completed_pdf download is silently dropped and recovery waits for the hourly sweep. provider-reconcile is unaffected because webhookEventId differs per delivery. Timeliness only, which requirement 24 absorbs by design.
- **N7** (note) `apps/api/src/webhooks/redact-payload.ts:59` — The recursive walk is total for well-formed JSON and correctly handles the page-grouped fields array-of-arrays a flat .map() would miss. The post-walk serialize-and-scan belt, however, re-checks only CREDENTIAL_KEYS — not surviving fields[].value or foreign metadata keys — so the file's claim that 'a shape change on their side cannot quietly reopen the leak' holds for signing URLs but not for the PII half of requirement 35. A field value arriving under a key the walk does not treat as 'fields' (a future form_fields) would be stored verbatim with no refusal. TC-04-UNIT-06 expected result 5 asserts totality for both classes.
- **N8** (note) `apps/web/app/sign/[token]/EmbeddedSigning.tsx:142` — The iframe carries allow="camera; microphone; clipboard-write", delegating those Permissions-Policy features to the third-party embed origin on the one session-less page in the product. Nothing in the spec asks for camera or microphone — the embedded surface is a signature widget, and ID verification is explicitly Out of Scope. The spec authorises exactly one widening for this page (frame-src) and states script-src is untouched; this is a third widening it does not mention.
- **N9** (note) `apps/web/app/org/[orgId]/settings/signing/page.tsx:180` — When the selected provider equals the stored one, pressing Save shows toast-signing-provider-saved without issuing any request. The toast the spec reserves for a completed change fires for a no-op, so the one signal an admin has that a change landed becomes untrustworthy.
- **N10** (note) `apps/api/src/documents/signwell-text-tags.ts:89` — Every signer-owned text field for one recipient translates to the byte-identical tag {{Text_n}}, with the field key recorded in expectedFields but never in the tag. Two distinct signer-owned fields for one signer reach SignWell as two indistinguishable tags, and requirement 38's verification compares only type, recipient and required — so a provider that links same-named fields (one answer filling both) would still satisfy the check. The spec fixes no tag vocabulary, so this is judgement, but the failure mode is the invisible one requirement 14 exists to prevent.
- **N11** (note) `e2e/tests/signature-providers.spec.ts:203` — TC-04-E2E-02 asserts sign-embedded-loading is visible after goto, but the placeholder is removed the moment the iframe fires load (EmbeddedSigning.tsx:129) and the src comes from an in-process stub. toBeVisible has no 'was visible at some point' semantics, so this races the load event and can fail without a defect.
- **N12** (note) `e2e/tests/signature-providers.spec.ts:327` — TC-04-E2E-05's `expect(getByTestId('envelope-certificate-link')).toHaveCount(0)` is vacuous: the id is rendered by no component under any provider, and it appears in no spec but this one, so the assertion passes identically for an internal envelope and proves nothing about requirement 28. Relatedly the API composes provider.certificateIssued (envelopes.service.ts:1711) and the web type declares it (apps/web/src/documents/envelopes.ts:143) but no component reads it — the one field that would let the screen express requirement 28 is dead on arrival. Either spec 02 should own the control or spec 04 should retire the id and let TC-04-INT-09 carry requirement 28.
- **N13** (note) `docs/deployment.md:84` — The migration header, backward compatibility 3 and the runbook now agree that this release must migrate before the rollout. CLAUDE.md's 'Watch out for' still states the order as rollout-then-migrate and gives 'which is only safe because migrations are additive' as the reason — the exact reasoning backward compatibility 3 was rewritten to refute. The spec's requirement is met (the choice was delegated to docs/deployment.md and lands there), so this does not block, but CLAUDE.md is left contradicting the shipped runbook, and a reader following CLAUDE.md alone would deploy this release and take a 500 on the documents list and detail for the rollout window.
- **N14** (note) `scripts/static-gate.mjs:90` — Rule 2 declares 'The implementation may not weaken the checks that judge it' but scopes its diff to apps, packages and e2e. The files that decide whether a stage runs at all — .claude/ai-workflow.config.json, scripts/ship.mjs, scripts/wf.mjs and static-gate.mjs itself — are outside that scope, so an implement stage that wrote "review": {"enabled": false} into the config would pass the static gate silently. This diff edits both static-gate.mjs and that config, so the gap is live rather than hypothetical. Also in this diff: maxCodeAttempts 5->8 and infraRetries 2->3, which widen the window in which a run keeps spending attempts instead of halting for a person.
- **N15** (note) `scripts/review-coverage.mjs:86` — The header claims coverage 'errs downward', but a path counts as opened when any tool input string contains it — so one `git diff base..HEAD -- fileA fileB fileC` marks every named file reviewed. The next reviewer is then told not to re-derive files nobody read a line of, which is the precise failure the ledger exists to prevent. Restricting credit to Read calls would match the stated intent. Relatedly, static-gate rule 1 now measures spec edits from headAtInit, which wf init re-stamps on every run, so a spec edit made by an implement attempt becomes invisible after a re-init.
- **N16** (note) `apps/api/test/signwell-send.spec.ts:128` — TC-04-INT-01 asserts five of requirement 13's fifteen outgoing fields. Unasserted anywhere: draft:false, text_tags:true, embedded_signing_notifications:false, expires_in, allow_decline:true, allow_reassign:false, and the security-relevant one — that files[0] carries file_base64 and never file_url, which requirement 13 justifies as 'it would require exposing a public URL to an unsigned contract'. The spec's own TC-04-INT-01 names only the five, so this is not a rule breach; one added toMatchObject closes it. Requirement 19's load-bearing half is likewise untested: that limits are read from x-ratelimit-* headers rather than hard-coded, which the spec observed the documented figures to be wrong about.
- **N17** (note) `packages/validation/src/signwell-webhook.test.ts:7` — Three new test files in packages/validation import from apps/api (../../../apps/api/src/webhooks/..., ../../../apps/api/test/signwell-webhook-fixtures). packages/validation is shared by web and API and is otherwise dependency-free; this inverts that direction, so npm run test:unit for the shared package now depends on apps/api's source tree. The level choice is right — pure string and crypto work belongs at unit — but the pure modules arguably belong in packages/validation, which is where rules shared by web and API are supposed to live.
- **N18** (note) `apps/api/.env.example:62` — SIGNATURE_PROVIDER="internal" is still documented with the comment 'a third-party adapter is a class plus a value here'. No code reads it any more — provider choice is Organization.signatureProviderKey read at send, and registration is SigningProviderRegistry reading the SIGNWELL_* values at call time. A fresh clone is told to configure a dead variable and handed the superseded mental model this spec exists to replace. Separately, SIGNWELL_POLL_INTERVAL_MS and SIGNWELL_API_BASE_URL are read by the code but appear in neither the spec's Configuration table nor its 'anything differing beyond this table is a bug' contract.
- **N19** (note) `apps/api/src/signing/signing.service.ts:751` — embeddedSurface falls back to `envelope.providerKey === 'internal'` when no adapter is registered. Requirement 2 says the service branches on the capability and never on the key, and TC-04-UNIT-05 enforces that only for the literal 'signwell'. Defensible as written — there is no capability record to consult when the provider is absent, and internal is always registered — but it is the one key comparison left on a decision path, and worth a deliberate comment saying why it is not the branch requirement 2 forbids.

## E20 — 24 заметок

- **N1** (note) `apps/web/app/sign/[token]/EmbeddedSigning.tsx:142` — `EmbeddedSigning` — The iframe on the session-less signing page carries allow="camera; microphone; clipboard-write", delegating three permissions to the provider's origin, and has no sandbox attribute. Requirement 15 enumerates the concessions the embedded surface is allowed to make — our own iframe, our own origin-checked listener, frame-src widened, script-src untouched, the vendor SDK deliberately not loaded — and a permissions policy is not among them; SignWell's embedded signing needs none of the three for a drawn or typed signature. No written rule forbids it, so it is a note, but it is the note most worth a human's attention: /sign is the one page in the product with no session that renders author-controlled HTML.
- **N2** (note) `specs/documents/04-signature-providers.md:526` — `requirement 40` — Requirement 40 was relaxed in this diff: the re-read after DELETE was removed, and the implementation matches only the relaxed form. The stated justification does not hold — requirements 41 and 42 constrain the reconciler's handling of the self-inflicted document_canceled webhook and of a 404 on read, and neither speaks to a single confirming read inside cancel(); the old text already called that 404 'expected' rather than a fault, so there was no contradiction to resolve. What the edit removes is the only detection of a provider that acknowledges a delete without performing it — precisely the harm requirement 18 exists to prevent: a counterparty holding a working embedded_signing_url for a contract we consider void, with our rows saying voided.
- **N3** (note) `apps/api/src/documents/envelopes.service.ts:351` — `EnvelopesService.list` — Requirement 24a is unconditional ('Any read of a non-terminal envelope...') but convergeIfStale is wired to exactly two call sites: the envelope detail and the signing surface. list(), document(), audit() and preview() read non-terminal remote envelopes and never converge. The code is not obviously wrong — requirement 19's budget and per-organization serialization make converging a 100-row list inside one request untenable — but the spec and the code describe different scopes. Observable: a SignWell envelope that completed an hour ago with a dropped webhook shows as 'sent' in the list, and a status filter of 'completed' omits it, until someone opens the detail page.
- **N4** (note) `apps/api/src/documents/envelopes.service.ts:943` — `EnvelopesService.send` — The SES invitation is awaited inside the send transaction while the envelope row lock is held — a network call under a row lock, which SKILL.md:24-26 blocks on. Spec 02 requirement 11 requires exactly this ('If the mail transport rejects the message, the whole transaction rolls back') and spec 04's invariant 11 restricts only provider calls, so the code follows its spec. The shape is unchanged from the base; this diff only moved it under sendsOurOwnInvitation(provider.capabilities). Reported as the contradiction rather than settled.
- **N5** (note) `apps/web/app/org/[orgId]/documents/[envelopeId]/page.tsx:259` — `EnvelopeScreen` — envelope-certificate-link is rendered nowhere in apps/web, and EnvelopeDetail.provider.certificateIssued has no reader. Spec 02 treats the Certificate of Completion as a page inside the PDF, not a separate control, so TC-04-E2E-05's 'asserted absent' is vacuously true and would pass for an internal envelope. Either strike the id from the required-id list and the case's selectors, or render it when certificateIssued is true so the absence assertion has something it can fail against. Related to F11, which is the integration-level half of the same gap.
- **N6** (note) `apps/api/src/signature/internal-signing-provider.ts:69` — `InternalSigningProvider.createSession` — Blast radius, traced because it is the shape that would break executed contracts silently. The rewritten internal provider returns providerRef: request.envelopeId from createSession, so from this release every internal envelope carries a non-empty Envelope.providerRef where it previously held the default ''. Both existing provider-side queries are saved by a second predicate rather than by a provider check: envelope-sweep.service.ts:66-75 additionally requires pdfStatus = pending on a sent/partially_signed row, and provider-reconciler.service.ts:162-177 re-checks isRemotelyTrackedProvider. No internal behaviour changes today, but the protection is incidental — a future query filtering on providerRef alone would pull internal envelopes into the provider paths and set providerError on them.
- **N7** (note) `apps/api/src/documents/provider-reconciler.service.ts:116` — `ProviderReconcilerService.runJob` — runJob has no try/catch around converge, and JobQueue.safeDispatch logs a failed job and drops it with no retry. A convergence that throws therefore leaves the ProviderWebhookEvent row with processedAt = null and outcome = null permanently, and nothing reads the @@index([processedAt]) to close it. Envelope correctness is preserved by requirement 24's lazy read and hourly sweep, so this is a forensics gap rather than a state gap — but the index the Data Model specifies has no consumer.
- **N8** (note) `apps/api/src/documents/provider-reconciler.service.ts:142` — `convergeIfStale` — Edge case 16 names a column — 'Affected envelopes surface providerError = provider_unconfigured on read' — but both entry points return early when the adapter is not registered, so that write is unreachable from a read. The user-visible half is satisfied by a different mechanism: provider.unconfigured is computed from the registry at present time and the detail screen renders the spec's banner, so nothing stalls silently. Recorded because the spec names a column and the code answers with a computed field.
- **N9** (note) `apps/api/src/signature/signwell/signwell-http-client.ts:332` — `HttpSignWellClient.attempt` — Two off-by-one behaviours in the circuit breaker. (a) recordFailure() is called once more after the loop, on top of the per-iteration call, so one exhausted operation registers six failures against a threshold of five. (b) the 5xx branch continues without re-checking breakerIsOpen(), unlike the catch branch, so a 5xx storm keeps issuing requests after the breaker has opened — spending exactly the budget the blast-radius row says the breaker protects.
- **N10** (note) `apps/api/src/signature/signwell/signwell-signing-provider.ts:331` — `SignWellSigningProvider.signerAccess` — The recipient match in signerAccess is (candidate.id ?? '') === request.signerProviderRef || an email match. signerProviderRef is documented as 'Empty under internal', so an empty value is representable; against a document whose recipients carry no id, '' === '' matches recipients[0] and returns that signer's embedded_signing_url. The email arm makes the common path safe, which is why this is a note — but the id arm should require a non-empty ref before it can match.
- **N11** (note) `apps/api/src/documents/envelope-completion.ts:156` — `EnvelopeCompletionService.completeFromProvider` — providerError: reason stores error.message for any failure, and present() returns that column to every member of the organization. All the SignWell adapter's own errors are code-like strings, so today this is safe — but a Prisma or S3 error escaping the same catch would put an infrastructure message (query text, bucket, key) into an API response and into the providerError column.
- **N12** (note) `scripts/run-digest.mjs:79` — `describe` — digest.json is committed, and describe() copies the first 160 characters of every tool call's command, file_path, pattern, path or url verbatim into it with no redaction. shapeOf strips leading VAR=value prefixes for the rollup, but timeline[].what keeps the raw string, so any agent Bash call that inlines a credential (SIGNWELL_API_KEY=sk_... node ..., a curl with a bearer token, a psql URL with a password) is written into repository history.
- **N13** (note) `apps/web/app/org/[orgId]/settings/signing/page.tsx:179` — `SigningSettingsPage` — When the selected provider equals the stored one, Save emits toast-signing-provider-saved with the 'New documents will be signed through {provider}.' copy and issues no request. That is the id TC-04-E2E-01 asserts on, so the case's success signal can be produced by a path that saved nothing; and an admin who re-selects the current provider is told a change was saved when none was.
- **N14** (note) `apps/web/next.config.mjs:113` — `headers` — embedOrigin is interpolated into the CSP string with no validation. SIGNING_EMBED_ORIGIN='https://x.test; script-src *' at build time rewrites the policy rather than widening frame-src, and the file's own comment that script-src is not widened would then be false. Build-time only and operator-supplied, so hardening rather than a defect. Otherwise the change is exactly what the spec's blast-radius row describes: one origin added to frame-src, with script-src, frame-ancestors 'none' and Referrer-Policy untouched, scoped to /sign/:path*, and the rewrite block unchanged.
- **N15** (note) `apps/api/src/organizations/signing-settings.service.ts:202` — `SigningSettingsService.liveChecks` — The live connection check branches correctly on the capability (notifications !== 'webhook') but then always calls the injected SignWellHttpClient. A second webhook-capable provider would be reported reachable/webhookRegistered from SignWell's connectivity, not its own. Requirement 2's promise that a third provider needs no new if holds for the branch but not for the collaborator, and there is no health method on the port for the check to go through.
- **N16** (note) `apps/api/src/webhooks/webhook-rate-limit.guard.ts:33` — `WebhookRateLimiter` — The webhook rate-limit window is an in-process Map, so the effective limit is 600 per minute per source per task; with the service scaled to N tasks the documented figure is N x 600, and a restart forgets the window. Consistent with the existing SigningRateLimiter shape, so noted rather than raised as a defect of this change — but the spec states the limit per source.
- **N17** (note) `packages/validation/src/signwell-webhook.test.ts:7` — `imports` — Two unit suites now live in packages/validation but test code that lives in apps/api, importing it by relative path across the workspace root. npm run test:unit therefore compiles API sources. Safe today — packages/validation/tsconfig.json excludes test files so dist/ is unaffected — but a future import in signwell-notification.ts that pulls in @nestjs or Prisma breaks the validation unit run rather than the API one. CLAUDE.md describes packages/validation as 'validation rules and error messages, shared by web and API'.
- **N18** (note) `packages/validation/src/signwell-webhook.test.ts:88` — `TC-04-UNIT-04` — TC-04-UNIT-04's timing-safety case asserts only that two same-length wrong hashes are both rejected, which plain === also satisfies; nothing in the suite would fail if timingSafeEqual were replaced by string equality. The implementation is correct, so this is unproven rather than wrong. Separately, the 'no branch compares against signwell' test walks apps/api/src off disk from packages/validation and its regex catches only equality and case labels — startsWith, includes or an object-literal lookup would pass.
- **N19** (note) `e2e/playwright.config.ts:94` — `webServer[0].env` — SIGNWELL_DRIVER, SIGNWELL_API_KEY, SIGNWELL_API_APPLICATION_ID and SIGNWELL_WEBHOOK_SECRET are applied only when Playwright starts the API itself. With reuseExistingServer: !process.env.CI, a developer running the suite against an already-running npm run dev gets an API where SignWell is unconfigured, so TC-04-E2E-01/02/03/05 fail locally while passing in CI, and the failure presents as a disabled radio rather than naming its cause.
- **N20** (note) `.claude/ai-workflow.config.json:40` — `convergence` — This diff raises three pipeline budgets in the same change it is being judged by: maxCodeAttempts 5 to 8, infraRetries 2 to 3, stageTimeoutMin.review 15 to 20. No stage is disabled, no QA level is dropped, autoContestAfter and the review agent and model are unchanged, so the gate itself is not weakened — but the loop will now spend up to eight automated code attempts on one defect before handing the run to a person. Worth confirming this was intended rather than a workaround for a stage that kept failing.
- **N21** (note) `.claude/agents/code-reviewer.md:52` — `Reviewing again` — The new 'Reviewing again' section is a net strengthening, but item 3 ('Leave alone what an earlier pass judged, unless the diff has moved under it') is in tension with the paragraph above it ('Earlier verdicts come with the slice as claims to check, never conclusions you hold — contradict them freely'). A pass that wrongly cleared a file — the failure mode the section is written about, since sweeps clear items as well as raise them — is fenced off from the only agent that could catch it. scripts/review-coverage.mjs:118 prints the same instruction, so it reaches the reviewer twice.
- **N22** (note) `apps/api/.env.example:76` — `SignWell configuration block` — Four new configuration variables are read by the code but named nowhere in the spec's Infrastructure/Configuration table: SIGNING_EMBED_ORIGIN (web, build-time), SIGNWELL_API_BASE_URL, SIGNWELL_DRIVER and SIGNWELL_POLL_INTERVAL_MS. All are constant across environments so the 'anything differing beyond this table is a bug' contract is not violated, and the CSP blast-radius row alludes to 'a build-time variable' without naming it. Recorded so the table and the deployed reality stay in step.
- **N23** (note) `apps/api/test/signwell-reconcile.spec.ts:29` — `file docblock` — The file docblock cites 'requirements 22 and 30 — convergence, and the three ways it is reached'. Requirement 22 is the ProviderWebhookEvent dedupe key and requirement 30 is 'We never delete a completed document'; neither is what this file tests. The requirements it actually pins are 21, 23, 24a/24b and invariant 9. The most recent commit on this branch was specifically about stopping comments that cite the wrong thing, so this is in the same class.
- **N24** (note) `apps/api/src/documents/provider-reconciler.service.ts:617` — `getStaleSeconds` — getStaleSeconds uses Number(process.env.PROVIDER_SYNC_STALE_SECONDS) with a Number.isFinite guard. Number('') is 0, not NaN, so an env var set to the empty string yields a zero threshold and re-fetches on every read — the opposite of TC-04-INT-12's intent, and a shape a deployment tool that writes empty strings for unset values can produce.

## E1 — 5 заметок

- **N1** (note) `specs/documents/04-signature-providers.md:754` — `DS gaps` — Spec 04 has no DS gaps table, so the selectable provider-option row and the skeleton loading rows composed in ProviderOption.tsx are recorded only in the run's handoff. The screens use tokens rather than hardcoded values, so this is a bookkeeping gap rather than a design-system violation.
- **N2** (note) `apps/api/src/queue/job-queue.ts:23` — `JobQueue` — The doc comment claims renders for one envelope never run concurrently and that this is what makes the write-once PDF rule hold. That is an SQS FIFO message-group property; InlineJobQueue, used in dev and test, dispatches immediately with no per-envelope serialization. The guarantee actually comes from the `signedPdfKey IS NULL` updateMany guard in envelope-completion.ts. Related to F2, where no such guard exists.
- **N3** (note) `apps/api/test/signwell-send.spec.ts:487` — `TC-04-INT-03d` — Requirement 26's twenty-page orphan-scan cap is exercised only with a two-page list, so the bound itself — stop at twenty and fail with provider_unavailable — is never proved.
- **N4** (note) `apps/api/test/signwell-reconcile.spec.ts:1` — `edge cases 9 and 10` — Edge cases 9 and 10 — the provider reports a signer we do not have, or fewer signers than we have — are implemented at provider-reconciler.service.ts:258 and :271 and set providerError without deleting rows, but no reviewed test drives a signer-count or identity mismatch.
- **N5** (note) `scripts/review-coverage.mjs:49` — `coverage ledger` — The pipeline changes in this diff leave two review-coverage ledgers that disagree, and the prompts point at the weaker one. Recorded for the human because the gate's own rules are not mine to block on.

## E2 — 14 заметок

- **N1** (note) `apps/api/src/signature/signwell/signwell-signing-provider.ts:492` — `envelopeStatusFrom` — signwell-types.ts:58 documents 'Expired' as a status a SignWell document can reach and requirement 13 sends `expires_in`, but `envelopeStatusFrom` has no branch for it and falls through to `return 'sent'`, so a remotely-expired document reads as still active until our own sweep expires it independently. May be deliberate — `ProviderEnvelopeStatus` has no `expired` member — but the decision is not recorded anywhere.
- **N2** (note) `apps/api/src/documents/envelopes.service.ts:472` — `document` — The download endpoint reads status/pdfStatus without calling `convergeIfStale`, unlike `get()`. Defensible because it serves only terminal envelopes, but a caller hitting the download endpoint directly on a stale-but-actually-completed envelope gets a 404 and cannot make progress from that endpoint alone.
- **N3** (note) `apps/api/src/documents/envelopes.service.ts:815` — `send` — `openSession` calls `provider.createSession` before the transaction that re-checks the envelope is still `draft`, so two concurrent sends can both create a SignWell document for one envelope before the loser's `abandonSession` compensating delete runs. Self-healing and no corruption results, which is why this is a note.
- **N4** (note) `apps/web/app/org/[orgId]/documents/[envelopeId]/page.tsx:217` — `EnvelopeScreen` — The spec lists `envelope-certificate-link` as a required testid (asserted absent under SignWell), but no control with that id exists anywhere in apps/web under any provider, and none existed before this diff. Spec 02 appends the Certificate of Completion to the single downloadable PDF rather than offering a separate link, so spec 04 may be naming a control that was never built — which the spec's own note forbids ('An id for a control that already exists is not this spec's to name').
- **N5** (note) `apps/web/app/org/[orgId]/settings/signing/ChangeProviderModal.tsx:63` — `ChangeProviderModal` — 'New documents will be signed through {providerName}.' is inline rather than reusing `SIGNING_PROVIDER_MESSAGES.settings.saved(providerName)`, which produces the identical string and is used for the toast after the same action.
- **N6** (note) `apps/api/test/signwell-send.spec.ts:433` — `TC-04-INT-03a` — The final assertion checks only `signer.providerRef !== ''` — presence, not correct binding — so a swap between signer 1's and signer 2's recipient ids would still pass, which is weaker than requirement 38's stated verification.
- **N7** (note) `apps/api/test/signwell-send.spec.ts:594` — `TC-04-INT-22` — The invariant-11 check queries global `pg_stat_activity` for any connection idle in transaction, which is a process-wide proxy rather than a check scoped to the request under test; it could flake or mask depending on what else shares the database. Separately, it drives only the SignWell createSession path — see F1.
- **N8** (note) `e2e/tests/signature-providers.spec.ts:149` — `TC-04-E2E-01` — `getByTestId('signing-provider-option-internal').getByRole('radio')` narrows a testid-scoped locator by role rather than by a second data-testid. The same pattern already exists in account-settings, invitation, time-tracking, regressions, field-autofill and projects specs.
- **N9** (note) `apps/api/src/signature/signwell/signwell-signing-provider.ts:518` — `pollIntervalMs` — `SIGNWELL_POLL_INTERVAL_MS` is read from process.env but is absent from apps/api/.env.example, unlike every other SIGNWELL_* variable added here. It has a safe default, so this is documentation only.
- **N10** (note) `scripts/review-coverage.mjs:49` — `sizes` — review-coverage.mjs diffs without the `':(exclude).workflow'` pathspec that review-slice.mjs:71 and ship.mjs:121,126 both apply, so committed run artefacts under .workflow/runs/** enter its file list. Since no review ever opens those paths, it reports them as never-opened and points the next reviewer at the pipeline's own record first.
- **N11** (note) `scripts/wf.mjs:258` — `route` — route() decides pass/fail purely from the blocker count and never checks `covered.read + covered.unreached` against `covered.slice`, so the coverage invariant the reviewer is told to keep is unenforced by the pipeline. A verdict claiming `pass` while leaving most of the slice unreached would advance the run.
- **N12** (note) `scripts/run-digest.mjs:18` — `PIPELINE_FILES` — PIPELINE_FILES omits scripts/review-slice.mjs and scripts/review-coverage.mjs, both of which now shape reviewer behaviour, so the pipeline fingerprint would not change when they do.
- **N13** (note) `scripts/static-gate.mjs:90` — `rule 2 (no-detector-weakening)` — Rule 1 was changed to diff from `runStart` rather than `base` because `base` can predate the run under `--from` and misattribute earlier commits. Rule 2 still diffs from `base`, so it retains the exposure the comment describes as fixed.
- **N14** (note) `apps/web/app/org/[orgId]/settings/signing/page.tsx:223` — `SigningSettingsPage` — `signing-settings-loading` is a data-testid the spec never names. The spec's UI Description table and Required data-testid Attributes list every other id on this screen, and the loading state is described there ('Skeleton rows') without an id.

## E3 — 11 заметок

- **N1** (note) `apps/api/src/signing/signing.service.ts:117` — `applySignature call site` — Invariant 11 says 'Every adapter method is called before or after one, never within', with no carve-out; InternalSigningProvider.applySignature is called inside a Prisma transaction. The invariant's own stated reason (a five-attempt backoff holding a row lock) does not apply to a provider that never touches the network, and requirement 10 forbids moving the call by editing spec 02's suite. The code satisfies the invariant's intent and the first sentence's 'provider call'; only the second sentence's absolute phrasing is over-broad. Worth a human's eye because a future reader will hit the same tension.
- **N2** (note) `apps/api/src/signature/signwell/signwell-http-client.ts:170` — `call` — Only createDocument threads organizationId into call(); getDocument, listDocuments, deleteDocument, completedPdf, ping and hooks all serialize under one global key. Stricter rather than laxer, so no race follows, but one organization's synchronous lazy re-fetch head-of-line-blocks every other organization's reads.
- **N3** (note) `apps/api/src/signature/signwell/signwell-http-client.ts:310` — `attempt` — A non-2xx that is not 5xx, 429 or 404 falls through to recordSuccess(), resetting consecutiveFailures. A rotated SIGNWELL_API_KEY producing a persistent 401 therefore never opens the breaker, and every call keeps making a live network attempt against a deterministic, unrecoverable fault.
- **N4** (note) `packages/validation/src/envelopes.ts:91` — `EnvelopeEventType` — `provider_error` is added to the enum, the migration and the updated TC-02-UNIT-02 assertion, but nothing writes an event of that type. recordProviderError sets the Envelope.providerError column only. A live enum value with no writer.
- **N5** (note) `apps/api/test/signwell-send.spec.ts:487` — `TC-04-INT-03d` — Orphan recovery is tested over two pages only. Nothing drives the scan to the twenty-page cap, so a regression removing or mis-setting ORPHAN_SCAN_PAGE_CAP would not be caught.
- **N6** (note) `apps/api/test/signing-settings.spec.ts:106` — `TC-04-INT-16` — Demoted from shard 6's blocker. TC-04-INT-16 exercises only target-enum roles, never the legacy `member` the database still holds. But the code does satisfy CLAUDE.md:91: hasCapability (packages/validation/src/roles.ts:122-124) routes through normalizeRole, and roles.test.ts:319,324 covers `member` against both new capabilities. The gap is integration coverage through the full guard stack, not an authorization defect, so it does not block.
- **N7** (note) `apps/web/app/org/[orgId]/settings/signing/ProviderOption.tsx:116` — `ProviderOption` — Demoted from shard 5's blocker. The unconfigured caption 'Missing: {list}. Set them in the environment, then reload this page.' is inline rather than in packages/validation, and the sibling message unconfiguredInFlight is centralized in the same changeset. Not blocking: CLAUDE.md:49 governs validation message text, this is a static caption composed client-side from data the API supplies, and the rule's stated purpose — 'so web and API cannot disagree' — cannot be violated because the API never sends this string.
- **N8** (note) `e2e/tests/signature-providers.spec.ts:327` — `TC-04-E2E-05` — `expect(getByTestId('envelope-certificate-link')).toHaveCount(0)` can never fail: no component in apps/web renders that testid, and spec 02 never named it either, so no control by that name exists for any provider. Requirement 28's web-visible half has no coverage. Reached independently by shard 5 and by me; an earlier round of this run's history raised it and it was not resolved.
- **N9** (note) `e2e/tests/signature-providers.spec.ts:175` — `TC-04-E2E-02` — The blast-radius row names TC-04-E2E-02 as what catches a too-narrow frame-src: 'frame-src is 'self', so the embedded widget is refused by the browser outright — TC-04-E2E-02 fails and no counterparty can sign anywhere.' It cannot. The stub's embedded_signing_url points at our own origin (apps/api/src/test-support/signwell-stub.controller.ts:54-61, which says so deliberately), so frame-src 'self' already admits it and the test passes with the widening removed entirely. The stub's reasoning is sound and follows the spec's own rule that nothing in the suite touches SignWell, so the defect is the blast-radius claim, not the stub.
- **N10** (note) `.claude/ai-workflow.config.json:41` — `convergence` — maxCodeAttempts rose 5 to 8, infraRetries 2 to 3 and the review stage timeout 15 to 20, by the run these budgets gate, inside a 52-line Prettier reformat that makes three numeric changes easy to miss. The file's own $comment still reads 'Retry is the exception.' Reached independently by shard 7 and by me; shard 7 notes a prior run's implement stage needed six attempts, which is the number the new budget accommodates.
- **N11** (note) `specs/documents/04-signature-providers.md:526` — `requirement 40` — Requirement 40 was edited in this diff from delete-then-converge to delete-then-settle, removing a re-read, and envelopes.service.ts:1309 already implements the post-edit wording verbatim — the shape of a spec bent to match written code. I checked the reasoning and judge it a genuine correction: requirements 41 and 42 require the reconciler to stop calling once a void is settled and to read 404 on a voided envelope as the settled state, so the old re-read contradicted both and no implementation could satisfy all three. Recorded so the edit is visible rather than silent.

## E17 — 8 заметок

- **F5** (note) `e2e/tests/signature-providers.spec.ts:327` — `TC-04-E2E-05` — `envelope-certificate-link` names a control that has never existed under any provider, so the E2E assertion that it is absent is vacuously true and proves nothing about requirement 28.
- **F6** (note) `scripts/review-coverage.mjs:87` — `openedIn` — The coverage matcher compares a forward-slash git path against a backslash Windows file_path with no normalization, so on this host no Read call ever registers and every file reports as never opened.
- **F7** (note) `apps/web/app/sign/[token]/EmbeddedSigning.tsx:80` — `message listener` — Completion is detected by the substring 'complet', which also matches 'incomplete', so a message meaning the opposite would show the signer the completion confirmation.
- **F8** (note) `apps/api/.env.example:62` — `SIGNATURE_PROVIDER` — The legacy SIGNATURE_PROVIDER variable and its comment survive in .env.example although nothing reads it any more — provider selection moved to Organization.signatureProviderKey (requirement 1).
- **F9** (note) `apps/api/src/signature/signwell/signwell-signing-provider.ts:492` — `envelopeStatusFrom` — SignWell's 'Expired' document status has no branch and falls through to 'sent', so a document expired on their side would read as still open.
- **F10** (note) `apps/api/src/webhooks/webhook-rate-limit.guard.ts:60` — `WebhookRateLimitGuard.canActivate` — The 600/min limit keys on a client-supplied X-Forwarded-For value, so an attacker can mint a fresh bucket per request and both evade the throttle and grow an in-memory map that never evicts.
- **F11** (note) `apps/api/src/signature/signwell/signwell-signing-provider.ts:518` — `pollIntervalMs` — SIGNWELL_POLL_INTERVAL_MS is a behaviour-affecting environment variable that appears in neither the spec's Configuration table nor .env.example.
- **F12** (note) `specs/documents/04-signature-providers.md:1494` — `TC-04-INT-20` — TC-04-INT-20 is the only spec 04 test case with no id reference anywhere in the code.

## E19 — 11 заметок

- **N1** (note) `apps/api/src/documents/signwell-text-tags.ts:129` — `translateToTextTags` — The requirement-14(c) residual assertion uses /\{\{([^{}]*)\}\}/g, which only matches balanced pairs. A sender value carrying an unmatched `{{` with no later `}}` anywhere in the document survives translation unflagged and unhidden. I verified this is narrower than it first appears: an unmatched brace produces no SignWell field, so it cannot create the invisible extra field requirement 14(d) is written against — it can only print literal text — and the spec's own wording is `{{…}}`, a pair. Kept at note for that reason rather than demoted arbitrarily.
- **N2** (note) `scripts/review-coverage.mjs:87` — `openedIn` — The coverage ledger cannot match a Read on Windows: `text.includes(path)` compares a backslash file_path from the journal against forward-slash paths from `git diff --numstat`, so plain Read calls never register and only Bash/git invocations do. I confirmed this at line 87 and against the backslash file_path recorded in this run's events.jsonl. It fails in the safe direction — files that were read are reported unread, causing over-review rather than a skipped file — and it did not affect this pass, which is pass 1 and does not consult it. It does affect every later pass, and .claude/agents/code-reviewer.md was changed in this diff to instruct reviewers to rely on it.
- **N3** (note) `apps/web/app/sign/[token]/EmbeddedSigning.tsx:142` — `iframe` — The embed iframe carries allow="camera; microphone; clipboard-write". No requirement in spec 04 asks for camera or microphone, and requirement 15 is explicit that this integration widens exactly one thing (frame-src) and nothing else. Delegating camera and microphone to a third-party origin on the one session-less page in the product, with no stated requirement behind it, deserves a decision rather than a default. No written rule forbids it, so it cannot block.
- **N4** (note) `apps/api/test/signwell-send.spec.ts:487` — `TC-04-INT-03d` — Requirement 26's twenty-page orphan-scan cap has no test. The adapter exports ORPHAN_SCAN_PAGE_CAP = 20 and the tests never import or assert against it, unlike the sibling polling bound which gets a dedicated case (TC-04-INT-03c asserts the call count equals CREATE_POLL_ATTEMPTS exactly). A regression that scanned unboundedly, or stopped at the wrong page, would pass.
- **N5** (note) `packages/validation/src/signwell-webhook.test.ts:7` — `imports` — This test and signwell-text-tags.test.ts import implementation modules from apps/api via ../../../, inverting the dependency direction CLAUDE.md describes in one direction only ("packages/validation/ ... shared by web and API"). It is self-documented as deliberate and consistent across both files, but it makes `npm run test:unit` in packages/validation depend on apps/api's source tree being present and syntactically valid.
- **N6** (note) `apps/api/src/signature/signwell/signwell-http-client.ts:77` — `RouteFamily` — RouteFamily declares a 'create-hook' member matching requirement 19's observed POST /hooks limit of 30, but no method ever passes it to call() — webhook registration is an out-of-band step and hooks() is a GET using 'read'. Dead type member.
- **N7** (note) `specs/documents/04-signature-providers.md:1135` — `Required data-testid Attributes / TC-04-E2E-05` — envelope-certificate-link is named in the spec and asserted absent by TC-04-E2E-05, but no control anywhere in apps/web bears that id under any provider — a case-insensitive grep for 'certificate' across apps/web finds only the certificateIssued boolean added to apps/web/src/documents/envelopes.ts by this diff and never read by a component. The assertion is therefore vacuously true and distinguishes nothing. Requirement 28 is genuinely proved at TC-04-INT-09, which asserts detail.body.certificateUrl is undefined, and CLAUDE.md's level rule puts it there, so nothing is unproved — but the E2E selector claims a coverage it does not have.
- **N8** (note) `packages/validation/src/envelopes.ts:94` — `EnvelopeEventType` — provider_error is added to the enum, to the migration and to the web's event-label map, but no code path ever writes an EnvelopeEvent of that type — grep for 'provider_error' across apps/api/src returns no record() call. The providerError column is used actively; the event value is dead. The spec's Data Model only says the enum 'gains' the value and no functional requirement names what should trigger it, so this is closer to spec silence than a code defect.
- **N9** (note) `packages/validation/src/envelopes.test.ts:404` — `TC-02-UNIT-02` — Requirement 10 permits exactly one edit to spec 02's suite — "That single assertion may be updated to seventeen. Nothing else in spec 02's suite may be touched." The diff updates the count and also renames the test and adds two toContain assertions. Read strictly that is more than the single assertion; read for intent it is the enumerated exception plus two assertions that strengthen rather than weaken, and no spec 02 behaviour moved. I checked the rest: no other spec 02 test file is modified in this diff. Recorded rather than blocked because blocking would ask the implementer to delete assertions that make the change safer.
- **N10** (note) `apps/api/.env.example:76` — `configuration` — Three configuration items exist in code but in no spec table: SIGNWELL_API_BASE_URL and SIGNWELL_DRIVER (added to .env.example and read by signature.provider.ts and signwell-http-client.ts), and SIGNING_EMBED_ORIGIN (read at build time by apps/web/next.config.mjs to widen frame-src). The spec's Infrastructure > Configuration table lists five variables and none of these. All three have working defaults so nothing breaks, and SIGNWELL_DRIVER is correctly refused in production, but a config item that gates the CSP of the session-less signing page is worth naming in the table it belongs to.
- **N11** (note) `.claude/ai-workflow.config.json:54` — `convergence / breakers` — Checked specifically for gate-weakening, by me and by shard 3 independently. The committed diff only reformats JSON and raises budgets — maxCodeAttempts 5->8, infraRetries 2->3, review stageTimeoutMin 15->20. No stage is disabled; static_gate, review and qa remain enabled with levels [unit, int, e2e] and skipE2eIfLowerFailed true. scripts/static-gate.mjs's rule-1 change (base -> headAtInit) correctly narrows spec-immutability to the current run's own commits rather than the whole diff, and falls back to base when headAtInit is absent. I found no weakening. Recorded because a diff that edits its own review gate should say so out loud.

