import { Controller, Get, Header, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { OrgScopeGuard } from '../auth/org-scope.guard';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import {
  ReportsService,
  type AmountsOwedQueryInput,
  type TimeAndActivityQueryInput,
  type TimeOffQueryInput,
} from './reports.service';

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

  /* -------------------------------------------------------------- *
   * Time & Activity — spec reports/01 second slice
   * -------------------------------------------------------------- */

  @Get('reports/time-and-activity')
  async timeAndActivity(
    @Req() req: AuthenticatedRequest,
    @Query() query: TimeAndActivityQueryInput,
  ) {
    return this.reports.runTimeAndActivity(req.session!, 'all', query);
  }

  @Get('reports/time-and-activity/my')
  async timeAndActivityMy(
    @Req() req: AuthenticatedRequest,
    @Query() query: TimeAndActivityQueryInput,
  ) {
    return this.reports.runTimeAndActivity(req.session!, 'my', query);
  }

  @Get('reports/time-and-activity/pdf')
  async timeAndActivityPdf(
    @Req() req: AuthenticatedRequest,
    @Query() query: TimeAndActivityQueryInput,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.reports.renderTimeAndActivityPdf(
      req.session!,
      'all',
      query,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).send(buffer);
  }

  @Get('reports/time-and-activity/pdf/my')
  async timeAndActivityPdfMy(
    @Req() req: AuthenticatedRequest,
    @Query() query: TimeAndActivityQueryInput,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.reports.renderTimeAndActivityPdf(
      req.session!,
      'my',
      query,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).send(buffer);
  }

  /* -------------------------------------------------------------- *
   * Time Off — spec reports/01 third slice
   * -------------------------------------------------------------- */

  @Get('reports/time-off')
  async timeOff(@Req() req: AuthenticatedRequest, @Query() query: TimeOffQueryInput) {
    return this.reports.runTimeOff(req.session!, 'all', query);
  }

  @Get('reports/time-off/my')
  async timeOffMy(@Req() req: AuthenticatedRequest, @Query() query: TimeOffQueryInput) {
    return this.reports.runTimeOff(req.session!, 'my', query);
  }

  @Get('reports/time-off/pdf')
  async timeOffPdf(
    @Req() req: AuthenticatedRequest,
    @Query() query: TimeOffQueryInput,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.reports.renderTimeOffPdf(
      req.session!,
      'all',
      query,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).send(buffer);
  }

  @Get('reports/time-off/pdf/my')
  async timeOffPdfMy(
    @Req() req: AuthenticatedRequest,
    @Query() query: TimeOffQueryInput,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.reports.renderTimeOffPdf(
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
