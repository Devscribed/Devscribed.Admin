import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CLIENT_MESSAGES,
  CLIENT_USER_MESSAGES,
  CLIENT_INVITATION_ROLE,
  validateClientContactEmail,
} from '@devscribed/validation';
import { randomUUID } from 'node:crypto';
import type { SessionPayload } from '../auth/session.service';
import {
  generateInvitationToken,
  invitationTokenExpiry,
} from '../invitations/invitation-token';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma.service';
import { ClientsService } from './clients.service';

/** One row of the contacts list (requests spec 03 GET .../contacts contract). */
export interface ClientContactRow {
  /** The `ClientMembership` id once the invitation has been accepted; the pending
   * `Invitation`'s id before that, which is the only row that exists yet. */
  id: string;
  email: string;
  displayName: string | null;
  /** `invited` | `active` | `removed`. */
  status: string;
  invitedAt: string | null;
  joinedAt: string | null;
}

/**
 * Requests spec 03 — the people at a client who hold a principal of the organization.
 *
 * Every refusal for a caller lacking the capability is a bare 404, never a 403 naming
 * it: the client's own detail route answers that caller 404, so a distinctive answer
 * here would say the client exists to somebody who may not see it (REQ-03-008). The two
 * gates are `ClientsService`'s own, so the two surfaces cannot drift apart.
 *
 * Every query filters on `session.organizationId`, which the caller's membership
 * carries; the path `clientId` is a selector only within that scope.
 */
@Injectable()
export class ClientContactsService {
  private readonly logger = new Logger(ClientContactsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clients: ClientsService,
    private readonly mail: MailService,
  ) {}

