import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { OrgScopeGuard } from '../auth/org-scope.guard';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import {
  BoardService,
  type CreateColumnInput,
  type ReorderColumnsInput,
  type UpdateColumnInput,
} from './board.service';

@Controller('api/organizations/:orgId')
@UseGuards(SessionGuard, OrgScopeGuard)
export class BoardController {
  constructor(private readonly board: BoardService) {}

  @Get('projects/:projectId/board')
  async getBoard(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
  ) {
    return this.board.getBoard(req.session!, projectId);
  }

  @Post('projects/:projectId/board/columns')
  @HttpCode(201)
  async createColumn(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body() body: CreateColumnInput,
  ) {
    return this.board.createColumn(req.session!, projectId, body);
  }

  // Order matters — the `reorder` route must be declared BEFORE `:columnId` so Nest
  // does not treat the literal "reorder" as a columnId path parameter.
  @Put('projects/:projectId/board/columns/reorder')
  @HttpCode(200)
  async reorderColumns(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body() body: ReorderColumnsInput,
  ) {
    return this.board.reorderColumns(req.session!, projectId, body);
  }

  @Put('projects/:projectId/board/columns/:columnId')
  @HttpCode(200)
  async renameColumn(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('columnId') columnId: string,
    @Body() body: UpdateColumnInput,
  ) {
    return this.board.renameColumn(req.session!, projectId, columnId, body);
  }

  @Delete('projects/:projectId/board/columns/:columnId')
  @HttpCode(200)
  async deleteColumn(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('columnId') columnId: string,
  ) {
    return this.board.deleteColumn(req.session!, projectId, columnId);
  }
}
