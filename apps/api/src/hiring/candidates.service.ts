import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  POSITION_STEP,
  validateApplicationPatch,
  type ApplicationStatus,
} from '@devscribed/validation';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { ViewerTimeZoneService } from './viewer-time-zone.service';

export interface ApplicationPatchDto {
  interviewNotes?: unknown;
  conclusion?: unknown;
  status?: unknown;
}

/**
 * The candidate card (spec 04) — one candidate, their applications, and the three
 * fields the team writes during an interview.
 *
 * Everything on this screen is scoped by the session's organization, and a record
 * outside it answers 404 rather than 403: a permission error would confirm that the
 * candidate exists, and the interviewer scope of a later phase answers the same way, so
 * the two must not be distinguishable by their status code (04 §01.4).
 */
@Injectable()
export class CandidatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly viewerTimeZone: ViewerTimeZoneService,
  ) {}

  async card(organizationId: string, candidateId: string, viewerAccountId: string) {
    const candidate = await this.prisma.candidate.findFirst({
      where: { id: candidateId, organizationId },
      select: { id: true, firstName: true, lastName: true, email: true, createdAt: true },
    });
    if (!candidate) throw new NotFoundException();

    const applications = await this.prisma.application.findMany({
      where: { candidateId, organizationId },
      // Most recent interview first (04 §03.13); `id` keeps two interviews booked at
      // the same instant in a stable order across renders.
      orderBy: [{ start: 'desc' }, { id: 'asc' }],
      include: {
        vacancy: {
          select: {
            id: true,
            title: true,
            durationMinutes: true,
            interviewer: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
      },
    });

    return {
      candidate: { ...candidate, createdAt: candidate.createdAt.toISOString() },
      viewerTimeZone: await this.viewerTimeZone.forViewer(
        viewerAccountId,
        applications[0]?.vacancy.interviewer.email,
      ),
      applications: applications.map((application) => ({
        id: application.id,
        status: application.status,
        isCancelled: application.isCancelled,
        submittedName: application.submittedName,
        vacancy: {
          id: application.vacancy.id,
          title: application.vacancy.title,
          durationMinutes: application.vacancy.durationMinutes,
        },
        interviewer: {
          accountId: application.vacancy.interviewer.id,
          fullName: `${application.vacancy.interviewer.firstName} ${application.vacancy.interviewer.lastName}`,
        },
        startUtc: application.start.toISOString(),
        /**
         * The booked end, not `vacancy.durationMinutes`. Changing a vacancy's length
         * leaves scheduled interviews at the length they were booked at (01 §04.13), so
         * the vacancy's current setting is the wrong thing to render against an
         * interview that already happened.
         */
        endUtc: application.end.toISOString(),
        bookedTimeZone: application.timeZone,
        note: application.note,
        cv: application.cvFileName
          ? { fileName: application.cvFileName, sizeBytes: application.cvSizeBytes }
          : null,
        // Stored as null when never written; the editor is a string either way.
        interviewNotes: application.interviewNotes ?? '',
        conclusion: application.conclusion ?? '',
        /**
         * Assessments arrive with the criteria library (04 §05, phase 7). The key is
         * present so the card renders the same shape before and after — the section it
         * feeds is the one place on this screen a missing array would read as a load
         * failure rather than an empty list.
         */
        criteria: [] as unknown[],
      })),
    };
  }

  /**
   * Notes, conclusion and status — the whole editable half of the card, in one PATCH.
   *
   * All three are shared fields with last-write-wins (04 §04.18): there is no version
   * to compare and no conflict to report, because one person is on the call and a
   * second member watching is reading, not racing.
   */
  async patchApplication(organizationId: string, applicationId: string, dto: ApplicationPatchDto) {
    const existing = await this.prisma.application.findFirst({
      where: { id: applicationId, organizationId },
      select: { id: true, vacancyId: true, status: true, position: true },
    });
    // 404 before validation, so a caller guessing ids learns nothing from the shape of
    // the error it gets back.
    if (!existing) throw new NotFoundException();

    const validation = validateApplicationPatch(dto);
    if (!validation.valid) {
      if (validation.error === 'invalid_body') {
        throw new BadRequestException({ error: 'invalid_body' });
      }
      if (validation.error === 'invalid_status') {
        throw new UnprocessableEntityException({ error: 'invalid_status' });
      }
      throw new UnprocessableEntityException({ error: 'too_long', fields: validation.fields });
    }

    const { interviewNotes, conclusion, status } = validation.value;
    const moving = status !== undefined && status !== existing.status;

    const saved = await this.prisma.$transaction(async (tx) => {
      const position = moving
        ? await this.topOf(tx, existing.vacancyId, status)
        : existing.position;

      return tx.application.update({
        where: { id: applicationId },
        data: {
          ...(interviewNotes !== undefined ? { interviewNotes } : {}),
          ...(conclusion !== undefined ? { conclusion } : {}),
          ...(status !== undefined ? { status } : {}),
          ...(moving ? { position } : {}),
        },
        select: { status: true, position: true, updatedAt: true },
      });
    });

    // `savedAt` is the row's own `updatedAt`, so the indicator on the card shows when
    // the database accepted the write rather than when the browser sent it.
    return {
      savedAt: saved.updatedAt.toISOString(),
      status: saved.status,
      position: saved.position,
    };
  }

  /**
   * The position that puts a card first in its target column (04 §06.30).
   *
   * Gap integers, so arriving at the top is one subtraction and one row written —
   * nothing else in the column moves. Fine-grained ordering, and the rebalance that
   * eventually follows from repeated inserts, are the board's job (05 §03).
   */
  private async topOf(
    tx: Prisma.TransactionClient,
    vacancyId: string,
    status: ApplicationStatus,
  ): Promise<number> {
    const top = await tx.application.aggregate({
      where: { vacancyId, status },
      _min: { position: true },
    });
    return top._min.position === null ? POSITION_STEP : top._min.position - POSITION_STEP;
  }
}
