import { Injectable, Logger } from '@nestjs/common';
import { ProviderUnavailableError } from '../signing-provider';
import type {
  SignWellCreateDocumentBody,
  SignWellDocument,
  SignWellDocumentList,
  SignWellHook,
} from './signwell-types';

/**
 * The HTTP boundary, and nothing else.
 *
 * It is its own injectable class so the integration suite can `overrideProvider()` it —
 * the same move `envelopes.spec.ts` already makes with `StubPdfRenderer`. Everything
 * above it (the adapter) then has no network in it at all, and everything in it (timeouts,
 * rate limits, retries, the breaker) is testable without a Nest application.
 *
 * Abstract class rather than interface: Nest uses the class as the DI token.
 */
/**
 * Requirement 26 — the lookup that runs **before** a create is repeated.
 *
 * `POST /documents` is not idempotent on their side, so a create that failed in a way
 * that could still have landed must not simply be sent again: the second attempt would
 * produce a second live document for one envelope, with the real counterparties on it and
 * an `embedded_signing_url` each, which is the duplicate this requirement exists to
 * prevent. The answer is this: page the list, compare `metadata.envelope_id` in our own
 * code, and hand back the match if there is one.
 *
 * It is a parameter and not an option, so a caller cannot forget it. There is exactly one
 * route in this client that is unsafe to repeat, and this is how it says so.
 */
export type AdoptExisting = () => Promise<SignWellDocument | null>;

/**
 * Thrown by the guard when the lookup found the document the failed create had already
 * made, and caught by `createDocument` a few frames up. Control flow rather than an error:
 * it is how the retry loop is stopped from *inside* the pause between attempts without
 * teaching that loop what a document is, or inventing a response that never came from the
 * network.
 */
class AdoptedExisting extends Error {
  constructor(readonly document: SignWellDocument) {
    super('adopted an existing SignWell document');
    this.name = 'AdoptedExisting';
  }
}

export abstract class SignWellHttpClient {
  /**
   * The one route that is unsafe to repeat. `adoptExisting` is consulted before every
   * retry whose failure could have created a document — requirement 26.
   */
  abstract createDocument(
    body: SignWellCreateDocumentBody,
    adoptExisting: AdoptExisting,
  ): Promise<SignWellDocument>;
  abstract getDocument(id: string): Promise<SignWellDocument | null>;
  /** One page of `GET /documents`. Its filters are silently ignored — see requirement 26. */
  abstract listDocuments(page: number): Promise<SignWellDocumentList>;
  /** `204` on success; `null` when the document was already gone. */
  abstract deleteDocument(id: string): Promise<'deleted' | 'not_found'>;
  /** The completed PDF with its audit page, or `null` on a `404` — which carries no information. */
  abstract completedPdf(id: string): Promise<Buffer | null>;
  /** For the settings screen's live connection check. Never a gate on selection. */
  abstract ping(): Promise<boolean>;
  /** `GET /hooks`, so a registration pointing somewhere unexpected is visible on a screen. */
  abstract hooks(): Promise<readonly SignWellHook[]>;
}

/* ------------------------------------------------------------------ *
 * The transport seam
 *
 * A function rather than `fetch` itself, so the client's retry, rate-limit and breaker
 * behaviour can be driven from a test with no network and no timers to wait on. The real
 * one is at the bottom of this file.
 * ------------------------------------------------------------------ */

export interface SignWellRawResponse {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}

export interface SignWellRawRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
}

export type SignWellTransport = (request: SignWellRawRequest) => Promise<SignWellRawResponse>;

