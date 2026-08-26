import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  HIRING_MESSAGES,
  POSITION_STEP,
  validateApplicationPatch,
  validateAssessment,
  type ApplicationStatus,
  type AssessmentInput,
  type CriterionType,
} from '@devscribed/validation';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { ViewerTimeZoneService } from './viewer-time-zone.service';

export interface ApplicationPatchDto {
  interviewNotes?: unknown;
  conclusion?: unknown;
  status?: unknown;
}

/** One assessment, as the card reads it back (04 §API). */
export interface PresentedAssessment {
  criterionId: string;
  name: string;
  type: CriterionType;
  /** So the card can mark a chip whose criterion has since left the autocomplete. */
  isArchived: boolean;
  valueId: string | null;
  /** Resolved here, because the card renders a label and stores an id. */
  valueLabel: string | null;
  valueBool: boolean | null;
  valueNumber: number | null;
  valueText: string | null;
}

/**
 * The candidate card (spec 04) — one candidate, their applications, and the three
 * fields the team writes during an interview.
 *
 * Everything on this screen is scoped by the session's organization, and a record
 * outside it answers 404 rather than 403: a permission error would confirm that the
 * candidate exists, and `InterviewerScopeGuard` answers the same way for a candidate
 * the caller may not see, so the two are not distinguishable by their status code
 * (04 §01.4).
 */
