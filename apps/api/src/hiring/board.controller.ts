import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { OrgScopeGuard } from '../auth/org-scope.guard';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import { BoardScopeGuard } from './board-scope.guard';
import type { PlacementDto } from './board.service';
import { BoardService } from './board.service';

/**
 * The board's read (spec 05 §API).
 *
 * Guard order is the contract: `SessionGuard` establishes who is calling, `OrgScopeGuard`
 * refuses a URL whose organization disagrees with the session, and `BoardScopeGuard`
 * refuses a role that may not manage candidates — answering 404 rather than 403 for the
 * one caller who must not have the board's existence confirmed to them.
 */
@Controller('api/organizations/:orgId/hiring/vacancies')
@UseGuards(SessionGuard, OrgScopeGuard, BoardScopeGuard)
export class BoardController {
  constructor(private readonly boards: BoardService) {}

  @Get(':vacancyId/board')
  read(@Req() req: AuthenticatedRequest, @Param('vacancyId') vacancyId: string) {
    // Always the session's organization — the path parameter has only been compared.
    return this.boards.board(req.session!.organizationId, vacancyId, req.session!.accountId);
  }
}

/**
 * The board's one write, addressed by application because that is the row a drop moves.
 *
 * Shares its prefix with `ApplicationsController`, which owns the card's `:applicationId`
 * PATCH, and with `CvController`, which owns `:applicationId/cv`. Its guard is the
 * board's rather than the card's: an interviewer may write notes on their own candidate
 * and may not reorder anybody's board.
 */
@Controller('api/organizations/:orgId/hiring/applications')
@UseGuards(SessionGuard, OrgScopeGuard, BoardScopeGuard)
export class PlacementController {
  constructor(private readonly boards: BoardService) {}

  @Patch(':applicationId/placement')
  place(
    @Req() req: AuthenticatedRequest,
    @Param('applicationId') applicationId: string,
    @Body() dto: PlacementDto,
  ) {
    // A body carrying `position` is ignored rather than trusted: the dto type has no
    // such field and the service derives the only one written (05 §Validation.3).
    return this.boards.place(req.session!.organizationId, applicationId, dto);
  }
}