export interface SignWellClientOptions {
  baseUrl?: string;
  apiKey?: string;
  /** A hard cap per call. A hung provider must never be able to exhaust the request pool. */
  timeoutMs?: number;
  /** Five, including the first. */
  maxAttempts?: number;
  /** The first backoff, doubled with jitter on each retry. */
  retryBaseMs?: number;
  /** Consecutive failures that open the breaker. */
  breakerThreshold?: number;
  /** How long the breaker stays open before letting one call through. */
  breakerWindowMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/** The route families rate limits are tracked per, since they differ by an order of magnitude. */
export type RouteFamily = 'read' | 'create-document' | 'create-hook';

export interface RateLimitState {
  limit: number | null;
  remaining: number | null;
  observedAt: number;
}

const DEFAULTS = {
  timeoutMs: 10_000,
  maxAttempts: 5,
  retryBaseMs: 250,
  breakerThreshold: 5,
  breakerWindowMs: 60_000,
};

/**
 * The real driver.
 *
 * Every rule below is observable, and each is here for a reason the spec states:
 *
 *  - **A hard 10s timeout per call.** The API now makes outbound HTTPS calls while
 *    serving requests, which it did not do before; a hung provider must not exhaust the
 *    request pool.
 *  - **Rate limits are read, never assumed.** Every reply carries `x-ratelimit-limit` and
 *    `x-ratelimit-remaining`, and the documented figures are wrong: observed, reads report
 *    120, `POST /hooks` 30, and `POST /documents` **10** against the 30 the documentation
 *    claims. Tracking per route family is the only way to be right about all three.
 *  - **Serialized per organization**, so two sends for one organization cannot spend the
 *    create budget against each other.
 *  - **Five attempts with exponential backoff and jitter on 429**, then
 *    `provider_unavailable`.
 *  - **A circuit breaker** that fails fast for 60s after five consecutive failures, so a
 *    retry storm cannot consume a budget that is already exhausted (edge case 22).
 *
 * INVARIANT 11 is not enforced here but is what shapes every caller: none of this runs
 * inside a database transaction, because a five-attempt backoff would hold a row lock for
 * a minute.
 */
@Injectable()
export class HttpSignWellClient extends SignWellHttpClient {
  private readonly log = new Logger(HttpSignWellClient.name);

  private readonly options: Required<Omit<SignWellClientOptions, 'baseUrl' | 'apiKey'>> & {
    baseUrl: string;
    apiKey: string;
  };

  /** What the last reply said about each family's budget. Read, not assumed. */
  private readonly rateLimits = new Map<RouteFamily, RateLimitState>();

  /** The per-organization serialization chain; the key is the organization id. */
  private readonly queues = new Map<string, Promise<unknown>>();

  private consecutiveFailures = 0;
  private breakerOpenedAt: number | null = null;

