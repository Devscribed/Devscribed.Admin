import { createHmac } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma.service';
import { SignWellHttpClient } from '../src/signature/signwell/signwell-http-client';
import type {
  SignWellCreateDocumentBody,
  SignWellDocument,
  SignWellDocumentList,
  SignWellHook,
} from '../src/signature/signwell/signwell-types';

/**
 * Shared setup for the spec-04 suites.
 *
 * It lives outside a `*.spec.ts` so Jest does not treat it as a suite of its own, and it
 * exists rather than being copied six times because every one of those copies would be a
 * place for the stub's behaviour to drift from the real client's contract.
 *
 * **The suite never touches SignWell.** Every case overrides `SignWellHttpClient` — the
 * HTTP boundary and nothing else — so the adapter, the send path, the reconciler and the
 * completion service are all the real ones. A test that needed the network would be
 * slower, flakier, unparallelizable across Jest workers sharing one webhook registration,
 * and would spend a create budget of ten documents a minute.
 */

/** The webhook id `setup-env.ts` names; the id the captured deliveries were sent to. */
export const TEST_WEBHOOK_ID = '2ecc3f5c-3a2d-4e60-967b-4bf67e059ca0';

export interface StubField {
  type: 'signature' | 'text';
  /** Their recipient id, which our adapter sets to the signing order. */
  recipientId: string;
  required: boolean;
  apiId?: string;
}

/**
 * A programmable HTTP boundary. Every method has an in-memory default and a hook a case
 * can replace, so a test says only the thing it is about.
 */
export class TestSignWellClient extends SignWellHttpClient {
  readonly documents = new Map<string, SignWellDocument>();
  readonly createBodies: SignWellCreateDocumentBody[] = [];
  /** Every call, in order, so a case can assert what was and was not spent. */
  readonly calls: string[] = [];

  onCreate?: (body: SignWellCreateDocumentBody, attempt: number) => Promise<SignWellDocument>;
  onGet?: (id: string, attempt: number) => Promise<SignWellDocument | null>;
  onList?: (page: number) => Promise<SignWellDocumentList>;
  onDelete?: (id: string) => Promise<'deleted' | 'not_found'>;
  onPdf?: (id: string, attempt: number) => Promise<Buffer | null>;

  private sequence = 0;
  private readonly attempts = new Map<string, number>();

  reset(): void {
    this.documents.clear();
    this.createBodies.length = 0;
    this.calls.length = 0;
    this.attempts.clear();
    this.sequence = 0;
    this.onCreate = undefined;
    this.onGet = undefined;
    this.onList = undefined;
    this.onDelete = undefined;
    this.onPdf = undefined;
  }

  /** How many times a method has been called — the "zero calls" assertions read this. */
  countOf(method: string): number {
    return this.calls.filter((call) => call === method).length;
  }

  async createDocument(body: SignWellCreateDocumentBody): Promise<SignWellDocument> {
    this.calls.push('createDocument');
    this.createBodies.push(body);
    const attempt = this.bump('createDocument');
    if (this.onCreate) return this.onCreate(body, attempt);

    this.sequence += 1;
    const document = signWellDocument(`sw-${this.sequence}`, body, {
      status: 'Created',
      fields: [],
    });
    // The parsed copy the poll will see, exactly as the real API materializes it.
    this.documents.set(document.id!, signWellDocument(document.id!, body, {
      status: 'Sent',
      fields: materializedFor(body),
    }));
    return document;
  }

  async getDocument(id: string): Promise<SignWellDocument | null> {
    this.calls.push('getDocument');
    const attempt = this.bump(`getDocument:${id}`);
    if (this.onGet) return this.onGet(id, attempt);
    return this.documents.get(id) ?? null;
  }

  async listDocuments(page: number): Promise<SignWellDocumentList> {
    this.calls.push('listDocuments');
    if (this.onList) return this.onList(page);
    return { documents: [], current_page: page, next_page: null, total_pages: 1, total_count: 0 };
  }

  async deleteDocument(id: string): Promise<'deleted' | 'not_found'> {
    this.calls.push('deleteDocument');
    if (this.onDelete) return this.onDelete(id);
    if (!this.documents.has(id)) return 'not_found';
    this.documents.delete(id);
    return 'deleted';
  }

  async completedPdf(id: string): Promise<Buffer | null> {
    this.calls.push('completedPdf');
    const attempt = this.bump(`completedPdf:${id}`);
    if (this.onPdf) return this.onPdf(id, attempt);
    return Buffer.from(`%PDF-1.4 signwell completed with audit page ${id}`, 'utf8');
  }

  async ping(): Promise<boolean> {
    this.calls.push('ping');
    return true;
  }

