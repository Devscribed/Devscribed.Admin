import { Injectable } from '@nestjs/common';
import { ProviderUnavailableError } from '../signing-provider';
import { SignWellHttpClient } from './signwell-http-client';
import { flattenFields } from './signwell-types';
import type {
  SignWellCreateDocumentBody,
  SignWellDocument,
  SignWellDocumentList,
  SignWellHook,
} from './signwell-types';

/**
 * The SignWell boundary, answered from memory.
 *
 * Selected by `SIGNWELL_DRIVER=stub` and **refused outright when `NODE_ENV` is
 * production** — a stub that could be switched on in production is a way to make a
 * contract that was never sent look sent.
 *
 * It exists for the E2E suite, which must stay hermetic: a suite that reached the network
 * would be slower, flakier, unparallelizable across workers sharing one webhook
 * registration, and would spend a create budget of ten documents a minute. The Jest
 * integration suites do **not** use it — they override `SignWellHttpClient` per case with
 * a stub that answers exactly what that case is about.
 *
 * What it deliberately does not try to be: a simulator. But on the one behaviour that
 * decides whether a send can work at all it is exact, because a double that is wrong in the
 * provider's favour is worse than no double: **fields exist only when the request supplied
 * them, and a document created with none settles in `Draft` and is never sent** — which is
 * what BUG-001 measured against the live API. An earlier version of this stub materialized
 * a signature field per recipient out of nothing, and seven integration suites and a full
 * E2E run passed green against a behaviour SignWell has never had.
 */
@Injectable()
export class StubSignWellHttpClient extends SignWellHttpClient {
  private readonly documents = new Map<string, SignWellDocument>();
  private sequence = 0;

  /**
   * TC-04-E2E-03 needs the provider to answer `503` and then be made healthy **inside one
   * test**, so the switch is runtime state rather than configuration — and it is keyed by
   * organization, which is the part that makes "inside one test" true.
   *
   * A single boolean here was a global in a suite whose config sets `fullyParallel`, so the
   * one case that turns the provider off turned it off for every case running beside it.
   * That is exactly how TC-04-E2E-02 came to fail on the error card: its signer opened a
   * perfectly good link during the second or two TC-04-E2E-03 had the provider down. Each
   * case seeds its own organization, so keying on that is what isolates them.
   */
  private readonly unhealthy = new Set<string>();

  setHealthy(organizationId: string, healthy: boolean): void {
    if (healthy) this.unhealthy.delete(organizationId);
    else this.unhealthy.add(organizationId);
  }

  isHealthy(organizationId: string): boolean {
    return !this.unhealthy.has(organizationId);
  }

  /** The fixture that drives an envelope to completion without a human in a widget. */
  completeDocument(providerRef: string): boolean {
    const document = this.documents.get(providerRef);
    if (!document) return false;
    const now = new Date().toISOString();
    this.documents.set(providerRef, {
      ...document,
      status: 'Completed',
      completed_at: now,
      updated_at: now,
      recipients: (document.recipients ?? []).map((recipient) => ({
        ...recipient,
        status: 'signed',
        signed_at: now,
      })),
    });
    return true;
  }

  reset(): void {
    this.documents.clear();
    this.unhealthy.clear();
    this.sequence = 0;
  }

