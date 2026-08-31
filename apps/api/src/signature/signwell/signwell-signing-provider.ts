import { Injectable, Logger } from "@nestjs/common";
import type { ProviderCapabilities } from "@devscribed/validation";
import { PdfRenderer } from "../../pdf/pdf-renderer";
import { parseSignWellNotification } from "../../webhooks/signwell-notification";
import {
  CancelRequest,
  CompletedDocument,
  ConnectionChecked,
  CompletedDocumentRequest,
  CreateSessionRequest,
  CreatedSession,
  ExpectedProviderField,
  ParsedNotification,
  ProviderDocumentGoneError,
  ProviderFieldsNotMaterializedError,
  ProviderSignerState,
  ProviderSignerStatus,
  ProviderConnection,
  ProviderState,
  ProviderUnavailableError,
  RawNotification,
  RemotelyTracked,
  SignerAccess,
  SignerAccessRequest,
  SigningProvider,
} from "../signing-provider";
import { readSignWellFieldBoxes } from "../../documents/signwell-text-tags";
import type { SignWellFieldBox } from "../../documents/signwell-text-tags";
import { SignWellHttpClient } from "./signwell-http-client";
import { describeDocument } from "./signwell-projection";
import { flattenFields } from "./signwell-types";
import type {
  SignWellCreateDocumentBody,
  SignWellCreateField,
  SignWellDocument,
} from "./signwell-types";

/** The document is `Created` until their asynchronous parse has read the file. */
const STATUS_CREATED = "Created";

/**
 * Requirement 14e — every field sits on the execution page, which the copy hoists to the
 * front, so the page number is a constant rather than something measured off a render.
 */
const EXECUTION_PAGE_NUMBER = 1;

/** Requirement 38 — at most ten attempts over thirty seconds. */
export const CREATE_POLL_ATTEMPTS = 10;
const DEFAULT_POLL_INTERVAL_MS = 3_000;

/** Requirement 26 — the client-side scan stops here rather than paging forever. */
export const ORPHAN_SCAN_PAGE_CAP = 20;

/**
 * The SignWell adapter.
 *
 * Everything peculiar about SignWell is in this directory and nowhere else: the rest of
 * the application branches on `capabilities`, never on the key, and TC-04-UNIT-05 makes
 * that a test rather than an intention.
 */
/**
 * `embedded_signing_url` is the ordinary signing page — the same address a signer would be
 * emailed — and the provider serves it with `X-Frame-Options: SAMEORIGIN`. It drops that
 * header only when asked to, by a parameter that appears in no API response and in no field
 * name: `signwell_embedded_iframe=1`. Their embed script exists to add it (BUG-003).
 *
 * `searchParams` rather than concatenation, because a URL that already carries a query
 * string is not ours to assume away. A URL we cannot parse is returned untouched: framing
 * will fail, and a frame that fails is visible, where a mangled URL is not.
 */