@Injectable()
export class CandidatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly viewerTimeZone: ViewerTimeZoneService,
  ) {}

  /**
   * @param ownVacanciesOnly the caller reaches this candidate as an assigned
   * interviewer, so the card holds **their** applications and no others. The other
   * vacancy's id, title, notes and criteria are absent from the response rather than
   * hidden by the page (04 §01.2) — a section the browser never receives is one no
   * devtools panel can open.
   */
  async card(
    organizationId: string,
    candidateId: string,
    viewerAccountId: string,
    ownVacanciesOnly = false,
  ) {
    const candidate = await this.prisma.candidate.findFirst({
      where: { id: candidateId, organizationId },
      select: { id: true, firstName: true, lastName: true, email: true, createdAt: true },
    });
    if (!candidate) throw new NotFoundException();

    const applications = await this.prisma.application.findMany({
      where: {
        candidateId,
        organizationId,
        ...(ownVacanciesOnly ? { vacancy: { interviewerAccountId: viewerAccountId } } : {}),
      },
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
        criteria: { orderBy: [{ createdAt: 'asc' }, { criterionId: 'asc' }], include: ASSESSMENT },
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
         * In the order they were added, which is the one order that does not move a chip
         * somebody is reading. Alphabetical would re-sort the row under the cursor every
         * time a criterion was added mid-interview, and this page moves nothing.
         */
        criteria: application.criteria.map(presentAssessment),
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
   * Assess one criterion on one application, or edit the assessment already there.
   *
   * `PUT` rather than `POST` because a criterion is assessed **at most once per
   * application** (04 §05.24): the pair is the row's identity, so choosing English again
   * is a correction of the value, not a second English. There is no separate save — the
   * value control writes on change, which is what makes this a `PUT` of one value rather
   * than a form submission.
   */
  async putCriterion(
    organizationId: string,
    applicationId: string,
    criterionId: string,
    dto: AssessmentInput,
  ): Promise<PresentedAssessment> {
    const application = await this.prisma.application.findFirst({
      where: { id: applicationId, organizationId },
      select: { id: true },
    });
    // 404 for both, and before validation: a caller guessing ids learns nothing from the
    // shape of the error it gets back, and an id from another organization is not a
    // permission problem to report — it is a record that does not exist here.
    if (!application) throw new NotFoundException();

    const criterion = await this.prisma.criterion.findFirst({
      where: { id: criterionId, organizationId },
      select: {
        id: true,
        type: true,
        isArchived: true,
        values: { select: { id: true } },
      },
    });
    if (!criterion) throw new NotFoundException();

    const key = { applicationId_criterionId: { applicationId, criterionId } };
    const existing = await this.prisma.applicationCriterion.findUnique({
      where: key,
      select: { applicationId: true },
    });

    // An archived criterion takes no **new** assessment and keeps every existing one
    // readable and editable (06 §03.18) — which is the whole difference between
    // archiving and deleting, and it is decided here by whether the row already exists.
    if (criterion.isArchived && !existing) {
      throw new UnprocessableEntityException({
        error: 'archived_criterion',
        message: HIRING_MESSAGES.card.criterionArchived,
      });
    }

    const type = criterion.type as CriterionType;
    const validation = validateAssessment(type, dto);
    if (!validation.valid) {
      throw new UnprocessableEntityException({
        error: validation.error,
        message: validation.message,
      });
    }

    // A value from another criterion's scale is, from the member's side, exactly a value
    // that does not match this criterion — so it is the same answer (04 §Validation.5).
    if (
      validation.column === 'valueId' &&
      !criterion.values.some((value) => value.id === validation.value)
    ) {
      throw new UnprocessableEntityException({
        error: 'type_mismatch',
        message: HIRING_MESSAGES.card.criterionTypeMismatch,
      });
    }

    // Written out rather than spread from the validated column, so "exactly one of these
    // is populated" is visible here as well as in the check constraint that enforces it.
    const columns = {
      valueId: validation.column === 'valueId' ? (validation.value as string) : null,
      valueBool: validation.column === 'valueBool' ? (validation.value as boolean) : null,
      valueNumber: validation.column === 'valueNumber' ? (validation.value as number) : null,
      valueText: validation.column === 'valueText' ? (validation.value as string) : null,
    };

    const saved = await this.prisma.applicationCriterion.upsert({
      where: key,
      // `type` is a copy of the criterion's, and a composite foreign key onto
      // `Criterion(id, type)` is what keeps the copy honest.
      create: { applicationId, criterionId, type, ...columns },
      update: columns,
      include: ASSESSMENT,
    });

    return presentAssessment(saved);
  }

  /**
   * Remove an assessment, and nothing else (04 §05.25).
   *
   * The criterion stays in the library with its whole scale, and every other
   * application's assessment of it is untouched — this deletes one row.
   */
  async removeCriterion(
    organizationId: string,
    applicationId: string,
    criterionId: string,
  ): Promise<{ success: true }> {
    const application = await this.prisma.application.findFirst({
      where: { id: applicationId, organizationId },
      select: { id: true },
    });
    if (!application) throw new NotFoundException();

    const removed = await this.prisma.applicationCriterion.deleteMany({
      where: { applicationId, criterionId },
    });
    // Nothing removed means there was no assessment to remove, which is a 404 about the
    // assessment rather than a success about nothing.
    if (removed.count === 0) throw new NotFoundException();

    return { success: true };
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

/** The criterion and, for a scale, the value row — everything a chip renders. */
const ASSESSMENT = {
  criterion: { select: { id: true, name: true, type: true, isArchived: true } },
  value: { select: { id: true, label: true } },
} as const;

function presentAssessment(assessment: {
  criterion: { id: string; name: string; type: string; isArchived: boolean };
  value: { id: string; label: string } | null;
  valueBool: boolean | null;
  valueNumber: number | null;
  valueText: string | null;
}): PresentedAssessment {
  return {
    criterionId: assessment.criterion.id,
    name: assessment.criterion.name,
    type: assessment.criterion.type as CriterionType,
    isArchived: assessment.criterion.isArchived,
    valueId: assessment.value?.id ?? null,
    // The label is resolved from the row every time it is read, which is why renaming a
    // scale value costs nothing and reordering one costs a confirmation (06 §03.15).
    valueLabel: assessment.value?.label ?? null,
    valueBool: assessment.valueBool,
    valueNumber: assessment.valueNumber,
    valueText: assessment.valueText,
  };
}
