import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { OrgScopeGuard } from '../auth/org-scope.guard';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import { MyInterviewsService } from './my-interviews.service';

/**
 * My interviews (spec 03 §06) — the one hiring route with no role guard on it.
 *
 * That is deliberate rather than an omission. Every other hiring endpoint asks what the
 * caller's role is; this one asks whether anybody has assigned them an interview, which
 * is a question about rows and belongs in the service that reads them. `admin` and
 * `manager` see the same screen showing their own assigned interviews (03 §06.30), and a
 * `viewer` cannot be assigned at all, so the row count answers for every role at once.
 */
@Controller('api/organizations/:orgId/hiring/my-interviews')
@UseGuards(SessionGuard, OrgScopeGuard)
export class MyInterviewsController {
  constructor(private readonly interviews: MyInterviewsService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    // Always the session's organization — the path parameter has only been compared.
    return this.interviews.list(req.session!.organizationId, req.session!.accountId);
  }
}
