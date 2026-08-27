import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FINANCIALS_MESSAGES,
  MEMBER_MESSAGES,
  calculateReservePercent,
  can,
  validateMemberFinancials,
  type MemberFinancialsInput,
  type Role,
} from '@devscribed/validation';
import type { MemberFinancials } from '@prisma/client';
import type { SessionPayload } from '../auth/session.service';
import { PrismaService } from '../prisma.service';

/** Default `VacationDaysPerYear` (spec 07 requirement 4) — the Prisma column default. */
const DEFAULT_VACATION_DAYS_PER_YEAR = 20;

/** PUT `.../vacation/financials` request body — every field is optional at the wire level. */
export type MemberFinancialsDto = Partial<MemberFinancialsInput>;

/** Full financial block returned to admin/manager (numbers, never Prisma `Decimal`). */
interface FinancialsBlock {
  monthlySalary: number;
  clientHourlyRate: number;
  vacationReservePercent: number;
  isReservePercentManual: boolean;
  vacationDaysPerYear: number;
  currency: string;
}

/** Balance block — every accrual figure is zero until spec 08 lands. */
interface BalanceBlock {
  reserveBalance: number | null;
  availableDays: number;
  usedDays: number;
  pendingDays: number;
  totalDaysPerYear: number;
}

export interface VacationView {
  financials: FinancialsBlock | null;
  balance: BalanceBlock | null;
  canEdit: boolean;
  canReviewRequests: boolean;
  canSubmitRequest: boolean;
}

interface CallerMembership {
  id: string;
  role: Role;
  organizationId: string;
  accountId: string;
}

/**
 * Spec 07 — Member Financial Settings. Reads and writes the Vacation tab's financial
 * data. Mirrors `MembersService`: caller resolved from the session (never the URL), the
 * org-row `SELECT ... FOR UPDATE` lock on writes, and the `{ error, message }` /
 * `{ errors }` exception shapes.
 */
