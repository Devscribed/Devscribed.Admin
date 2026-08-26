import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { OrgScopeGuard } from '../auth/org-scope.guard';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import type { CategoryDto } from './categories.service';
import { CategoriesService } from './categories.service';
import { HiringManageGuard } from './hiring-manage.guard';

/**
 * The category library (hiring 06 §02).
 *
 * The same guard stack as vacancies, for the same reason: `user` and `viewer` have no
 * access to the library at all, and that includes the inline creation path — which is
 * the vacancy endpoints, behind this same guard (06 §Actors).
 */
@Controller('api/organizations/:orgId/hiring/categories')
@UseGuards(SessionGuard, OrgScopeGuard, HiringManageGuard)
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    // Always the session's organization — the path parameter has only been compared.
    return this.categories.list(req.session!.organizationId).then((categories) => ({ categories }));
  }

  @Post()
  @HttpCode(201)
  create(@Req() req: AuthenticatedRequest, @Body() dto: CategoryDto) {
    return this.categories.create(req.session!.organizationId, dto);
  }

  @Patch(':categoryId')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('categoryId') categoryId: string,
    @Body() dto: CategoryDto,
  ) {
    return this.categories.update(req.session!.organizationId, categoryId, dto);
  }

  @Delete(':categoryId')
  remove(@Req() req: AuthenticatedRequest, @Param('categoryId') categoryId: string) {
    return this.categories.remove(req.session!.organizationId, categoryId);
  }
}
