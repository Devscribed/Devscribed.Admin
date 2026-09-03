import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MEMBER_MESSAGES,
  REQUEST_MESSAGES,
  WORKING_DAYS_PER_YEAR,
  calculateAvailableDays,
  calculateDeductionAmount,
  calculateWorkingDays,
  can,
  datesOverlap,
  isValidReviewDecision,
  validateReviewerComment,
  validateVacationRequestDates,
  type Role,
} from '@devscribed/validation';
import type { Prisma, PrismaClient, VacationRequest } from '@prisma/client';
import type { SessionPayload } from '../auth/session.service';
import { PrismaService } from '../prisma.service';

/** A Prisma transaction client — the subset the members-removal side effect passes in. */
type TxClient = Prisma.TransactionClient | PrismaClient;

interface CallerMembership {
  id: string;
  role: Role;
  organizationId: string;
  accountId: string;
}

/** POST body — the two date fields (validated by the shared layer). */
export interface SubmitVacationRequestDto {
  startDate?: string;
  endDate?: string;
}

/** PUT review body. */
export interface ReviewVacationRequestDto {
  decision?: string;
  comment?: string | null;
}

/**
 * Spec 09 — the vacation-request lifecycle (submit / review / cancel). Every mutation runs
 * inside `prisma.$transaction` under the org-row `SELECT ... FOR UPDATE` lock that
 * `VacationService`/`MembersService` use, which serializes balance-sensitive operations so
 * concurrent approvals can never double-debit the reserve (TC-09-INT-12).
 *
 * Amount-sign convention (balance = SUM(amount)): `credit`/`refund` are positive,
 * `debit`/`expiry` are negative. An approval writes a `debit` of `-deductionAmount`; a
 * cancellation-refund writes a `refund` of `+deductionAmount`.
 */
