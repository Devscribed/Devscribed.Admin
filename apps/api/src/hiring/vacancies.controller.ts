import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { OrgScopeGuard } from '../auth/org-scope.guard';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import { HiringManageGuard } from './hiring-manage.guard';
import type { CreateVacancyDto } from './vacancies.service';
import { VacanciesService } from './vacancies.service';

/**
 * Guard order is the contract: `SessionGuard` establishes who is calling,
 * `OrgScopeGuard` refuses a URL whose organization disagrees with the session, and
 * `HiringManageGuard` refuses a role that may not manage hiring.
 */
@Controller('api/organizations/:orgId/hiring')
@UseGuards(SessionGuard, OrgScopeGuard, HiringManageGuard)
export class VacanciesController {
  constructor(private readonly vacancies: VacanciesService) {}

  @Get('interviewers')
  interviewers(@Req() req: AuthenticatedRequest) {
    return this.vacancies
      .interviewers(req.session!.organizationId)
      .then((interviewers) => ({ interviewers }));
  }

  @Get('vacancies')
  list(@Req() req: AuthenticatedRequest) {
    // Always the session's organization — the path parameter has only been compared.
    return this.vacancies.list(req.session!.organizationId).then((vacancies) => ({ vacancies }));
  }

  @Post('vacancies')
  @HttpCode(201)
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateVacancyDto) {
    // A body carrying `organizationId` is ignored rather than trusted (01 §Validation.7):
    // the dto type has no such field and the session supplies the only one used.
    return this.vacancies.create(req.session!.organizationId, dto);
  }

  @Get('vacancies/:vacancyId')
  get(@Req() req: AuthenticatedRequest, @Param('vacancyId') vacancyId: string) {
    return this.vacancies.get(req.session!.organizationId, vacancyId);
  }
}
