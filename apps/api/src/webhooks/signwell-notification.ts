import { createHmac, timingSafeEqual } from 'node:crypto';
import { redactProviderPayload } from './redact-payload';
import type { ParsedNotification } from '../signature/signing-provider';

/**
 * Requirement 20 — **the webhook is a doorbell, not a delivery.**
 *
 * Observed: the delivery is a POST with `User-Agent: SignWell`,
 * `Content-Type: application/json`, and **no signature header of any kind**. The hash
 * exists only in the body, and the documented algorithm is confirmed against two real
 * deliveries: `HMAC-SHA256("{type}@{time}")` keyed by the webhook id reproduced
 * `event.hash` on both.
 *
 * Two consequences are load-bearing, and both are why this function's result is used to
 * **reject noise cheaply** and never to authenticate a state change:
 *
 *  a. The hash covers only the type and the timestamp. It says nothing about the payload,
 *     so a verified request may still carry a body altered in transit or replayed with
 *     different contents.
 *  b. The "secret" is the webhook id — an identifier `GET /api/v1/hooks` hands to any
 *     holder of the API key.
 *
 * What makes that acceptable is requirement 21: nothing in the body is ever written to
 * the database except the fact that a notification arrived, so a forged body can at worst
 * cost one API call.
 */
export function verifySignWellHash(
  type: string | null | undefined,
  time: number | null | undefined,
  hash: string | null | undefined,
  webhookId: string | null | undefined,
): boolean {
  // An unset secret denies everything. Failing open on a missing environment variable is
  // how an internal endpoint becomes a public one during a botched deploy.
  if (!webhookId) return false;
  if (typeof type !== 'string' || !type) return false;
  if (typeof time !== 'number' || !Number.isFinite(time)) return false;
  if (typeof hash !== 'string' || !hash) return false;

  const expected = createHmac('sha256', webhookId).update(`${type}@${time}`).digest('hex');

  // Length first: `timingSafeEqual` throws on a mismatch rather than returning false, and
  // the length of a hex digest is not the part worth protecting.
  const offered = Buffer.from(hash, 'utf8');
  const computed = Buffer.from(expected, 'utf8');
  if (offered.length !== computed.length) return false;
  return timingSafeEqual(offered, computed);
}

/** The parse result, before verification decides whether anything is recorded. */
export interface SignWellNotificationFacts {
  providerRef: string;
  eventType: string;
  eventTime: Date;
  relatedSignerEmail: string;
  hash: string;
  time: number;
}

/**
 * The facts worth recording, and nothing else. Returns `null` when the body is not
 * something we recognize as a notification — which the controller answers `400` to,
 * deliberately distinct from a hash that does not verify.
 */
export function readSignWellNotification(body: unknown): SignWellNotificationFacts | null {
  if (!body || typeof body !== 'object') return null;

  const event = (body as { event?: unknown }).event;
  if (!event || typeof event !== 'object') return null;

  const type = (event as { type?: unknown }).type;
  const time = (event as { time?: unknown }).time;
  const hash = (event as { hash?: unknown }).hash;
  if (typeof type !== 'string' || type.trim() === '') return null;

  const data = (body as { data?: unknown }).data;
  const object =
    data && typeof data === 'object' ? (data as { object?: unknown }).object : undefined;
  const providerRef =
    object && typeof object === 'object' ? (object as { id?: unknown }).id : undefined;

  const relatedSigner =
    (event as { related_signer?: unknown }).related_signer &&
    typeof (event as { related_signer?: unknown }).related_signer === 'object'
      ? ((event as { related_signer: { email?: unknown } }).related_signer.email as unknown)
      : undefined;

  return {
    providerRef: typeof providerRef === 'string' ? providerRef : '',
    eventType: type,
    // `event.time` is Unix seconds. A skewed time produces a different hash and fails
    // verification; a *correct* hash over a skewed time is indistinguishable from a
    // delayed delivery, and convergence makes both harmless (edge case 31).
    eventTime: new Date((typeof time === 'number' ? time : 0) * 1000),
    // `related_signer` appears only on signer-related events — it was absent from both
    // captured deliveries, which is why requirement 22's dedupe key defaults it to the
    // empty string rather than requiring it.
    relatedSignerEmail: typeof relatedSigner === 'string' ? relatedSigner.trim().toLowerCase() : '',
    hash: typeof hash === 'string' ? hash : '',
    time: typeof time === 'number' ? time : 0,
  };
}

/**
 * The port's `parseNotification`: read the facts, verify the hash, redact the body, and
 * hand back something that can be stored. It carries **no state** — every field about the
 * document is re-read through `fetchState`.
 */
export function parseSignWellNotification(
  body: unknown,
  webhookId: string | null | undefined,
  providerKey: string,
): ParsedNotification | null {
  const facts = readSignWellNotification(body);
  if (!facts) return null;

  return {
    providerKey,
    providerRef: facts.providerRef,
    eventType: facts.eventType,
    eventTime: facts.eventTime,
    relatedSignerEmail: facts.relatedSignerEmail,
    hashVerified: verifySignWellHash(facts.eventType, facts.time, facts.hash, webhookId),
    // Before the first write, and never on read.
    redactedPayload: redactProviderPayload(body),
  };
}
