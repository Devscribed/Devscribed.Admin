import { Controller, Get, Header, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { OrgScopeGuard } from '../auth/org-scope.guard';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import { ReportsService, type AmountsOwedQueryInput } from './reports.service';

/**
 * Spec reports/01 — Amounts Owed endpoints. Guard order copied from
 * `HolidaysController`: `SessionGuard` authenticates and re-reads the security
 * stamp, `OrgScopeGuard` 404s a URL whose `:orgId` disagrees with the session.
 * Capability checks live in the service because this resource mixes 404 (missing
 * `view-*` capability, per spec §Owner scope requirement 7) and 403 (missing
 * `export-reports` for a PDF endpoint, per spec §Security).
 */
@Controller('api/organizations/:orgId')
@UseGuards(SessionGuard, OrgScopeGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('reports/amounts-owed')
  async amountsOwed(@Req() req: AuthenticatedRequest, @Query() query: AmountsOwedQueryInput) {
    return this.reports.runAmountsOwed(req.session!, 'all', query);
  }

  @Get('reports/amounts-owed/my')
  async amountsOwedMy(@Req() req: AuthenticatedRequest, @Query() query: AmountsOwedQueryInput) {
    return this.reports.runAmountsOwed(req.session!, 'my', query);
  }

  @Get('reports/amounts-owed/pdf')
  async amountsOwedPdf(
    @Req() req: AuthenticatedRequest,
    @Query() query: AmountsOwedQueryInput,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.reports.renderAmountsOwedPdf(
      req.session!,
      'all',
      query,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).send(buffer);
  }

  @Get('reports/amounts-owed/pdf/my')
  async amountsOwedPdfMy(
    @Req() req: AuthenticatedRequest,
    @Query() query: AmountsOwedQueryInput,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.reports.renderAmountsOwedPdf(
      req.session!,
      'my',
      query,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).send(buffer);
  }
}
