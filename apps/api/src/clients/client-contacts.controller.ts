import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { OrgScopeGuard } from '../auth/org-scope.guard';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import { ClientContactsService } from './client-contacts.service';

/**
 * Requests spec 03 — the contacts of one client. Guard chain and 404 discipline are
 * `ClientsController`'s: `SessionGuard` attaches the session and the principal,
 * `OrgScopeGuard` answers 404 to a URL whose `:orgId` disagrees with the session and to
 * a client principal, who never reaches this route. The capability is decided in the
 * service so a caller who lacks it gets the same bare 404 (REQ-03-008).
 */
@Controller('api/organizations/:orgId')
@UseGuards(SessionGuard, OrgScopeGuard)
export class ClientContactsController {
  constructor(private readonly contacts: ClientContactsService) {}

  @Get('clients/:clientId/contacts')
  async list(@Req() req: AuthenticatedRequest, @Param('clientId') clientId: string) {
    return this.contacts.listContacts(req.session!, clientId);
  }

  @Post('clients/:clientId/contacts')
  @HttpCode(201)
  async invite(
    @Req() req: AuthenticatedRequest,
    @Param('clientId') clientId: string,
    @Body() body: { email?: unknown; firstName?: unknown; lastName?: unknown },
  ) {
    return this.contacts.inviteContact(req.session!, clientId, body ?? {});
  }

  @Delete('clients/:clientId/contacts/:contactId')
  @HttpCode(200)
  async remove(
    @Req() req: AuthenticatedRequest,
    @Param('clientId') clientId: string,
    @Param('contactId') contactId: string,
  ) {
    return this.contacts.removeContact(req.session!, clientId, contactId);
  }
}