  async createDocument(body: SignWellCreateDocumentBody): Promise<SignWellDocument> {
    this.assertHealthy(body.metadata.organization_id);
    this.sequence += 1;
    const id = `stub-document-${this.sequence}`;
    const now = new Date().toISOString();

    const document: SignWellDocument = {
      id,
      // The real API answers `201` with `Created` and an empty field list, then parses the
      // file on its own — so the stub does too, and the adapter's poll is exercised rather
      // than skipped.
      status: 'Created',
      name: body.name,
      test_mode: body.test_mode,
      archived: false,
      created_at: now,
      updated_at: now,
      metadata: { ...body.metadata },
      recipients: body.recipients.map((recipient, index) => ({
        id: recipient.id,
        name: recipient.name,
        email: recipient.email,
        signing_order: recipient.signing_order,
        status: index === 0 ? 'sent' : 'waiting',
        // Deliberately **same-origin**: a stub that pointed at www.signwell.com would
        // make the E2E suite reach the network to render a frame, which is the one thing
        // the stub exists to prevent. It is served by the fixture controller through the
        // web app's `/api/*` rewrite, so the shipped `frame-src 'self'` admits it and no
        // build-time variable has to be set for the suite to pass.
        embedded_signing_url: `${webOrigin()}/api/test/signwell/widget?document=${encodeURIComponent(
          id,
        )}&recipient=${encodeURIComponent(recipient.id)}`,
      })),
      // The request's own field list, echoed — nothing is invented from the PDF, because
      // SignWell invents nothing from it either. Page-grouped, exactly as the real payloads
      // are: a redactor or a check written against a flat array must fail here too.
      fields: [
        flattenFields(body.fields).map((field) => ({
          api_id: field.api_id,
          type: field.type,
          required: field.required,
          recipient_id: field.recipient_id,
          page: field.page,
          value: field.type === 'text' ? '' : null,
        })),
      ],
      files: [{ name: body.files[0]?.name ?? 'document.pdf', pages_number: 0 }],
      expires_in: body.expires_in,
    };

    this.documents.set(id, document);
    return { ...document, fields: [], files: [{ name: document.files?.[0]?.name ?? '', pages_number: 0 }] };
  }

  async getDocument(id: string): Promise<SignWellDocument | null> {
    this.assertHealthy(this.organizationOf(id));
    const document = this.documents.get(id);
    if (!document) return null;
    // The parse has landed by the first read, which is what the adapter polls for. What it
    // produced is the whole point: the fields the request supplied, and nothing else. A
    // document that supplied none settles in `Draft` and is never sent, which is what the
    // live API does and what no tag syntax could change.
    if (document.status === 'Created') {
      const settled: SignWellDocument = {
        ...document,
        status: flattenFields(document.fields).length > 0 ? 'Sent' : 'Draft',
        files: [{ name: document.files?.[0]?.name ?? 'document.pdf', pages_number: 1 }],
      };
      this.documents.set(id, settled);
      return settled;
    }
    return document;
  }

  async listDocuments(page: number): Promise<SignWellDocumentList> {
    const all = [...this.documents.values()];
    return {
      documents: page === 1 ? all : [],
      current_page: page,
      next_page: null,
      total_pages: 1,
      total_count: all.length,
    };
  }

  async deleteDocument(id: string): Promise<'deleted' | 'not_found'> {
    this.assertHealthy(this.organizationOf(id));
    if (!this.documents.has(id)) return 'not_found';
    this.documents.delete(id);
    return 'deleted';
  }

  async completedPdf(id: string): Promise<Buffer | null> {
    this.assertHealthy(this.organizationOf(id));
    const document = this.documents.get(id);
    // The same answer the real route gives for both an incomplete document and an unknown
    // id, which is exactly why a 404 here carries no information.
    if (!document || document.status !== 'Completed') return null;
    return Buffer.from(`%PDF-1.4 signwell stub with audit page for ${id}`, 'utf8');
  }

  /*
   * The account-wide calls, and the settings screen is their only caller. They have no
   * organization in scope and are deliberately always healthy: the connection check is a
   * statement about the vendor, not about one tenant, and no case asserts otherwise. The
   * orphan scan is the same — it pages every document the account holds.
   */
  async ping(): Promise<boolean> {
    return true;
  }

  async hooks(): Promise<readonly SignWellHook[]> {
    return [{ id: 'stub-hook', callback_url: 'http://localhost:4000/api/webhooks/signwell' }];
  }

  /**
   * Which organization a document belongs to, from the metadata the create carried. An
   * unknown id belongs to nobody, and an unknown organization is healthy — the caller is
   * about to get a `null` or a `not_found` for it anyway.
   */
  private organizationOf(id: string): string {
    const metadata = (this.documents.get(id)?.metadata ?? {}) as Record<string, unknown>;
    return typeof metadata.organization_id === 'string' ? metadata.organization_id : '';
  }

  private assertHealthy(organizationId: string): void {
    if (!this.isHealthy(organizationId)) {
      throw new ProviderUnavailableError('provider_unavailable', 'stub_unhealthy');
    }
  }
}

/**
 * The web origin, which is where a browser reaches `/api/*` from — the Next rewrite
 * proxies it to this process, so a frame pointing there is same-origin to the signing
 * page.
 */
function webOrigin(): string {
  return (process.env.APP_PUBLIC_URL || 'http://localhost:3000').replace(/\/+$/, '');
}
