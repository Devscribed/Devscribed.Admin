import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import {
  ACCRUAL_MESSAGES,
  accrualDescription,
  billingPeriodLabel,
  calculateMonthlyCredit,
  can,
  prorateCredit,
  validateAccrualRun,
  workingDaysFromDateToMonthEnd,
  workingDaysInMonth,
  type Role,
} from '@devscribed/validation';
import type { SessionPayload } from '../auth/session.service';
import { PrismaService } from '../prisma.service';

/** POST `/api/admin/accrual/run` request body — parts arrive as JSON numbers. */
export interface AccrualRunDto {
  month: unknown;
  year: unknown;
}

/** The run summary returned to the admin (spec 08 API contract). */
export interface AccrualRunSummary {
  success: true;
  billingPeriod: string;
  processed: number;
  creditsCreated: number;
  skipped: number;
}

interface CallerMembership {
  id: string;
  role: Role;
  organizationId: string;
  accountId: string;
}

/**
 * Spec 08 — the monthly credit accrual engine. Runs the same logic the background job
 * would: for each active member of the caller's organization with configured financials,
 * append one `credit` transaction for the billing month, using the financials snapshot
 * effective during that month and pro-rating a member's first (mid-month) month.
 *
 * Mirrors `VacationService`: caller resolved from the session (never the URL), the
 * org-row `SELECT ... FOR UPDATE` lock on the write path, and the `{ error, message }`
 * exception shape.
 */
@Injectable()
export class AccrualService {
  constructor(private readonly prisma: PrismaService) {}

  async runAccrual(session: SessionPayload, body: AccrualRunDto): Promise<AccrualRunSummary> {
    const caller = await this.requireCaller(session);

    if (!can(caller.role, 'run-accrual')) {
      throw new ForbiddenException({ error: 'forbidden', message: ACCRUAL_MESSAGES.forbidden });
    }

    const now = new Date();
    const validation = validateAccrualRun(
      { month: body?.month, year: body?.year },
      { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 },
    );
    if (!validation.valid) {
      throw new BadRequestException({ error: validation.error, message: validation.message });
    }

    const { month, year } = validation.value;

    return this.prisma.$transaction(async (tx) => {
      // Same org-row lock the members/financials writes take — serializes concurrent
      // accrual runs against this organization.
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${caller.organizationId} FOR UPDATE`;

      // The `processed` set: active members of the caller's org that have a live
      // MemberFinancials record. Members without financials and removed members are
      // silently skipped by never entering this set (requirements 8-9).
      const memberships = await tx.membership.findMany({
        where: {
          organizationId: caller.organizationId,
          status: 'active',
          financials: { isNot: null },
        },
        select: { id: true },
      });

      // Last day of the billing month, date-only (UTC): day 0 of the next month.
      const lastDayOfBillingMonth = new Date(Date.UTC(year, month, 0));

      let processed = 0;
      let creditsCreated = 0;
      let skipped = 0;

      for (const membership of memberships) {
        processed += 1;

        // Idempotency: never create a second credit for the same billing period
        // (requirements 7, 10). The DB unique index is the safety net; this check is
        // the primary guard and yields the `skipped` count.
        const existing = await tx.vacationReserveTransaction.findFirst({
          where: {
            membershipId: membership.id,
            type: 'credit',
            billingPeriodMonth: month,
            billingPeriodYear: year,
          },
          select: { id: true },
        });
        if (existing) {
          skipped += 1;
          continue;
        }

        // The snapshot effective during the billing month: the most recent snapshot with
        // effectiveFrom <= last day of the billing month (requirement 5).
        const effective = await tx.memberFinancialsSnapshot.findFirst({
          where: {
            membershipId: membership.id,
            effectiveFrom: { lte: lastDayOfBillingMonth },
          },
          orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
        });
        if (!effective) {
          // No accrual basis for that month (financials configured after the billing
          // month). Untested edge — skip rather than crash.
          skipped += 1;
          continue;
        }

        const fullMonthCredit = calculateMonthlyCredit(
          effective.clientHourlyRate.toNumber(),
          effective.vacationReservePercent.toNumber(),
        );

        // Pro-rate only when the member's EARLIEST snapshot became effective within the
        // billing month itself (mid-month first configuration, requirement 6).
        const earliest = await tx.memberFinancialsSnapshot.findFirst({
          where: { membershipId: membership.id },
          orderBy: { effectiveFrom: 'asc' },
        });

        let amount = fullMonthCredit;
        if (
          earliest &&
          earliest.effectiveFrom.getUTCFullYear() === year &&
          earliest.effectiveFrom.getUTCMonth() + 1 === month
        ) {
          const fromConfig = workingDaysFromDateToMonthEnd(
            year,
            month,
            earliest.effectiveFrom.getUTCDate(),
          );
          amount = prorateCredit(fullMonthCredit, fromConfig, workingDaysInMonth(year, month));
        }

        await tx.vacationReserveTransaction.create({
          data: {
            membershipId: membership.id,
            type: 'credit',
            amount,
            billingPeriodMonth: month,
            billingPeriodYear: year,
            description: accrualDescription(year, month),
            isAutoGenerated: true,
            createdByAccountId: null,
            // createdAt intentionally omitted — defaults to now() (the run time).
          },
        });
        creditsCreated += 1;
      }

      return {
        success: true as const,
        billingPeriod: billingPeriodLabel(year, month),
        processed,
        creditsCreated,
        skipped,
      };
    });
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