  /** `GET …/clients/:clientId/contacts`. `view-clients` only, else 404. */
  async listContacts(
    session: SessionPayload,
    clientId: string,
  ): Promise<{ contacts: ClientContactRow[] }> {
    const caller = await this.clients.requireViewCapability(session);
    const client = await this.requireClient(caller.organizationId, clientId);

    const [memberships, invitations] = await Promise.all([
      this.prisma.clientMembership.findMany({
        where: { clientId: client.id, organizationId: caller.organizationId },
        include: { account: { select: { email: true, firstName: true, lastName: true } } },
      }),
      this.prisma.invitation.findMany({
        where: {
          clientId: client.id,
          organizationId: caller.organizationId,
          role: CLIENT_INVITATION_ROLE,
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // The latest invitation per address, whatever its status — it is where `invitedAt`
    // comes from for a contact who has since accepted.
    const invitedAt = new Map<string, Date>();
    const pending = new Map<string, { id: string; createdAt: Date }>();
    for (const invitation of invitations) {
      invitedAt.set(invitation.email, invitation.createdAt);
      if (invitation.status === 'pending') {
        pending.set(invitation.email, { id: invitation.id, createdAt: invitation.createdAt });
      }
    }

    const rows: ClientContactRow[] = memberships.map((row) => ({
      id: row.id,
      email: row.account.email,
      displayName: `${row.account.firstName} ${row.account.lastName}`.trim(),
      // `invited` is the state of an address with no row of its own yet, so a row that
      // exists is `active` or `removed` and nothing else.
      status: row.status,
      invitedAt: invitedAt.get(row.account.email)?.toISOString() ?? null,
      joinedAt: row.joinedAt.toISOString(),
    }));

    const known = new Set(memberships.map((row) => row.account.email));
    for (const [email, invitation] of pending) {
      if (known.has(email)) continue;
      rows.push({
        id: invitation.id,
        email,
        displayName: null,
        status: 'invited',
        invitedAt: invitation.createdAt.toISOString(),
        joinedAt: null,
      });
    }

    rows.sort((a, b) => a.email.localeCompare(b.email));
    return { contacts: rows };
  }

  /**
   * `POST …/clients/:clientId/contacts`. `manage-clients` only, else 404.
   *
   * Writes an `Invitation` carrying the client's id and the role value `client`
   * (REQ-03-009), invalidating every other pending invitation for that address in the
   * organization — staff or client alike — in the same transaction (REQ-03-011). The
   * token, its seven-day expiry and the accept screen are the staff invitation's, so a
   * contact accepts through the screen that already exists.
   */
  async inviteContact(
    session: SessionPayload,
    clientId: string,
    body: { email?: unknown; firstName?: unknown; lastName?: unknown },
  ): Promise<{ contact: { id: string; email: string; displayName: string | null; status: string } }> {
    const caller = await this.clients.requireManageCapability(session);
    const client = await this.requireClient(caller.organizationId, clientId);

    const email = validateClientContactEmail(body?.email);
    if (!email.valid) {
      throw new BadRequestException({
        error: 'validation_error',
        fields: { email: email.error },
      });
    }

    // REQ-03-010 — an archived client takes no contacts.
    if (client.status !== 'active') {
      throw new BadRequestException({
        error: 'client_archived',
        message: CLIENT_MESSAGES.clientArchived,
      });
    }

    // REQ-03-013 — the address holds no `ClientMembership` at another client of this
    // organization, and no ACTIVE one at this client. Any status at another client
    // refuses: returning a removed row to `active` under a new client would rebind a row
    // the old client's requests still resolve through.
    const existing = await this.prisma.clientMembership.findFirst({
      where: { account: { email: email.value }, organizationId: caller.organizationId },
      select: { clientId: true, status: true },
    });
    if (existing && (existing.clientId !== client.id || existing.status === 'active')) {
      throw new ConflictException({
        error: 'already_linked',
        message: CLIENT_USER_MESSAGES.alreadyLinked,
      });
    }

    const { token, tokenHash } = generateInvitationToken();
    const createdAt = new Date();

    const invitation = await this.prisma.$transaction(async (tx) => {
      // REQ-03-011 — one live pending invitation per (email, organization), whichever
      // kind the superseded one is. The same `updateMany` the staff invitation uses.
      await tx.invitation.updateMany({
        where: { email: email.value, organizationId: caller.organizationId, status: 'pending' },
        data: { status: 'invalidated' },
      });
      return tx.invitation.create({
        data: {
          email: email.value,
          role: CLIENT_INVITATION_ROLE,
          organizationId: caller.organizationId,
          clientId: client.id,
          inviterMembershipId: caller.id,
          tokenHash,
          createdAt,
          expiresAt: invitationTokenExpiry(createdAt),
          status: 'pending',
        },
      });
    });

    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: caller.organizationId },
    });

    try {
      await this.mail.sendInvitation({
        to: email.value,
        organizationName: organization.name,
        organizationId: organization.id,
        role: CLIENT_INVITATION_ROLE,
        token,
        acceptUrl: this.acceptUrl(token),
      });
    } catch (error) {
      // A dispatch failure must not undo the already-persisted invitation.
      this.logger.error(`Contact invitation dispatch failed for ${email.value}`, error as Error);
    }

    const hint = this.nameHint(body);
    return {
      contact: {
        id: invitation.id,
        email: email.value,
        displayName: hint,
        status: 'invited',
      },
    };
  }

  /**
   * `DELETE …/clients/:clientId/contacts/:contactId`. `manage-clients` only, else 404.
   *
   * REQ-03-006 — the status write and the `securityStamp` rotation share one
   * transaction, so there is no window in which the row is removed and the stamp is not.
   * `SessionGuard` re-reads that stamp on every request, so every live session of the
   * removed contact ends on their next call.
   */
  async removeContact(
    session: SessionPayload,
    clientId: string,
    contactId: string,
  ): Promise<{ contact: ClientContactRow }> {
    const caller = await this.clients.requireManageCapability(session);
    const client = await this.requireClient(caller.organizationId, clientId);

    const contact = await this.prisma.clientMembership.findFirst({
      where: { id: contactId, clientId: client.id, organizationId: caller.organizationId },
      include: { account: { select: { email: true, firstName: true, lastName: true } } },
    });
    if (!contact) throw new NotFoundException();

    if (contact.status !== 'active') {
      throw new ConflictException({
        error: 'already_removed',
        message: CLIENT_USER_MESSAGES.alreadyRemoved,
      });
    }

    const removedAt = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.clientMembership.update({
        where: { id: contact.id },
        data: {
          status: 'removed',
          removedAt,
          removedByAccountId: caller.accountId,
        },
      });
      await tx.account.update({
        where: { id: contact.accountId },
        data: { securityStamp: randomUUID() },
      });
      return row;
    });

    return {
      contact: {
        id: updated.id,
        email: contact.account.email,
        displayName: `${contact.account.firstName} ${contact.account.lastName}`.trim(),
        status: updated.status,
        invitedAt: null,
        joinedAt: updated.joinedAt.toISOString(),
      },
    };
  }

  /**
   * The named client, inside the caller's own organization. A client of another
   * organization and one that does not exist answer alike, as the client's own detail
   * route already answers them.
   */
  private async requireClient(organizationId: string, clientId: string) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, organizationId },
      select: { id: true, status: true },
    });
    if (!client) throw new NotFoundException();
    return client;
  }

  /**
   * The optional first/last name a contact manager may type beside the address. There is
   * nowhere to keep them until the account exists — the invitation carries no name
   * columns — so they are echoed back on the created row and the list shows the names
   * the account itself carries from acceptance onwards.
   */
  private nameHint(body: { firstName?: unknown; lastName?: unknown }): string | null {
    const first = typeof body?.firstName === 'string' ? body.firstName.trim() : '';
    const last = typeof body?.lastName === 'string' ? body.lastName.trim() : '';
    const hint = `${first} ${last}`.trim();
    return hint.length > 0 ? hint : null;
  }

  private acceptUrl(token: string): string {
    const base = process.env.WEB_ORIGIN || 'http://localhost:3000';
    return `${base}/accept-invite?token=${encodeURIComponent(token)}`;
  }
}