@Injectable()
export class VacationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `GET /members/:memberId/vacation`. admin/manager see full financials; a `user` sees
   * only their own balance (days, no money); `viewer` — and a `user` viewing another
   * member — get 403 (TC-07-INT-07/08).
   */
  async getVacation(session: SessionPayload, targetId: string): Promise<VacationView> {
    const caller = await this.requireCaller(session);

    const target = await this.prisma.membership.findFirst({
      where: { id: targetId, organizationId: caller.organizationId },
    });
    if (!target) {
      throw new NotFoundException({ error: 'not_found', message: MEMBER_MESSAGES.memberNotFound });
    }

    const canViewAny = can(caller.role, 'view-vacation');
    const isSelf = target.id === caller.id;
    // viewer: no own-balance capability either → forbidden. user: own-balance only.
    if (!canViewAny && !(isSelf && can(caller.role, 'view-own-vacation-balance'))) {
      throw new ForbiddenException({
        error: 'forbidden',
        message: FINANCIALS_MESSAGES.viewForbidden,
      });
    }

    const financials = await this.prisma.memberFinancials.findUnique({
      where: { membershipId: target.id },
    });

    const targetActive = target.status === 'active';

    if (canViewAny) {
      // admin/manager — full financial view.
      const canEdit = can(caller.role, 'edit-member-financials') && targetActive;
      if (!financials) {
        return {
          financials: null,
          balance: null,
          canEdit,
          canReviewRequests: false,
          canSubmitRequest: false,
        };
      }
      return {
        financials: this.toFinancialsBlock(financials),
        balance: this.zeroBalance(financials.vacationDaysPerYear, false),
        canEdit,
        canReviewRequests: false,
        canSubmitRequest: false,
      };
    }

    // user viewing own membership — days only, never money.
    return {
      financials: null,
      balance: financials ? this.zeroBalance(financials.vacationDaysPerYear, true) : null,
      canEdit: false,
      canReviewRequests: false,
      canSubmitRequest: false,
    };
  }

  /**
   * `PUT /members/:memberId/vacation/financials`. Upserts the settings and appends an
   * immutable snapshot with `EffectiveFrom` = today. In auto mode the reserve percent is
   * recomputed from salary/rate/days; in manual mode the validated value is stored.
   */
  async updateFinancials(
    session: SessionPayload,
    targetId: string,
    dto: MemberFinancialsDto,
  ): Promise<{ success: true; vacationReservePercent: number }> {
    const caller = await this.requireCaller(session);
    if (!can(caller.role, 'edit-member-financials')) {
      throw new ForbiddenException({
        error: 'forbidden',
        message: FINANCIALS_MESSAGES.editForbidden,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      // Same org-row lock the members flows take — serializes concurrent writes against
      // this membership's single financials/snapshot chain.
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${caller.organizationId} FOR UPDATE`;

      const target = await tx.membership.findFirst({
        where: { id: targetId, organizationId: caller.organizationId },
      });
      if (!target) {
        throw new NotFoundException({ error: 'not_found', message: MEMBER_MESSAGES.memberNotFound });
      }
      if (target.status === 'removed') {
        throw new BadRequestException({
          error: 'member_removed',
          message: FINANCIALS_MESSAGES.memberRemoved,
        });
      }

      const validation = validateMemberFinancials(dto);
      if (!validation.valid) {
        throw new BadRequestException({ errors: validation.errors });
      }

      const { monthlySalary, clientHourlyRate, vacationDaysPerYear, currency, isReservePercentManual } =
        validation.value;

      // Auto mode recomputes from the freshly validated inputs (requirements 7-8); manual
      // mode stores the value the manager supplied (requirement 9) — already validated non-null.
      const vacationReservePercent = isReservePercentManual
        ? (validation.value.vacationReservePercent as number)
        : calculateReservePercent({ monthlySalary, clientHourlyRate, vacationDaysPerYear });

      const values = {
        monthlySalary,
        clientHourlyRate,
        vacationReservePercent,
        isReservePercentManual,
        vacationDaysPerYear,
        currency,
      };

      await tx.memberFinancials.upsert({
        where: { membershipId: target.id },
        create: { membershipId: target.id, ...values, updatedByAccountId: caller.accountId },
        update: { ...values, updatedByAccountId: caller.accountId },
      });

      // Every write appends an immutable snapshot (requirement 11); prior snapshots are
      // never touched. `effectiveFrom` is today, date-only (midnight UTC).
      await tx.memberFinancialsSnapshot.create({
        data: { membershipId: target.id, ...values, effectiveFrom: this.today() },
      });

      return { success: true as const, vacationReservePercent };
    });
  }

  /** Prisma `Decimal` → `number` for the wire. */
  private toFinancialsBlock(f: MemberFinancials): FinancialsBlock {
    return {
      monthlySalary: f.monthlySalary.toNumber(),
      clientHourlyRate: f.clientHourlyRate.toNumber(),
      vacationReservePercent: f.vacationReservePercent.toNumber(),
      isReservePercentManual: f.isReservePercentManual,
      vacationDaysPerYear: f.vacationDaysPerYear,
      currency: f.currency,
    };
  }

  /** All accrual figures are zero pre-spec-08; `user` never sees the monetary reserve. */
  private zeroBalance(totalDaysPerYear: number, hideReserve: boolean): BalanceBlock {
    return {
      reserveBalance: hideReserve ? null : 0,
      availableDays: 0,
      usedDays: 0,
      pendingDays: 0,
      totalDaysPerYear: totalDaysPerYear ?? DEFAULT_VACATION_DAYS_PER_YEAR,
    };
  }

  /** Today as a date-only value (midnight UTC), for the snapshot's `@db.Date` column. */
  private today(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  /** Caller's own membership, resolved from the session — mirrors `MembersService`. */
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