@Injectable()
export class VacationRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `POST /members/:memberId/vacation/requests`. Self-only submission: computes working
   * days, checks overlap and the pending-hold-aware balance under the lock, freezes the
   * deduction amount, and creates a `pending` request.
   */
  async submit(
    session: SessionPayload,
    memberId: string,
    dto: SubmitVacationRequestDto,
  ): Promise<{ id: string; workingDays: number; deductionAmount: number; status: 'pending' }> {
    const caller = await this.requireCaller(session);

    // Self-only, and only for a role that may submit (viewer cannot). Both surface the
    // same "for yourself" forbidden — a viewer has no self to submit for either.
    if (memberId !== caller.id || !can(caller.role, 'submit-vacation-request')) {
      throw new ForbiddenException({
        error: 'forbidden',
        message: REQUEST_MESSAGES.forAnotherMember,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${caller.organizationId} FOR UPDATE`;

      const target = await tx.membership.findFirst({
        where: { id: memberId, organizationId: caller.organizationId },
      });
      if (!target || target.status !== 'active') {
        throw new NotFoundException({
          error: 'not_found',
          message: MEMBER_MESSAGES.memberNotFound,
        });
      }

      const financials = await tx.memberFinancials.findUnique({
        where: { membershipId: target.id },
      });
      if (!financials) {
        throw new BadRequestException({
          error: 'financials_not_configured',
          message: REQUEST_MESSAGES.noFinancials,
        });
      }

      const dates = validateVacationRequestDates(
        { startDate: dto.startDate, endDate: dto.endDate },
        this.todayYmd(),
      );
      if (Object.keys(dates.fieldErrors).length > 0) {
        throw new BadRequestException({ errors: dates.fieldErrors });
      }
      if (dates.crossYear) {
        throw new BadRequestException({ error: 'cross_year', message: REQUEST_MESSAGES.crossYear });
      }

      const startDate = dto.startDate as string;
      const endDate = dto.endDate as string;
      const workingDays = calculateWorkingDays(startDate, endDate);

      // Overlap against this member's non-cancelled requests (pending or approved).
      const existing = await tx.vacationRequest.findMany({
        where: { membershipId: target.id, status: { in: ['pending', 'approved'] } },
        orderBy: { startDate: 'asc' },
      });
      const overlapping = existing.find((r) =>
        datesOverlap(startDate, endDate, r.startDate, r.endDate),
      );
      if (overlapping) {
        throw new BadRequestException({
          error: 'overlap',
          message: REQUEST_MESSAGES.overlap(this.ymd(overlapping.startDate), this.ymd(overlapping.endDate)),
        });
      }

      // Pending-hold-aware balance (spec requirement 8). Reserve and holds are the current
      // calendar year only.
      const monthlySalary = financials.monthlySalary.toNumber();
      const transactions = await tx.vacationReserveTransaction.findMany({
        where: { membershipId: target.id },
        select: { amount: true, createdAt: true },
      });
      const currentYear = new Date().getUTCFullYear();
      const reserveBalance = this.sumCurrentYear(transactions, currentYear);
      const { usedDays, pendingHold } = await this.approvedUsedAndPendingHold(
        tx,
        target.id,
        currentYear,
      );

      const availableDays = calculateAvailableDays({
        reserveBalance,
        monthlySalary,
        vacationDaysPerYear: financials.vacationDaysPerYear,
        usedDays,
        pendingHold,
      });
      if (workingDays > availableDays) {
        throw new BadRequestException({
          error: 'insufficient_balance',
          message: REQUEST_MESSAGES.insufficientBalance(availableDays),
        });
      }

      const deductionAmount = calculateDeductionAmount(workingDays, monthlySalary);

      const created = await tx.vacationRequest.create({
        data: {
          membershipId: target.id,
          startDate: this.toDbDate(startDate),
          endDate: this.toDbDate(endDate),
          workingDays,
          deductionAmount,
          status: 'pending',
        },
      });

      return {
        id: created.id,
        workingDays,
        deductionAmount,
        status: 'pending' as const,
      };
    });
  }

  /**
   * `PUT /members/:memberId/vacation/requests/:requestId/review`. Approve writes a `debit`
   * to the ledger after re-checking the balance atomically inside the lock; reject records
   * the decision and optional comment with no ledger movement.
   */
  async review(
    session: SessionPayload,
    memberId: string,
    requestId: string,
    dto: ReviewVacationRequestDto,
  ): Promise<{ success: true; status: string }> {
    const caller = await this.requireCaller(session);
    if (!can(caller.role, 'review-vacation-requests')) {
      throw new ForbiddenException({
        error: 'forbidden',
        message: REQUEST_MESSAGES.reviewForbidden,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${caller.organizationId} FOR UPDATE`;

      const request = await tx.vacationRequest.findFirst({
        where: {
          id: requestId,
          membershipId: memberId,
          membership: { organizationId: caller.organizationId },
        },
      });
      if (!request) throw new NotFoundException();

      if (!isValidReviewDecision(dto.decision)) {
        throw new BadRequestException({
          error: 'invalid_decision',
          message: REQUEST_MESSAGES.invalidDecision,
        });
      }
      const decision = dto.decision;

      const comment = validateReviewerComment(dto.comment ?? null);
      if (!comment.valid) {
        throw new BadRequestException({ errors: { reviewerComment: comment.error } });
      }

      if (request.status !== 'pending') {
        throw new BadRequestException({
          error: 'invalid_status',
          message: REQUEST_MESSAGES.reviewNotPending,
        });
      }

      if (decision === 'approved' && request.membershipId === caller.id) {
        throw new ForbiddenException({
          error: 'self_approval',
          message: REQUEST_MESSAGES.selfApproval,
        });
      }

      if (decision === 'approved') {
        const financials = await tx.memberFinancials.findUnique({
          where: { membershipId: request.membershipId },
        });
        if (!financials) {
          throw new BadRequestException({
            error: 'financials_not_configured',
            message: REQUEST_MESSAGES.noFinancials,
          });
        }

        const monthlySalary = financials.monthlySalary.toNumber();
        const dailySalary = Math.round(((monthlySalary * 12) / WORKING_DAYS_PER_YEAR) * 100) / 100;

        const currentYear = new Date().getUTCFullYear();
        const transactions = await tx.vacationReserveTransaction.findMany({
          where: { membershipId: request.membershipId },
          select: { amount: true, createdAt: true },
        });
        const reserveBalance = this.sumCurrentYear(transactions, currentYear);

        // usedDays across already-approved requests this year, excluding this one. No
        // pending hold is subtracted — approval consumes the reserve directly.
        const approved = await tx.vacationRequest.findMany({
          where: {
            membershipId: request.membershipId,
            status: 'approved',
            id: { not: request.id },
          },
          select: { workingDays: true, startDate: true },
        });
        const usedDays = approved
          .filter((r) => r.startDate.getUTCFullYear() === currentYear)
          .reduce((sum, r) => sum + r.workingDays, 0);

        const byReserve = dailySalary > 0 ? Math.floor(reserveBalance / dailySalary) : 0;
        const availableForApproval = Math.min(byReserve, financials.vacationDaysPerYear - usedDays);
        if (request.workingDays > availableForApproval) {
          throw new BadRequestException({
            error: 'insufficient_balance',
            message: REQUEST_MESSAGES.insufficientBalance(Math.max(0, availableForApproval)),
          });
        }

        await tx.vacationReserveTransaction.create({
          data: {
            membershipId: request.membershipId,
            type: 'debit',
            amount: -request.deductionAmount.toNumber(),
            description: `Vacation ${this.md(request.startDate)}–${this.md(request.endDate)}`,
            vacationRequestId: request.id,
            isAutoGenerated: false,
            createdByAccountId: caller.accountId,
          },
        });

        await tx.vacationRequest.update({
          where: { id: request.id },
          data: {
            status: 'approved',
            reviewedAt: new Date(),
            reviewedByAccountId: caller.accountId,
          },
        });

        return { success: true as const, status: 'approved' };
      }

      // Rejected — no ledger movement.
      await tx.vacationRequest.update({
        where: { id: request.id },
        data: {
          status: 'rejected',
          reviewedAt: new Date(),
          reviewedByAccountId: caller.accountId,
          reviewerComment: comment.value,
        },
      });

      return { success: true as const, status: 'rejected' };
    });
  }

  /**
   * `PUT /members/:memberId/vacation/requests/:requestId/cancel`. Owners cancel their own
   * pending request; admin/manager cancel any pending or approved request (the approved
   * case writes a compensating `refund`).
   */
  async cancel(
    session: SessionPayload,
    memberId: string,
    requestId: string,
  ): Promise<{ success: true; refunded: boolean; refundAmount?: number }> {
    const caller = await this.requireCaller(session);

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${caller.organizationId} FOR UPDATE`;

      const request = await tx.vacationRequest.findFirst({
        where: {
          id: requestId,
          membershipId: memberId,
          membership: { organizationId: caller.organizationId },
        },
      });
      if (!request) throw new NotFoundException();

      if (request.status !== 'pending' && request.status !== 'approved') {
        throw new BadRequestException({
          error: 'invalid_status',
          message: REQUEST_MESSAGES.cancelInvalidStatus,
        });
      }

      const isOwner = request.membershipId === caller.id;
      const allowed =
        can(caller.role, 'cancel-any-vacation-request') ||
        (isOwner && request.status === 'pending' && can(caller.role, 'cancel-own-vacation-request'));
      if (!allowed) {
        throw new ForbiddenException({
          error: 'forbidden',
          message: REQUEST_MESSAGES.cancelForbidden,
        });
      }

      if (request.status === 'approved') {
        const refundAmount = request.deductionAmount.toNumber();
        await tx.vacationReserveTransaction.create({
          data: {
            membershipId: request.membershipId,
            type: 'refund',
            amount: refundAmount,
            description: `Refund ${this.md(request.startDate)}–${this.md(request.endDate)}`,
            vacationRequestId: request.id,
            isAutoGenerated: false,
            createdByAccountId: caller.accountId,
          },
        });
        await tx.vacationRequest.update({
          where: { id: request.id },
          data: {
            status: 'cancelled',
            cancelledAt: new Date(),
            cancelledByAccountId: caller.accountId,
          },
        });
        return { success: true as const, refunded: true, refundAmount };
      }

      await tx.vacationRequest.update({
        where: { id: request.id },
        data: {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelledByAccountId: caller.accountId,
        },
      });
      return { success: true as const, refunded: false };
    });
  }

  /**
   * Member-removal side effect (spec 09 requirement 20 / TC-09-INT-13). Runs on the
   * caller-supplied `tx` client — atomic with the removal, no new transaction/lock. Every
   * `pending` request is cancelled (no refund); every `approved` request whose start date
   * is today or later (future-dated) is cancelled with a compensating `refund`. Past
   * approved requests are untouched.
   */
  async cancelActiveForRemoval(
    tx: TxClient,
    membershipId: string,
    byAccountId: string,
  ): Promise<void> {
    const today = this.todayUtcDate();

    const active = await tx.vacationRequest.findMany({
      where: { membershipId, status: { in: ['pending', 'approved'] } },
    });

    for (const request of active) {
      if (request.status === 'approved') {
        if (request.startDate.getTime() < today.getTime()) {
          // Past approved request — leave it as-is.
          continue;
        }
        await tx.vacationReserveTransaction.create({
          data: {
            membershipId,
            type: 'refund',
            amount: request.deductionAmount.toNumber(),
            description: `Refund ${this.md(request.startDate)}–${this.md(request.endDate)}`,
            vacationRequestId: request.id,
            isAutoGenerated: false,
            createdByAccountId: byAccountId,
          },
        });
      }
      await tx.vacationRequest.update({
        where: { id: request.id },
        data: {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelledByAccountId: byAccountId,
        },
      });
    }
  }

  /** usedDays (approved) + pendingHold (pending deductionAmount) for the current year. */
  private async approvedUsedAndPendingHold(
    tx: TxClient,
    membershipId: string,
    currentYear: number,
  ): Promise<{ usedDays: number; pendingHold: number }> {
    const requests = await tx.vacationRequest.findMany({
      where: { membershipId, status: { in: ['pending', 'approved'] } },
      select: { status: true, workingDays: true, deductionAmount: true, startDate: true },
    });
    let usedDays = 0;
    let pendingHold = 0;
    for (const r of requests) {
      if (r.startDate.getUTCFullYear() !== currentYear) continue;
      if (r.status === 'approved') usedDays += r.workingDays;
      else if (r.status === 'pending') pendingHold += r.deductionAmount.toNumber();
    }
    return { usedDays, pendingHold };
  }

  /** SUM(amount) over transactions whose createdAt falls in the current calendar year. */
  private sumCurrentYear(
    transactions: readonly { amount: { toNumber(): number }; createdAt: Date }[],
    currentYear: number,
  ): number {
    return transactions.reduce(
      (sum, t) => (t.createdAt.getUTCFullYear() === currentYear ? sum + t.amount.toNumber() : sum),
      0,
    );
  }

  /** 'YYYY-MM-DD' for a date-only DB value (already midnight UTC). */
  private ymd(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  /** 'M/D' (locale-free) for a ledger description, matching the spec's "Vacation 3/3–3/7". */
  private md(date: Date): string {
    return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
  }

  /** A 'YYYY-MM-DD' string parsed to midnight UTC for a `@db.Date` column. */
  private toDbDate(ymd: string): Date {
    return new Date(`${ymd}T00:00:00.000Z`);
  }

  /** Today's UTC date as 'YYYY-MM-DD'. */
  private todayYmd(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /** Today as a date-only value (midnight UTC). */
  private todayUtcDate(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  /** Caller's own membership, resolved from the session — mirrors `VacationService`. */
  private async requireCaller(session: SessionPayload): Promise<CallerMembership> {
    const caller = await this.prisma.membership.findUnique({
      where: { accountId: session.accountId },
    });
    if (!caller || caller.status !== 'active' || caller.organizationId !== session.organizationId) {
      throw new ForbiddenException();
    }
    return {
      id: caller.id,
      role: caller.role as Role,
      organizationId: caller.organizationId,
      accountId: caller.accountId,
    };
  }
}

/** Re-exported for the members-removal cross-spec wiring / tests. */
export type { VacationRequest };
