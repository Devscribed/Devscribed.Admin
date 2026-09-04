import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { OrgScopeGuard } from '../auth/org-scope.guard';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import type { CriterionDto } from './criteria.service';
import { CriteriaService } from './criteria.service';
import { HiringManageGuard } from './hiring-manage.guard';

/**
 * The criteria library (hiring 06 §03).
 *
 * The same guard stack as categories, for the same reason: `user` and `viewer` have no
 * access to either library, and that includes the inline creation path — which is this
 * `POST`, reached from a candidate card mid-interview (06 §Actors).
 */
@Controller('api/organizations/:orgId/hiring/criteria')
@UseGuards(SessionGuard, OrgScopeGuard, HiringManageGuard)
export class CriteriaController {
  constructor(private readonly criteria: CriteriaService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest, @Query('includeArchived') includeArchived?: string) {
    // Absent means active only, which is what removes an archived criterion from the
    // card's add-autocomplete without removing it from anything else (06 §03.18).
    return this.criteria
      // Always the session's organization — the path parameter has only been compared.
      .list(req.session!.organizationId, includeArchived === 'true')
      .then((criteria) => ({ criteria }));
  }

  @Post()
  @HttpCode(201)
  create(@Req() req: AuthenticatedRequest, @Body() dto: CriterionDto) {
    return this.criteria.create(req.session!.organizationId, dto);
  }

  @Patch(':criterionId')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('criterionId') criterionId: string,
    @Body() dto: CriterionDto,
  ) {
    return this.criteria.update(req.session!.organizationId, criterionId, dto);
  }

  @Delete(':criterionId')
  remove(@Req() req: AuthenticatedRequest, @Param('criterionId') criterionId: string) {
    return this.criteria.remove(req.session!.organizationId, criterionId);
  }
}
