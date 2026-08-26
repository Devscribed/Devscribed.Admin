import { Injectable, Logger } from '@nestjs/common';
import {
  CalendarAttachment,
  CalendarEventDraft,
  CalendarProvider,
  EventId,
  Interval,
  MailboxRef,
  WorkingHours,
} from './calendar-provider';
import type { GraphConfig } from './calendar.config';
import {
  toBusyIntervals,
  toWorkingHours,
  type GraphScheduleResponse,
  type GraphWorkingHours,
} from './graph-mapping';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const LOGIN = 'https://login.microsoftonline.com';

/** Graph ignores an `attachments` array at creation, so it is always a second call. */
const INLINE_ATTACHMENT_MAX = 3 * 1024 * 1024;

/** Upload-session chunks must be a multiple of 320 KiB; twelve of them is ~3.75 MB. */
const UPLOAD_CHUNK_BYTES = 12 * 320 * 1024;

/** Refreshed a minute early, so a token never expires mid-booking. */
const TOKEN_SKEW_MS = 60_000;

class GraphError extends Error {
  constructor(
    readonly status: number,
    operation: string,
    body: string,
  ) {
    super(`Graph ${operation} failed with ${status}: ${body.slice(0, 500)}`);
    this.name = 'GraphError';
  }
}

/**
 * The calendar capability against Microsoft 365, app-only.
 *
 * Client credentials mean there is no signed-in user, so every call names the mailbox
 * explicitly (`/users/{upn}/…`) — that is what lets one app registration read a whole
 * tenant's interviewers without any of them granting consent (00 §02.5).
 *
 * It talks to Graph over `fetch` rather than through the SDK. The surface hiring needs
 * is six calls, the SDK's types are exactly what must not escape this file, and a
 * dependency that ships its own auth stack would be more to keep correct than the two
 * requests it replaces.
 */
@Injectable()
export class TenantAppOnlyProvider extends CalendarProvider {
  private readonly logger = new Logger(TenantAppOnlyProvider.name);

  private token: { value: string; expiresAt: number } | null = null;

  /** In-flight token request, so a burst of calls performs one handshake. */
  private pending: Promise<string> | null = null;

  constructor(private readonly config: GraphConfig) {
    super();
  }

  /**
   * `null` is an answer, not a failure: an address with no mailbox is an ineligible
   * interviewer (00 §02.12). Anything else throws, because a Graph outage must not be
   * mistaken for "this person cannot be assigned".
   */
  async resolveMailbox(email: string): Promise<MailboxRef | null> {
    const address = (email ?? '').trim().toLowerCase();
    if (!address) return null;

    const response = await this.call(
      `/users/${encodeURIComponent(address)}?$select=displayName,mail,userPrincipalName`,
      { operation: 'resolveMailbox', allow: [404] },
    );
    if (response.status === 404) return null;

    const user = (await response.json()) as {
      displayName?: string;
      mail?: string | null;
      userPrincipalName?: string;
    };
    // A tenant account without an Exchange mailbox has no `mail`. It is a user, but it
    // is not somewhere an interview can be booked.
    const mailbox = user.mail ?? null;
    if (!mailbox) return null;

    return { address: mailbox.toLowerCase(), displayName: user.displayName ?? null };
  }

  async workingHours(mailbox: MailboxRef): Promise<WorkingHours> {
    const response = await this.call(`${this.userPath(mailbox)}/mailboxSettings/workingHours`, {
      operation: 'workingHours',
    });
    return toWorkingHours((await response.json()) as GraphWorkingHours);
  }

  async busy(mailbox: MailboxRef, fromUtc: Date, toUtc: Date): Promise<Interval[]> {
    const response = await this.call(`${this.userPath(mailbox)}/calendar/getSchedule`, {
      operation: 'busy',
      method: 'POST',
      body: {
        schedules: [mailbox.address],
        startTime: { dateTime: fromUtc.toISOString(), timeZone: 'UTC' },
        endTime: { dateTime: toUtc.toISOString(), timeZone: 'UTC' },
        // The coarsest interval Graph accepts. Slot boundaries come from the schedule
        // items' own times, not from this view, so a finer one would buy nothing.
        availabilityViewInterval: 60,
      },
      // Without this the items come back in the mailbox's own zone, which would make
      // every timestamp depend on a setting the caller cannot see.
      headers: { Prefer: 'outlook.timezone="UTC"' },
    });

    return toBusyIntervals((await response.json()) as GraphScheduleResponse);
  }

  /**
   * The live re-check at submit time. Half-open, so a booking may begin exactly when
   * an event ends — no buffer is applied anywhere (02 §05.18).
   */
  async isFree(mailbox: MailboxRef, startUtc: Date, endUtc: Date): Promise<boolean> {
    const blocks = await this.busy(mailbox, startUtc, endUtc);
    return !blocks.some((block) => block.startUtc < endUtc && startUtc < block.endUtc);
  }

