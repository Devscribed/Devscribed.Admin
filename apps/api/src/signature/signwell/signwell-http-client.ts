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
export abstract class SignWellHttpClient {
  abstract createDocument(body: SignWellCreateDocumentBody): Promise<SignWellDocument>;
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

  async createDocument(body: SignWellCreateDocumentBody): Promise<SignWellDocument> {
    const response = await this.call('create-document', {
      method: 'POST',
      path: '/documents',
      body,
      organizationId: body.metadata.organization_id,
    });
    if (response.status !== 200 && response.status !== 201) {
      throw this.failure('createDocument', response);
    }
    return this.json<SignWellDocument>(response);
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
    request: { method: string; path: string; body?: unknown; organizationId?: string },
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
    request: { method: string; path: string; body?: unknown },
  ): Promise<SignWellRawResponse> {
    if (this.breakerIsOpen()) {
      // Fails fast, without a network attempt: the same observable outcome as a timeout,
      // without spending a call (edge case 22).
      throw new ProviderUnavailableError('provider_unavailable', 'circuit_open');
    }

    let lastError: unknown = null;

    for (let attempt = 0; attempt < this.options.maxAttempts; attempt++) {
      if (attempt > 0) await this.options.sleep(this.backoffMs(attempt));

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

        // 429 is the one status worth retrying on its own: the budget refills.
        if (response.status === 429) {
          lastError = new ProviderUnavailableError('provider_unavailable', 'rate_limited');
          continue;
        }
        // A 5xx is a provider fault and is retried on the same budget.
        if (response.status >= 500) {
          lastError = new ProviderUnavailableError('provider_unavailable', `status_${response.status}`);
          this.recordFailure();
          continue;
        }

        this.recordSuccess();
        return response;
      } catch (error) {
        // A timeout or a socket error. Indistinguishable from "the request never arrived",
        // which is exactly the case requirement 26's orphan recovery exists for.
        lastError = error;
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