export function embeddable(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("signwell_embedded_iframe", "1");
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * The grid is in PDF points, because that is what the renderer lays the page out in.
 * SignWell places fields in **CSS pixels at 96dpi** — its own viewer draws an A4 page 794
 * pixels wide, which is 210mm at 96dpi and not the 595 points the PDF is measured in.
 *
 * Sending points is not an error the provider can see: it accepts them, stores them, and
 * draws the field a third of the way up the page from where it belongs. A signature landed
 * on the execution page's heading instead of the first signer's line (BUG-003), which is
 * the only way this is ever noticed — the API echoes back exactly what it was given.
 */
const POINTS_TO_PROVIDER_PIXELS = 96 / 72;

export function toProviderUnits(points: number): number {
  return Math.round(points * POINTS_TO_PROVIDER_PIXELS * 100) / 100;
}

@Injectable()
export class SignWellSigningProvider
  extends SigningProvider
  implements RemotelyTracked, ConnectionChecked
{
  readonly key = "signwell";

  /** Requirement 11, exactly. */
  readonly capabilities: ProviderCapabilities = {
    // Requirement 12: the invitation is ours, from our SES identity, linking to our own
    // `/sign/{token}` — the counterparty never receives mail from a vendor they have no
    // relationship with, and the link cannot outlive our access control.
    invitationMail: "ours",
    signingSurface: "embedded",
    completedDocument: "provider",
    notifications: "webhook",
    signingOrder: "provider",
  };

  private readonly log = new Logger(SignWellSigningProvider.name);

  constructor(
    private readonly http: SignWellHttpClient,
    private readonly renderer: PdfRenderer,
  ) {
    super();

    // VALIDATION RULE 6 — at boot, not at send. This class is a provider of the global
    // `CoreModule`, so Nest instantiates it while the container is coming up: a throw here
    // is a container that refuses to start, which is exactly what the rule asks for. The
    // return value is deliberately discarded — the per-send read below is the one that
    // decides the outgoing `test_mode`, and this call only makes a malformed value fatal
    // where an operator is still watching a deploy.
    //
    // Parsing it lazily was wrong in a way worth naming: with `SIGNWELL_TEST_MODE=yes` the
    // API booted healthy, the settings screen reported SignWell configured and in test
    // mode, and the misconfiguration first appeared to a sender as a 503 "Signing service
    // is unavailable" — the provider blamed for a deployment error.
    testModeFromEnvironment();
  }

  /* -------------------------------------------------------------- *
   * createSession — and the two things that make it more than one call
   * -------------------------------------------------------------- */

  async createSession(request: CreateSessionRequest): Promise<CreatedSession> {
    // Before the render, because a field list we cannot build is a send that must spend
    // nothing: no PDF, no create, no document to delete afterwards.
    const fields = this.fieldsFor(request);

    const pdf = await this.renderer.render(request.documentHtml);

    // The recipient id is the signing order, deliberately: our field list binds by
    // recipient number, so the two have to agree and the cheapest way to guarantee that is
    // to make them the same value.
    const recipients = [...request.signers]
      .sort((a, b) => a.order - b.order)
      .map((signer) => ({
        id: String(signer.order),
        name: signer.name,
        email: signer.email,
        signing_order: signer.order,
        // We send the mail. `embedded_signing_notifications: false` below says the same
        // thing at the document level; this says it per recipient.
        send_email: false as const,
      }));

    const body: SignWellCreateDocumentBody = {
      test_mode: testModeFromEnvironment(),
      draft: false,
      files: [
        {
          name: `${sanitizeFileName(request.title)}.pdf`,
          file_base64: pdf.toString("base64"),
        },
      ],
      recipients,
      apply_signing_order: true,
      // Requirement 13: SignWell parses the file and materializes nothing from it. Asking
      // it to look was the whole of BUG-001.
      text_tags: false,
      // Grouped per file, and there is one file.
      fields: [fields],
      embedded_signing: true,
      embedded_signing_notifications: false,
      reminders: false,
      expires_in: Math.max(1, Math.ceil(request.expiresInDays)),
      name: request.title,
      metadata: {
        envelope_id: request.envelopeId,
        organization_id: request.organizationId,
      },
      allow_decline: true,
      allow_reassign: false,
      ...(process.env.SIGNWELL_API_APPLICATION_ID
        ? { api_application_id: process.env.SIGNWELL_API_APPLICATION_ID }
        : {}),
    };

    const created = await this.createOrAdopt(
      body,
      request.envelopeId,
      request.adoptExisting === true,
    );
    const providerRef = created.id ?? "";
    if (!providerRef) {
      throw new ProviderUnavailableError(
        "provider_unavailable",
        "created_without_an_id",
      );
    }

    // REQUIREMENT 38 — the send is not finished when the create returns. Reaching `Sent`
    // is asynchronous: the 201 comes back with `status: "Created"`, `pages_number: 0` and
    // `fields: []` even when the request supplied a complete field list.
    const settled = await this.pollUntilParsed(providerRef);
    await this.verifyMaterialized(providerRef, settled, request);

    return {
      providerRef,
      testMode: settled.test_mode ?? body.test_mode,
      providerStatus: settled.status ?? null,
      signerRefs: Object.fromEntries(
        request.signers.map((signer) => [signer.id, String(signer.order)]),
      ),
    };
  }

  /**
   * Requirement 14d — the field list, and the last place it can be refused for free.
   *
   * Every field is matched to a box the copy carries, written by the same renderer that
   * drew the row it sits on. Nothing here recomputes the grid, and nothing here invents a
   * coordinate: a field with no box — a tenth field on a nine-row page, a signer whose
   * signature block is missing — refuses the send **before** the PDF is rendered and before
   * a document exists. That is the whole difference between a refusal and an orphan.
   */
  private fieldsFor(request: CreateSessionRequest): SignWellCreateField[] {
    const roleOf = new Map(request.signers.map((s) => [s.id, s.roleKey]));
    const recipientOf = new Map(request.signers.map((s) => [s.id, String(s.order)]));
    const nameOf = new Map(
      request.signers.map((s) => [s.id, `${s.name} (signer ${s.order})`]),
    );

    const boxes = readSignWellFieldBoxes(request.documentHtml).map((box) => ({
      box,
      claimed: false,
    }));

    const fields: SignWellCreateField[] = [];
    const unplaced: string[] = [];
    let texts = 0;

    for (const expected of request.expectedFields) {
      const ref =
        expected.type === "signature"
          ? (roleOf.get(expected.signerId) ?? "")
          : (expected.fieldKey ?? "");
      const match = boxes.find(
        (candidate) =>
          !candidate.claimed &&
          candidate.box.kind === expected.type &&
          candidate.box.ref === ref,
      );

      if (!match) {
        unplaced.push(describeExpectedField(expected, nameOf));
        continue;
      }
      match.claimed = true;

      const recipientId = recipientOf.get(expected.signerId) ?? "";
      fields.push({
        // Unique within the document, and readable in a redacted payload — the projection
        // and the redactor both keep `api_id` and drop everything else.
        api_id:
          expected.type === "signature"
            ? `Signature_${recipientId}`
            : `Text_${++texts}`,
        type: expected.type,
        recipient_id: recipientId,
        // Requirement 14e — the execution page is the first page of the copy, always.
        page: EXECUTION_PAGE_NUMBER,
        x: toProviderUnits(match.box.x),
        y: toProviderUnits(match.box.y),
        width: toProviderUnits(match.box.width),
        height: toProviderUnits(match.box.height),
        required: expected.required,
      });
    }

    if (unplaced.length > 0) {
      throw new ProviderFieldsNotMaterializedError(
        "document_fields_not_placed",
        unplaced,
        boxes.map((candidate) => describeBox(candidate.box)),
      );
    }

    // In reading order down the execution page, which is the order somebody checking the
    // request against the document would look for them in.
    fields.sort((a, b) => a.y - b.y || a.x - b.x);
    return fields;
  }

  /**
   * Requirement 26 — `POST /documents` is not idempotent and our retry must not create two
   * documents for one envelope.
   *
   * **The search is client-side, and that is not a preference.** Observed: `GET /documents`
   * exists (undocumented) and returns `metadata` on each row, but it **silently ignores
   * filters** — `?metadata[envelope_id]=` with a value matching nothing still returned
   * every document. A filter that is ignored rather than rejected is the most dangerous
   * kind, because the naive implementation of this requirement would "find" an unrelated
   * document and adopt it, attaching our envelope to somebody else's contract. That is
   * worse than the duplicate it was trying to prevent.
   *
   * So: page the list, compare `metadata.envelope_id` in our own code, adopt only on an
   * exact match, stop after twenty pages. If the list is unavailable or the cap is reached,
   * the send fails and the envelope stays `draft` — a failed send is recoverable, a
   * misattributed contract is not.
   */
  private async createOrAdopt(
    body: SignWellCreateDocumentBody,
    envelopeId: string,
    adoptExisting: boolean,
  ): Promise<SignWellDocument> {
    // Edge case 4 — the previous send created a document, failed to pin it, and could not
    // delete it either. Creating now would leave that one open forever with the real
    // counterparties on it and a live `embedded_signing_url` each, unreachable by us and
    // answering every webhook it fires with `unknown_ref`. So when the send path says an
    // orphan may exist, we look **before** creating rather than only after a create that
    // failed. A scan that cannot complete fails the send with the envelope still `draft`,
    // which is requirement 26's own stance: a failed send is recoverable, a second live
    // contract is not.
    if (adoptExisting) {
      const orphan = await this.findOrphan(envelopeId);
      if (orphan) {
        this.log.warn(
          `Adopting SignWell document ${orphan.id} left by an earlier send of envelope ${envelopeId}`,
        );
        return orphan;
      }
    }

    try {
      /*
       * The scan is handed to the client rather than only wrapped around it, and that is
       * requirement 26 taken literally: "**before** retrying a create that failed without
       * a response, the client looks for a document already carrying this envelope's id".
       * The client retries five times, so a check that only ran after all five had failed
       * would be four repeats too late — and each repeat can create a live document with
       * the real counterparties and a working signing link on it. Passing it in means the
       * lookup happens between attempts, which is the only place that prevents the
       * duplicate rather than describing it afterwards.
       */
      return await this.http.createDocument(body, () =>
        this.findOrphan(envelopeId),
      );
    } catch (error) {
      if (!(error instanceof ProviderUnavailableError)) throw error;
      /*
       * The last attempt has no "before the next retry" to run in, so the scan runs once
       * more here. It is not redundant with the guard above: a create that landed on the
       * fifth attempt was never followed by a sixth.
       */
      this.log.warn(
        `Creating a SignWell document for envelope ${envelopeId} failed; looking for an orphan. ${JSON.stringify(error)}. Body ${JSON.stringify(body)}`,
      );
      const adopted = await this.findOrphan(envelopeId);
      if (adopted) return adopted;
      throw error;
    }
  }

  private async findOrphan(
    envelopeId: string,
  ): Promise<SignWellDocument | null> {
    for (let page = 1; page <= ORPHAN_SCAN_PAGE_CAP; page++) {
      const list = await this.http.listDocuments(page);
      for (const document of list.documents ?? []) {
        const metadata = (document.metadata ?? {}) as Record<string, unknown>;
        // Our own comparison, on the whole value. The rows the ignored filter returned
        // are simply skipped.
        if (metadata.envelope_id === envelopeId) return document;
      }
      const next = list.next_page;
      if (next === null || next === undefined) return null;
    }
    // The cap is reached: refuse rather than adopt something unverified.
    throw new ProviderUnavailableError(
      "provider_unavailable",
      "orphan_scan_cap_reached",
    );
  }

  private async pollUntilParsed(
    providerRef: string,
  ): Promise<SignWellDocument> {
    let last: SignWellDocument | null = null;

    for (let attempt = 0; attempt < CREATE_POLL_ATTEMPTS; attempt++) {
      const document = await this.http.getDocument(providerRef);
      if (document) {
        last = document;
        if ((document.status ?? STATUS_CREATED) !== STATUS_CREATED)
          return document;
      }
      if (attempt < CREATE_POLL_ATTEMPTS - 1) await sleep(pollIntervalMs());
    }

    // Edge case 23 — a `201` whose document never leaves `Created`. The document is
    // deleted rather than left open.
    await this.deleteQuietly(providerRef);
    throw new ProviderFieldsNotMaterializedError(
      "document_fields_not_materialized",
      ["a parsed document"],
      [last?.status ?? "no response"],
    );
  }

  /**
   * Requirement 38's second half, and the question it asks has changed: not "did SignWell
   * find our tags", which could only ever be answered no, but "did SignWell keep the fields
   * we sent".
   *
   * Still not a warning. A document that settles with fewer fields than the request carried
   * is a contract with a missing signature line, which nobody notices until a counterparty
   * cannot sign it — or worse, signs a document whose other party never can.
   *
   * The `page` and the coordinates that come back are deliberately not asserted: they are
   * our own arithmetic echoed, and an echo cannot fail.
   */
  private async verifyMaterialized(
    providerRef: string,
    document: SignWellDocument,
    request: CreateSessionRequest,
  ): Promise<void> {
    const recipientOf = new Map(
      request.signers.map((s) => [s.id, String(s.order)]),
    );
    const nameOf = new Map(
      request.signers.map((s) => [s.id, `${s.name} (signer ${s.order})`]),
    );

    const received = flattenFields(document.fields).map((field) => ({
      type: (field.type ?? "").toLowerCase(),
      recipientId: field.recipient_id ?? "",
      required: field.required === true,
      apiId: field.api_id ?? "",
      claimed: false,
    }));

    const missing: string[] = [];

    for (const expected of request.expectedFields) {
      const recipientId = recipientOf.get(expected.signerId) ?? "";
      const match = received.find(
        (field) =>
          !field.claimed &&
          field.type === expected.type &&
          field.recipientId === recipientId &&
          field.required === expected.required,
      );
      if (match) {
        match.claimed = true;
        continue;
      }
      missing.push(describeExpectedField(expected, nameOf));
    }

    if (missing.length === 0) return;

    // Only the projection is ever logged — never the document, which carries field values
    // and a live signing URL per recipient (requirements 35, 36).
    this.log.error(
      `SignWell document ${providerRef} did not materialize the expected fields: ${describeDocument(
        document,
      )}`,
    );
    // Edge case 24 — deleted rather than left open, because a contract with a missing
    // signature line is not a document anyone should be able to reach.
    await this.deleteQuietly(providerRef);
    throw new ProviderFieldsNotMaterializedError(
      "document_fields_not_materialized",
      missing,
      received.map(
        (field) => `${field.type}:${field.recipientId}:${field.apiId}`,
      ),
    );
  }

  private async deleteQuietly(providerRef: string): Promise<void> {
    try {
      await this.http.deleteDocument(providerRef);
    } catch (error) {
      this.log.error(
        `Could not delete the unusable SignWell document ${providerRef}: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }

  /* -------------------------------------------------------------- *
   * signerAccess
   * -------------------------------------------------------------- */

  /**
   * Requirement 15. The URL is read fresh and handed straight back — never persisted,
   * never cached, never logged. Observed, it is a stable short link returned at creation
   * for **every** recipient, so it is neither a nonce nor short-lived; the reason for
   * re-fetching is not freshness but that storing it would create a second credential for
   * the document, one our own access control does not gate and our token expiry does not
   * reach.
   */
  async signerAccess(request: SignerAccessRequest): Promise<SignerAccess> {
    const document = await this.http.getDocument(request.providerRef);
    if (!document) {
      throw new ProviderUnavailableError(
        "provider_unavailable",
        "document_not_found",
      );
    }

    const recipient = (document.recipients ?? []).find(
      (candidate) =>
        (candidate.id ?? "") === request.signerProviderRef ||
        (candidate.email ?? "").toLowerCase() ===
          request.signerEmail.toLowerCase(),
    );

    return {
      embeddedSigningUrl: embeddable(recipient?.embedded_signing_url),
      providerStatus: document.status ?? null,
    };
  }

  /* -------------------------------------------------------------- *
   * completedDocument
   * -------------------------------------------------------------- */

  /**
   * Requirement 17. Completion is established from `GET /documents/{id}` **first**, and
   * only then is the download attempted.
   *
   * Observed: on a document that exists but is not complete, `completed_pdf` answers `404`
   * with `meta.error = "record_not_found"` — **the same body a genuinely unknown id
   * produces**. A `404` there therefore carries no information at all and must never be
   * read as "the document is gone"; it is a transient to retry (edge case 29).
   */
  async completedDocument(
    request: CompletedDocumentRequest,
  ): Promise<CompletedDocument> {
    const document = await this.http.getDocument(request.providerRef);
    if (!document) {
      throw new ProviderUnavailableError(
        "provider_unavailable",
        "document_not_found",
      );
    }
    if (normalizeStatus(document.status) !== "completed") {
      throw new ProviderUnavailableError(
        "provider_unavailable",
        "document_not_completed",
      );
    }

    const bytes = await this.http.completedPdf(request.providerRef);
    if (!bytes) {
      throw new ProviderUnavailableError(
        "provider_unavailable",
        "completed_pdf_not_ready",
      );
    }

    return { bytes, providerRef: request.providerRef };
  }

  /* -------------------------------------------------------------- *
   * cancel
   * -------------------------------------------------------------- */

  /**
   * Requirement 18 — SignWell exposes **no cancel or void route at all**. Confirmed
   * against the endpoint index: `POST /documents/{id}/send` only updates and sends a
   * draft. The single mechanism that stops an in-flight document is
   * `DELETE /documents/{id}`, a hard delete which, in their own words, "will also cancel
   * document signing (if in progress)".
   *
   * That is the correct trade and not merely the only one available: leaving the document
   * open would leave a counterparty holding a working signing URL for a contract we
   * consider void.
   */
  async cancel(request: CancelRequest): Promise<void> {
    const outcome = await this.http.deleteDocument(request.providerRef);
    if (outcome === "not_found") {
      // Edge case 26 — already gone. Our void must not be blocked by their state, so this
      // is reported rather than thrown away, and the caller voids locally anyway.
      throw new ProviderDocumentGoneError(request.providerRef);
    }
  }

  /* -------------------------------------------------------------- *
   * RemotelyTracked
   * -------------------------------------------------------------- */

  async parseNotification(
    raw: RawNotification,
  ): Promise<ParsedNotification | null> {
    return parseSignWellNotification(
      raw.body,
      process.env.SIGNWELL_WEBHOOK_SECRET,
      this.key,
    );
  }

  /**
   * Requirement 31 and 32 — the two live checks the settings screen shows beside this
   * option, and which are never a gate on selecting it. Both are best effort: a provider
   * we cannot reach is still selectable, because no deployed environment has a public
   * address SignWell can reach and those environments run correctly on convergence alone.
   *
   * The hooks read is not tidiness. A registration outlives the address it names, and
   * every delivery carries a working `embedded_signing_url` per recipient — so a
   * registration pointing at a hostname that is no longer ours hands the ability to sign
   * as a recipient to whoever answers there. Reading it here puts that on a screen
   * instead of in someone's memory.
   */
  async checkConnection(): Promise<ProviderConnection> {
    let reachable = false;
    let webhookRegistered = false;
    try {
      reachable = await this.http.ping();
      if (reachable) webhookRegistered = (await this.http.hooks()).length > 0;
    } catch (error) {
      this.log.warn(
        `The SignWell connection check failed: ${error instanceof Error ? error.message : error}`,
      );
    }

    return { reachable, webhookRegistered, testMode: testModeForDisplay() };
  }
  /**
   * The **only** source of remote state (requirement 7). Everything the reconciler writes
   * comes from here and nothing comes from a notification body — which is what makes
   * replay, reordering and duplicate delivery harmless by construction.
   */
  async fetchState(providerRef: string): Promise<ProviderState> {
    const document = await this.http.getDocument(providerRef);

    if (!document) {
      // Whether a missing document is a settled void or a provider fault is **our**
      // decision, from our own rows — requirement 42, edge cases 27 and 28. The adapter
      // reports what it saw and decides nothing.
      return {
        exists: false,
        status: "canceled",
        providerStatus: "not_found",
        signers: [],
        declineReason: null,
        completedAt: null,
      };
    }

    const signers: ProviderSignerState[] = (document.recipients ?? []).map(
      (recipient) => ({
        providerRef: recipient.id ?? "",
        email: (recipient.email ?? "").trim().toLowerCase(),
        status: normalizeSignerStatus(recipient.status),
        signedAt: parseDate(recipient.signed_at),
        declinedAt: parseDate(recipient.declined_at),
        declineReason: recipient.decline_reason ?? null,
      }),
    );

    return {
      exists: true,
      status: envelopeStatusFrom(document, signers),
      // Kept verbatim for support, never used for logic.
      providerStatus: document.status ?? "",
      signers,
      declineReason:
        document.decline_message ??
        signers.find((s) => s.declineReason)?.declineReason ??
        null,
      completedAt: parseDate(document.completed_at),
    };
  }
}

/**
 * Validation rule 6 — `SIGNWELL_TEST_MODE` must **parse** as a boolean at boot. A
 * malformed value throws rather than defaulting, because defaulting to `false` would mean
 * spending real money and sending real contracts on a typo.
 *
 * Two call sites, and they are not redundant: the constructor calls it so the failure
 * lands at startup, where a deploy can be rolled back; `createSession` calls it again so
 * the value on the wire is read at the moment it is used rather than captured once. An
 * unset variable is `true` — the safe direction, and what both environments ship.
 */
/**
 * The same question asked by a screen rather than by a send, and answered leniently on
 * purpose. The constructor above already refused to boot on a value that does not parse,
 * so a malformed one cannot reach here — and if it somehow did, a settings page must not
 * answer 500 over a badge, and "on" is the safe direction for a badge whose whole job is
 * to warn that a signature has no legal weight.
 */
function testModeForDisplay(): boolean {
  const value = (process.env.SIGNWELL_TEST_MODE ?? "").trim().toLowerCase();
  return value !== "false" && value !== "0";
}
export function testModeFromEnvironment(
  raw = process.env.SIGNWELL_TEST_MODE,
): boolean {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "" || value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  throw new Error(
    `SIGNWELL_TEST_MODE must be a boolean, not ${JSON.stringify(raw)} — refusing to guess, ` +
      'because guessing "false" spends real money and sends real contracts.',
  );
}

/**
 * One expected field in a sentence a sender can act on. Both refusals — the field with no
 * box and the field the provider did not keep — name what is missing the same way, because
 * to the person reading the error they are the same complaint.
 */
function describeExpectedField(
  expected: ExpectedProviderField,
  nameOf: ReadonlyMap<string, string>,
): string {
  const who = nameOf.get(expected.signerId) ?? expected.signerId;
  return expected.type === "signature"
    ? `signature for ${who}`
    : `field ${expected.fieldKey ?? "?"} for ${who}`;
}

/** A box, for the "what we did have" half of a refusal. Never a field value. */
function describeBox(box: SignWellFieldBox): string {
  return `${box.kind}:${box.ref}`;
}

/** Requirement 39 — turn is read from `recipients[].status`, never inferred. */
export function normalizeSignerStatus(
  status: string | null | undefined,
): ProviderSignerStatus {
  switch ((status ?? "").toLowerCase()) {
    case "waiting":
      return "pending";
    case "sent":
      return "notified";
    case "viewed":
      return "viewed";
    case "signed":
      return "signed";
    case "declined":
      return "declined";
    // `created` before send, and `null` in a stale webhook body — both are "nothing has
    // happened to this recipient yet".
    default:
      return "pending";
  }
}

export function normalizeStatus(status: string | null | undefined): string {
  return (status ?? "").trim().toLowerCase();
}

function envelopeStatusFrom(
  document: SignWellDocument,
  signers: readonly ProviderSignerState[],
): ProviderState["status"] {
  const status = normalizeStatus(document.status);

  if (status === "completed") return "completed";
  if (status === "declined" || signers.some((s) => s.status === "declined"))
    return "declined";
  if (status === "canceled" || document.archived === true) return "canceled";
  if (signers.some((s) => s.status === "signed")) return "partially_signed";
  if (status === "created") return "created";
  return "sent";
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * A test seam, not a tuning knob: the polling bound is thirty seconds in every deployed
 * environment, and the integration suite shortens the interval so a case that must prove
 * "polling stops at the bound" does not take half a minute to do it.
 */
function pollIntervalMs(): number {
  const configured = Number(process.env.SIGNWELL_POLL_INTERVAL_MS);
  return Number.isFinite(configured) && configured >= 0
    ? configured
    : DEFAULT_POLL_INTERVAL_MS;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeFileName(title: string): string {
  const cleaned = title.replace(/[^\p{L}\p{N} ._-]/gu, "").trim();
  return cleaned.length > 0 ? cleaned.slice(0, 120) : "document";
}
