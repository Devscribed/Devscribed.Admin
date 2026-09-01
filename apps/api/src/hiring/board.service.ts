import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import {
  BOARD_COLUMNS,
  type CancellationFacts,
  type ScheduleActor,
  positionBetween,
  rebalancedPositions,
  resolveNeighbours,
  sortColumn,
  validatePlacement,
  type ApplicationStatus,
  type ColumnCard,
} from '@devscribed/validation';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { ViewerTimeZoneService } from './viewer-time-zone.service';

export interface PlacementDto {
  status?: unknown;
  afterApplicationId?: unknown;
  beforeApplicationId?: unknown;
  /**
   * Deliberately absent. `position` is computed from the neighbours and never read off
   * the request — this interface is where that would have to be declared for it to be,
   * and it is not (05 §Validation.3).
   */
}

/**
 * The board (spec 05): five columns of one vacancy's applications, and the one write
 * that moves a card between or within them.
 *
 * `Application.status` is the column and `Application.position` orders it, so a move is
 * a single row. The arithmetic lives in `@devscribed/validation` beside the statuses it
 * orders; what is here is the part that needs a transaction — reading the target column
 * as it is *now*, and renumbering it when a gap has closed.
 */
@Injectable()
export class BoardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly viewerTimeZone: ViewerTimeZoneService,
  ) {}

  async board(organizationId: string, vacancyId: string, viewerAccountId: string) {
    const vacancy = await this.prisma.vacancy.findFirst({
      // Scoped by the session's organization, never by the path alone.
      where: { id: vacancyId, organizationId },
      select: {
        id: true,
        title: true,
        durationMinutes: true,
        interviewer: { select: { email: true } },
      },
    });
    if (!vacancy) throw new NotFoundException();

    const applications = await this.prisma.application.findMany({
      // A deleted candidate has no card here (03 §11.63). The application itself is not
      // deleted and keeps the position it holds, so the column it belongs to is exactly
      // where it reappears if the same address books again — nothing is renumbered while
      // it is away, and nothing has to be put back.
      where: { vacancyId, organizationId, candidate: { deletedAt: null } },
      // The same order the board renders in, so a column arrives sorted rather than
      // being re-sorted per render (05 §03.7).
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        candidateId: true,
        status: true,
        position: true,
        start: true,
        cvKey: true,
        isCancelled: true,
        conclusion: true,
        submittedName: true,
        candidate: { select: { firstName: true, lastName: true } },
        /*
         * Only the cancellation, and only for the badge: "the candidate withdrew" and
         * "we called it off" are different facts to a hiring manager scanning a column
         * (05 §07.26). The rest of the log belongs to the card, and shipping every
         * reschedule on the vacancy to draw one badge would be the wrong grain.
         */
        scheduleEvents: {
          where: { type: 'cancelled' },
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          take: 1,
          select: {
            actor: true,
            reason: true,
            createdAt: true,
            actorAccount: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    return {
      vacancy: { id: vacancy.id, title: vacancy.title, durationMinutes: vacancy.durationMinutes },
      viewerTimeZone: await this.viewerTimeZone.forViewer(
        viewerAccountId,
        vacancy.interviewer.email,
      ),
      // Every column, in the documented order, even when empty — an absent column would
      // be indistinguishable from a column that failed to load (05 §API).
      columns: BOARD_COLUMNS.map((status) => {
        const cards = applications.filter((application) => application.status === status);
        return {
          status,
          count: cards.length,
          cards: cards.map((application) => ({
            applicationId: application.id,
            candidateId: application.candidateId,
            /**
             * The candidate's current name, which the latest booking may have corrected
             * (02 §27) — not the frozen `submittedName`. The board is a view of people
             * to talk to, and the card page is where the two are reconciled.
             */
            name: `${application.candidate.firstName} ${application.candidate.lastName}`,
            startUtc: application.start.toISOString(),
            position: application.position,
            hasCv: application.cvKey !== null,
            isCancelled: application.isCancelled,
            /** Who cancelled, for the badge and its tooltip. Null when nobody did. */
            cancellation: cancellationOf(application),
            /**
             * Whether a conclusion exists, never the conclusion itself: the board's only
             * use for it is the missing-conclusion marker, and shipping every assessment
             * on the vacancy to draw a flag would be the wrong grain twice over
             * (05 §05.17, §API).
             */
            hasConclusion: (application.conclusion ?? '').trim().length > 0,
          })),
        };
      }),
    };
  }

  /**
   * A drop: the target column, and the two cards it landed between.
   *
   * The client names neighbours rather than a position because the position it can see
   * is the one it last fetched. Resolving the ids against the column *now* is what makes
   * a stale board answer `409` instead of writing a number that has since been reused
   * (05 §API PATCH).
   */
  async place(organizationId: string, applicationId: string, dto: PlacementDto) {
    const application = await this.prisma.application.findFirst({
      where: { id: applicationId, organizationId },
      select: { id: true, vacancyId: true },
    });
    // 404 before validation, so a caller guessing ids learns nothing from the shape of
    // the error it gets back.
    if (!application) throw new NotFoundException();

    const validation = validatePlacement(dto);
    if (!validation.valid) throw new UnprocessableEntityException({ error: 'invalid_status' });
    const placement = validation.value;

    return this.prisma.$transaction(async (tx) => {
      const column = sortColumn(
        await tx.application.findMany({
          where: {
            vacancyId: application.vacancyId,
            status: placement.status,
            // A card being dragged within its own column is not its own neighbour, and
            // must not occupy an index in the column it is being placed into.
            id: { not: applicationId },
          },
          select: { id: true, position: true },
        }),
      );

      const neighbours = resolveNeighbours(column, placement);
      if (!neighbours.valid) throw new ConflictException({ error: 'stale_neighbours' });

      const computed = positionBetween(neighbours.above, neighbours.below);
      const position =
        'position' in computed
          ? await this.moveOne(tx, applicationId, placement.status, computed.position)
          : await this.rebalance(tx, applicationId, placement.status, column, neighbours.index);

      return { applicationId, status: placement.status, position };
    });
  }

  /**
   * The ordinary move: one row, and nothing else in either column changes (05 §03.9).
   */
  private async moveOne(
    tx: Prisma.TransactionClient,
    applicationId: string,
    status: ApplicationStatus,
    position: number,
  ): Promise<number> {
    await tx.application.update({ where: { id: applicationId }, data: { status, position } });
    return position;
  }

  /**
   * The gap between the neighbours has closed, so this one column goes back to clean
   * multiples of 1000 with the moved card in its new place (05 §03.10).
   *
   * In the same transaction as the move, because a column half-renumbered is a column
   * whose order is not the one anybody chose. Rows already sitting at the right number
   * are skipped: on a board of tens of cards this is a handful of updates, and the
   * common case — a rebalance triggered by one tight gap near the top — rewrites only
   * the rows below it.
   */
  private async rebalance(
    tx: Prisma.TransactionClient,
    applicationId: string,
    status: ApplicationStatus,
    column: ColumnCard[],
    index: number,
  ): Promise<number> {
    const ordered = [...column];
    ordered.splice(index, 0, { id: applicationId, position: 0 });

    const positions = rebalancedPositions(ordered.length);

    for (const [at, card] of ordered.entries()) {
      const moved = card.id === applicationId;
      if (!moved && card.position === positions[at]) continue;
      await tx.application.update({
        where: { id: card.id },
        // The moved card is the only one whose status can differ; writing it for the
        // rest would be the value they already hold.
        data: { position: positions[at], ...(moved ? { status } : {}) },
      });
    }

    return positions[index];
  }
}

/**
 * The newest `cancelled` entry, of which there is at most one — cancelling is not
 * undoable, so there is never a second.
 *
 * `isCancelled` is still the flag the board queries; this only says who set it. Board
 * state is never derived by replaying the log (07 §11.51).
 */
function cancellationOf(application: {
  submittedName: string;
  scheduleEvents: Array<{
    actor: string;
    reason: string | null;
    createdAt: Date;
    actorAccount: { firstName: string; lastName: string } | null;
  }>;
}): CancellationFacts | null {
  const cancelled = application.scheduleEvents[0];
  if (!cancelled) return null;
  return {
    actor: cancelled.actor as ScheduleActor,
    byName: cancelled.actorAccount
      ? `${cancelled.actorAccount.firstName} ${cancelled.actorAccount.lastName}`
      : application.submittedName,
    atUtc: cancelled.createdAt.toISOString(),
    reason: cancelled.reason,
  };
}