  /**
   * One event, in the interviewer's mailbox, with the candidate as an attendee.
   * Microsoft delivers the invite to both parties as a consequence, which is why this
   * release ships no mail transport at all (00 §02.10, §04.18).
   */
  async createEvent(mailbox: MailboxRef, event: CalendarEventDraft): Promise<EventId> {
    const response = await this.call(`${this.userPath(mailbox)}/events`, {
      operation: 'createEvent',
      method: 'POST',
      body: {
        subject: event.subject,
        body: { contentType: 'text', content: event.body },
        start: { dateTime: this.graphDateTime(event.startUtc), timeZone: 'UTC' },
        end: { dateTime: this.graphDateTime(event.endUtc), timeZone: 'UTC' },
        attendees: [
          {
            type: 'required',
            emailAddress: { address: event.attendee.email, name: event.attendee.name },
          },
        ],
      },
    });

    const created = (await response.json()) as { id?: string };
    if (!created.id) throw new Error('Graph created an event without returning its id');

    if (event.attachment) {
      try {
        await this.attach(mailbox, created.id, event.attachment);
      } catch (error) {
        // The event exists and the caller must know its id, or compensation cannot
        // cancel it. Rethrowing after naming the event is what keeps the booking atomic.
        this.logger.error(`Attachment failed for event ${created.id}: ${String(error)}`);
        await this.cancelEvent(mailbox, created.id).catch(() => undefined);
        throw error;
      }
    }

    return created.id;
  }

  /**
   * The event has attendees by the time anything can go wrong, so this cancels rather
   * than deletes: Microsoft then tells the candidate the interview is off instead of
   * leaving them holding an invite to nothing. A delete is the fallback, because a
   * failed compensation must still leave no event behind.
   */
  async cancelEvent(mailbox: MailboxRef, eventId: EventId): Promise<void> {
    try {
      await this.call(`${this.userPath(mailbox)}/events/${encodeURIComponent(eventId)}/cancel`, {
        operation: 'cancelEvent',
        method: 'POST',
        body: { comment: 'This interview could not be completed and has been cancelled.' },
      });
    } catch (error) {
      this.logger.warn(`Cancel failed for ${eventId}, deleting instead: ${String(error)}`);
      await this.call(`${this.userPath(mailbox)}/events/${encodeURIComponent(eventId)}`, {
        operation: 'deleteEvent',
        method: 'DELETE',
        allow: [404],
      });
    }
  }

  /* ---------------------------------------------------------------- *
   * Attachments — 00 §02.11
   * ---------------------------------------------------------------- */

  private async attach(
    mailbox: MailboxRef,
    eventId: string,
    attachment: CalendarAttachment,
  ): Promise<void> {
    const path = `${this.userPath(mailbox)}/events/${encodeURIComponent(eventId)}/attachments`;

    if (attachment.bytes.length <= INLINE_ATTACHMENT_MAX) {
      await this.call(path, {
        operation: 'attach',
        method: 'POST',
        body: {
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: attachment.fileName,
          contentType: attachment.contentType,
          contentBytes: attachment.bytes.toString('base64'),
        },
      });
      return;
    }

    const session = await this.call(`${path}/createUploadSession`, {
      operation: 'createUploadSession',
      method: 'POST',
      body: {
        AttachmentItem: {
          attachmentType: 'file',
          name: attachment.fileName,
          size: attachment.bytes.length,
          contentType: attachment.contentType,
        },
      },
    });

    const { uploadUrl } = (await session.json()) as { uploadUrl?: string };
    if (!uploadUrl) throw new Error('Graph created an upload session without an upload URL');

    await this.uploadInChunks(uploadUrl, attachment.bytes);
  }

  /**
   * The upload URL carries its own credential, so these requests are unauthenticated
   * on purpose — an `Authorization` header on them is an error, not a precaution.
   */
  private async uploadInChunks(uploadUrl: string, bytes: Buffer): Promise<void> {
    for (let offset = 0; offset < bytes.length; offset += UPLOAD_CHUNK_BYTES) {
      const chunk = bytes.subarray(offset, Math.min(offset + UPLOAD_CHUNK_BYTES, bytes.length));
      const last = offset + chunk.length;

      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Length': String(chunk.length),
          'Content-Range': `bytes ${offset}-${last - 1}/${bytes.length}`,
        },
        body: new Uint8Array(chunk),
      });

      if (!response.ok) {
        throw new GraphError(response.status, 'uploadChunk', await response.text());
      }
    }
  }

  /* ---------------------------------------------------------------- *
   * Transport
   * ---------------------------------------------------------------- */

  private userPath(mailbox: MailboxRef): string {
    return `/users/${encodeURIComponent(mailbox.address)}`;
  }

  /** Graph rejects the `Z` suffix on a `dateTime` it was told is already UTC. */
  private graphDateTime(instant: Date): string {
    return instant.toISOString().replace('Z', '');
  }

  private async call(
    path: string,
    options: {
      operation: string;
      method?: string;
      body?: unknown;
      headers?: Record<string, string>;
      /** Status codes returned to the caller instead of throwing. */
      allow?: number[];
    },
  ): Promise<Response> {
    const token = await this.accessToken();
    const response = await fetch(`${GRAPH}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    if (response.ok || (options.allow ?? []).includes(response.status)) return response;

    // The mailbox and the operation, never candidate data or CV bytes (00 §05.23).
    const error = new GraphError(response.status, options.operation, await response.text());
    this.logger.error(error.message);
    throw error;
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now()) return this.token.value;
    if (this.pending) return this.pending;

    this.pending = this.requestToken().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  private async requestToken(): Promise<string> {
    const response = await fetch(`${LOGIN}/${this.config.tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    });

    if (!response.ok) {
      // The secret is in the request, never in the log.
      throw new GraphError(response.status, 'token', await response.text());
    }

    const token = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!token.access_token) throw new Error('Graph returned no access token');

    this.token = {
      value: token.access_token,
      expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000 - TOKEN_SKEW_MS,
    };
    return this.token.value;
  }
}