  constructor(
    private readonly transport: SignWellTransport = fetchTransport,
    options: SignWellClientOptions = {},
  ) {
    super();
    this.options = {
      baseUrl: (options.baseUrl ?? process.env.SIGNWELL_API_BASE_URL ?? 'https://www.signwell.com/api/v1')
        .replace(/\/+$/, ''),
      apiKey: options.apiKey ?? process.env.SIGNWELL_API_KEY ?? '',
      timeoutMs: options.timeoutMs ?? DEFAULTS.timeoutMs,
      maxAttempts: options.maxAttempts ?? DEFAULTS.maxAttempts,
      retryBaseMs: options.retryBaseMs ?? DEFAULTS.retryBaseMs,
      breakerThreshold: options.breakerThreshold ?? DEFAULTS.breakerThreshold,
      breakerWindowMs: options.breakerWindowMs ?? DEFAULTS.breakerWindowMs,
      sleep: options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms))),
      now: options.now ?? (() => Date.now()),
    };
  }

  /* -------------------------------------------------------------- *
   * The API surface
   * -------------------------------------------------------------- */

  async createDocument(
    body: SignWellCreateDocumentBody,
    adoptExisting: AdoptExisting,
  ): Promise<SignWellDocument> {
    try {
      const response = await this.call('create-document', {
        method: 'POST',
        path: '/documents',
        body,
        organizationId: body.metadata.organization_id,
        /*
         * Requirement 26, at the only place it can be honoured: between two attempts at a
         * create. The scan runs on the `read` lane and the create holds the organization
         * lane, so the two do not serialize against each other — if this ever moved onto
         * the same key it would deadlock against the very call it is protecting.
         */
        beforeUnsafeRetry: async () => {
          const existing = await adoptExisting();
          if (existing) throw new AdoptedExisting(existing);
        },
      });
      if (response.status !== 200 && response.status !== 201) {
        throw this.failure('createDocument', response);
      }
      return this.json<SignWellDocument>(response);
    } catch (error) {
      if (error instanceof AdoptedExisting) {
        this.log.warn(
          `Adopting SignWell document ${error.document.id} rather than repeating a create ` +
            'that may already have landed',
        );
        return error.document;
      }
      throw error;
    }
  }

  async getDocument(id: string): Promise<SignWellDocument | null> {
    const response = await this.call('read', { method: 'GET', path: `/documents/${encode(id)}` });
    if (response.status === 404) return null;
    if (response.status !== 200) throw this.failure('getDocument', response);
    return this.json<SignWellDocument>(response);
  }

  async listDocuments(page: number): Promise<SignWellDocumentList> {
    const response = await this.call('read', {
      method: 'GET',
      // The filter parameters are deliberately absent: they are silently ignored, and a
      // filter that is ignored rather than rejected is the most dangerous kind. Matching
      // happens in our own code — requirement 26.
      path: `/documents?page=${encodeURIComponent(String(page))}`,
    });
    if (response.status !== 200) throw this.failure('listDocuments', response);
    return this.json<SignWellDocumentList>(response);
  }

  async deleteDocument(id: string): Promise<'deleted' | 'not_found'> {
    const response = await this.call('read', {
      method: 'DELETE',
      path: `/documents/${encode(id)}`,
    });
    if (response.status === 404) return 'not_found';
    if (response.status !== 200 && response.status !== 204) {
      throw this.failure('deleteDocument', response);
    }
    return 'deleted';
  }

  async completedPdf(id: string): Promise<Buffer | null> {
    const response = await this.call('read', {
      method: 'GET',
      // `audit_page=true` is not optional: it is what makes their PDF the record of
      // execution rather than an unsigned-looking rendering.
      path: `/documents/${encode(id)}/completed_pdf?url_only=false&audit_page=true`,
    });
    // A 404 here carries NO information — an incomplete document and an unknown id answer
    // identically with `record_not_found`. The caller establishes completion from
    // `GET /documents/{id}` first and treats this as a transient (requirement 17).
    if (response.status === 404) return null;
    if (response.status !== 200) throw this.failure('completedPdf', response);
    return response.body;
  }

  async ping(): Promise<boolean> {
    try {
      const response = await this.call('read', { method: 'GET', path: '/me' });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  async hooks(): Promise<readonly SignWellHook[]> {
    const response = await this.call('read', { method: 'GET', path: '/hooks' });
    if (response.status !== 200) throw this.failure('hooks', response);
    const parsed = this.json<unknown>(response);
    if (Array.isArray(parsed)) return parsed as readonly SignWellHook[];
    const wrapped = (parsed ?? {}) as { hooks?: readonly SignWellHook[] };
    return wrapped.hooks ?? [];
  }

  /* -------------------------------------------------------------- *
   * The machinery
   * -------------------------------------------------------------- */

  /** What the last reply said about a family's budget. Exposed for operations and tests. */
  rateLimitFor(family: RouteFamily): RateLimitState | null {
    return this.rateLimits.get(family) ?? null;
  }

  breakerIsOpen(): boolean {
    if (this.breakerOpenedAt === null) return false;
    if (this.options.now() - this.breakerOpenedAt < this.options.breakerWindowMs) return true;
    // The window has passed: let exactly one call through and let its outcome decide.
    this.breakerOpenedAt = null;
    this.consecutiveFailures = 0;
    return false;
  }

  private async call(
    family: RouteFamily,
    request: {
      method: string;
      path: string;
      body?: unknown;
      organizationId?: string;
      beforeUnsafeRetry?: () => Promise<void>;
    },
  ): Promise<SignWellRawResponse> {
    // Serialized per organization. Calls with no organization in scope (the settings
    // screen's connection check) share one lane, which is what keeps a health check from
    // interleaving with a send.
    return this.serialize(request.organizationId ?? '_shared', () =>
      this.attempt(family, request),
    );
  }

  private async serialize<T>(key: string, work: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(key) ?? Promise.resolve();
    const next = previous.then(work, work);
    // The chain must not reject, or every later call for this organization would inherit
    // the rejection; the *returned* promise still carries it to this caller.
    this.queues.set(
      key,
      next.then(
        () => undefined,
        () => undefined,
      ),
    );
    return next;
  }

  private async attempt(
    family: RouteFamily,
    request: {
      method: string;
      path: string;
      body?: unknown;
      beforeUnsafeRetry?: () => Promise<void>;
    },
  ): Promise<SignWellRawResponse> {
    if (this.breakerIsOpen()) {
      // Fails fast, without a network attempt: the same observable outcome as a timeout,
      // without spending a call (edge case 22).
      throw new ProviderUnavailableError('provider_unavailable', 'circuit_open');
    }

    let lastError: unknown = null;
    /*
     * Whether the failure we are about to retry could have been *processed* despite
     * failing — requirement 26, and the whole reason this flag exists.
     *
     * A timeout or a socket error is the plain case: the request may have arrived, been
     * committed, and lost its answer on the way back. A 5xx is the same case wearing a
     * status code, because a gateway that times out behind a proxy answers 502 or 504
     * after the write it was fronting has already landed. A 429 is neither: the limiter
     * refuses the request before anything is done with it, so it is the one failure a
     * create may be repeated on without asking anybody anything.
     */
    let couldHaveLanded = false;

    for (let attempt = 0; attempt < this.options.maxAttempts; attempt++) {
      if (attempt > 0) {
        await this.options.sleep(this.backoffMs(attempt));
        /*
         * After the backoff rather than before it, deliberately: a create that landed a
         * moment ago has had the pause to become visible in the list, and a lookup that
         * ran first would be the one most likely to miss it and repeat the create anyway.
         * A found document throws out of this loop and is returned by the caller.
         */
        if (couldHaveLanded && request.beforeUnsafeRetry) await request.beforeUnsafeRetry();
      }

      try {
        const response = await this.transport({
          url: `${this.options.baseUrl}${request.path}`,
          method: request.method,
          headers: {
            'X-Api-Key': this.options.apiKey,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: request.body === undefined ? undefined : JSON.stringify(request.body),
          timeoutMs: this.options.timeoutMs,
        });

        this.readRateLimit(family, response.headers);

        // 429 is the one status worth retrying on its own: the budget refills, and the
        // limiter refused the request rather than processing it.
        if (response.status === 429) {
          lastError = new ProviderUnavailableError('provider_unavailable', 'rate_limited');
          couldHaveLanded = false;
          continue;
        }
        // A 5xx is a provider fault and is retried on the same budget — but it may have
        // been answered by something in front of a write that already succeeded.
        if (response.status >= 500) {
          lastError = new ProviderUnavailableError('provider_unavailable', `status_${response.status}`);
          couldHaveLanded = true;
          this.recordFailure();
          continue;
        }

        this.recordSuccess();
        return response;
      } catch (error) {
        // A timeout or a socket error, indistinguishable from "the request never arrived"
        // — and from "it arrived, was committed, and the answer was lost", which is the
        // case requirement 26 exists for and the reason the flag goes up here.
        lastError = error;
        couldHaveLanded = true;
        this.recordFailure();
        if (this.breakerIsOpen()) break;
      }
    }

    this.recordFailure();
    const detail = lastError instanceof Error ? lastError.message : String(lastError);
    this.log.warn(`SignWell ${request.method} ${request.path} failed after retries: ${detail}`);
    throw new ProviderUnavailableError('provider_unavailable', detail);
  }

  /** Exponential with jitter, so a fleet of retries does not arrive in lockstep. */
  private backoffMs(attempt: number): number {
    const base = this.options.retryBaseMs * 2 ** (attempt - 1);
    return Math.round(base + Math.random() * this.options.retryBaseMs);
  }

  private readRateLimit(family: RouteFamily, headers: Record<string, string>): void {
    const limit = numberHeader(headers, 'x-ratelimit-limit');
    const remaining = numberHeader(headers, 'x-ratelimit-remaining');
    if (limit === null && remaining === null) return;
    this.rateLimits.set(family, { limit, remaining, observedAt: this.options.now() });
  }

  private recordFailure(): void {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.options.breakerThreshold && this.breakerOpenedAt === null) {
      this.breakerOpenedAt = this.options.now();
      this.log.error(
        `SignWell circuit breaker opened after ${this.consecutiveFailures} consecutive failures`,
      );
    }
  }

  private recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.breakerOpenedAt = null;
  }

  private json<T>(response: SignWellRawResponse): T {
    const text = response.body.toString('utf8');
    if (!text) return {} as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ProviderUnavailableError('provider_unavailable', 'unparseable_response');
    }
  }

  /**
   * The error a non-retryable status becomes. The provider's body is **not** included:
   * only the projection may be logged (requirement 36), and an error body carries the
   * whole document.
   */
  private failure(operation: string, response: SignWellRawResponse): ProviderUnavailableError {
    this.log.warn(`SignWell ${operation} answered ${response.status}`);
    return new ProviderUnavailableError('provider_unavailable', `status_${response.status}`);
  }
}

function encode(value: string): string {
  return encodeURIComponent(value);
}

function numberHeader(headers: Record<string, string>, name: string): number | null {
  const raw = headers[name] ?? headers[name.toLowerCase()];
  if (raw === undefined) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/**
 * `fetch` with a hard deadline. Node's global fetch has no timeout of its own, so the
 * abort signal is the whole of the guarantee.
 */
export const fetchTransport: SignWellTransport = async (request) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), request.timeoutMs);
  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: controller.signal,
    });
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    return {
      status: response.status,
      headers,
      body: Buffer.from(await response.arrayBuffer()),
    };
  } finally {
    clearTimeout(timer);
  }
};