  async hooks(): Promise<readonly SignWellHook[]> {
    this.calls.push('hooks');
    return [{ id: 'hook-1', callback_url: 'https://example.test/api/webhooks/signwell' }];
  }

  private bump(key: string): number {
    const next = (this.attempts.get(key) ?? 0) + 1;
    this.attempts.set(key, next);
    return next;
  }
}

/** One document in the shape the API returns, including the page-grouped field list. */
export function signWellDocument(
  id: string,
  body: SignWellCreateDocumentBody,
  overrides: {
    status?: string;
    fields?: StubField[];
    recipientStatuses?: Record<string, string>;
    completedAt?: string | null;
    declineMessage?: string | null;
  } = {},
): SignWellDocument {
  const now = new Date().toISOString();
  const statuses = overrides.recipientStatuses ?? {};

  return {
    id,
    status: overrides.status ?? 'Sent',
    name: body.name,
    test_mode: body.test_mode,
    archived: false,
    created_at: now,
    updated_at: now,
    completed_at: overrides.completedAt ?? null,
    decline_message: overrides.declineMessage ?? null,
    metadata: { ...body.metadata },
    recipients: body.recipients.map((recipient, index) => ({
      id: recipient.id,
      name: recipient.name,
      email: recipient.email,
      signing_order: recipient.signing_order,
      // The provider's vocabulary, not ours: `completed` is a recipient who has signed.
      status: statuses[recipient.id] ?? (index === 0 ? 'sent' : 'waiting'),
      embedded_signing_url: `https://www.signwell.com/docs/${id}-${recipient.id}/`,
      // A completed recipient carries no timestamp in the real payload, so neither does
      // this one; the reconciler dates the row from the convergence.
      signed_at: null,
      declined_at: statuses[recipient.id] === 'declined' ? now : null,
      decline_reason: null,
    })),
    // Page-grouped, exactly as the captured deliveries are: a check written against a
    // flat array has to fail here too.
    fields: [(overrides.fields ?? []).map((field, index) => ({
      api_id: field.apiId ?? `${field.type === 'signature' ? 'Signature' : 'TextField'}_${index + 1}`,
      type: field.type,
      required: field.required,
      recipient_id: field.recipientId,
      page: 1,
      value: field.type === 'text' ? '' : null,
    }))],
    files: [{ name: body.files[0]?.name ?? 'document.pdf', pages_number: 1 }],
    expires_in: body.expires_in,
  };
}

/**
 * What the standard fixture template's tags materialize into: one signature per
 * recipient, plus the one signer-owned required field the template gives the contractor.
 */
export function materializedFor(body: SignWellCreateDocumentBody): StubField[] {
  return [
    ...body.recipients.map((recipient) => ({
      type: 'signature' as const,
      recipientId: recipient.id,
      required: true,
    })),
    { type: 'text' as const, recipientId: '2', required: true },
  ];
}

/**
 * A delivery whose hash verifies, for a document id a test chose.
 *
 * The hash covers only `{type}@{time}` — which is requirement 20's whole point — so a
 * test can build any body it needs and still produce a signature SignWell's own algorithm
 * accepts. The bodies the *reconciler* is tested against are the captured ones in
 * `signwell-webhook-fixtures.ts`; these exist because a case needs the reference to name
 * an envelope this run created.
 */
export function signedDelivery(
  type: string,
  documentId: string,
  options: {
    time?: number;
    status?: string;
    relatedSignerEmail?: string;
    metadata?: Record<string, unknown>;
  } = {},
): Record<string, unknown> {
  const time = options.time ?? Math.floor(Date.now() / 1000);
  const hash = createHmac('sha256', TEST_WEBHOOK_ID).update(`${type}@${time}`).digest('hex');

  return {
    event: {
      hash,
      time,
      type,
      ...(options.relatedSignerEmail
        ? { related_signer: { email: options.relatedSignerEmail, name: 'Signer' } }
        : {}),
    },
    data: {
      object: {
        id: documentId,
        // Deliberately a *claim*: nothing here is ever written to the database, and
        // TC-04-INT-04 is the case that proves it.
        status: options.status ?? 'Sent',
        metadata: options.metadata ?? {},
        recipients: [
          {
            id: '1',
            email: 'company@acme.com',
            status: null,
            embedded_signing_url: 'https://www.signwell.com/docs/live-credential/',
          },
        ],
        fields: [[{ api_id: 'Signature_1', type: 'signature', value: 'ink', recipient_id: '1' }]],
      },
      account_id: 'acct',
    },
  };
}

/** Points an organization at SignWell without going through the settings screen. */
export async function useSignWell(
  app: INestApplication,
  organizationId: string,
): Promise<void> {
  await app
    .get(PrismaService)
    .organization.update({
      where: { id: organizationId },
      data: { signatureProviderKey: 'signwell' },
    });
}
