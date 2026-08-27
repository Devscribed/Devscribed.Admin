import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  REQUESTS_PAGE_MESSAGES,
  calculateAvailableDays,
  can,
  parseRequestStatusFilter,
  parseRequestTypeFilter,
  type Role,
} from '@devscribed/validation';
import type {
  MemberFinancials,
  VacationRequest,
  VacationReserveTransaction,
} from '@prisma/client';
import type { SessionPayload } from '../auth/session.service';
import { PrismaService } from '../prisma.service';

/** Balance block carried on each request card (spec 10 API contract). */
interface MemberBalance {
  availableDays: number;
  usedDays: number;
  pendingDays: number;
  totalDaysPerYear: number;
}

/** The member summary on each request card. */
interface RequestMember {
  membershipId: string;
  firstName: string;
  lastName: string;
  initials: string;
  avatarUrl: null;
}

/** A single request row in the org-wide Requests page response. */
interface RequestCard {
  id: string;
  type: 'vacation';
  member: RequestMember;
  startDate: string;
  endDate: string;
  workingDays: number;
  deductionAmount: number;
  status: string;
  requestedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewerComment: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  memberBalance: MemberBalance;
}

export interface RequestsPageView {
  requests: RequestCard[];
  pendingCount: number;
  totalCount: number;
}

interface CallerMembership {
  id: string;
  role: Role;
  organizationId: string;
  accountId: string;
}

/** A `VacationRequest` joined with its membership, that member's account and financials. */
type RequestWithMember = VacationRequest & {
  membership: {
    id: string;
    account: { firstName: string; lastName: string };
    financials: MemberFinancials | null;
  };
};

/**
 * Spec 10 — Organization Requests Page. Aggregates spec-09 `VacationRequest`s across all
 * active members of the caller's org into a single feed, with each row carrying the
 * member's current-year vacation balance (computed exactly as the member's own Vacation
 * tab computes it — see `VacationService.getVacation`). Read-only; the action buttons on
 * the page reuse the spec-09 review/cancel endpoints.
 */
@Injectable()
export class RequestsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `GET /organizations/:orgId/requests`. admin/manager only (`view-requests`). Returns
   * the filtered, sorted request feed plus org-wide `pendingCount`/`totalCount` badges
   * that are independent of the current `status` filter.
   */
  async listRequests(
    session: SessionPayload,
    orgId: string,
    query: { status?: unknown; type?: unknown },
  ): Promise<RequestsPageView> {
    const caller = await this.requireCaller(session);
    if (!can(caller.role, 'view-requests')) {
      throw new ForbiddenException({
        error: 'forbidden',
        message: REQUESTS_PAGE_MESSAGES.viewForbidden,
      });
    }

    const statusFilter = parseRequestStatusFilter(query.status);
    // Only 'vacation' exists today; parsing is a forward-compatibility no-op for now.
    parseRequestTypeFilter(query.type);

    // Every request belonging to an ACTIVE membership in the caller's org (all statuses),
    // with the member's name and financials for the card and balance.
    const allRequests = (await this.prisma.vacationRequest.findMany({
      where: {
        membership: { organizationId: caller.organizationId, status: 'active' },
      },
      include: {
        membership: {
          select: {
            id: true,
            account: { select: { firstName: true, lastName: true } },
            financials: true,
          },
        },
      },
    })) as RequestWithMember[];

    // Org-wide counts — computed from the unfiltered set so the sidebar badge is always
    // correct regardless of the current filter (requirement 7 / API contract).
    const pendingCount = allRequests.filter((r) => r.status === 'pending').length;
    const totalCount = allRequests.length;

    // Per-member balance, computed once per distinct membership (cached).
    const membershipIds = [...new Set(allRequests.map((r) => r.membershipId))];
    const balances = await this.buildBalances(membershipIds, allRequests);

    const filtered =
      statusFilter === 'all'
        ? allRequests
        : allRequests.filter((r) => r.status === statusFilter);

    const requests = filtered
      .map((r) => this.toCard(r, balances.get(r.membershipId)!))
      .sort(compareRequests);

    return { requests, pendingCount, totalCount };
  }

  /**
   * Compute the current-year balance block for each distinct membership, mirroring
   * `VacationService.getVacation` exactly so the numbers match the member's own Vacation
   * tab: `reserveBalance` (sum of current-year transactions), `pendingHold` (pending
   * deduction amounts), `usedDays`/`pendingDays` (approved/pending working days), and
   * `availableDays` folding in the pending hold. Requests are grouped from the already
   * loaded org feed; transactions are fetched once for all members.
   */
  private async buildBalances(
    membershipIds: string[],
    allRequests: RequestWithMember[],
  ): Promise<Map<string, MemberBalance>> {
    const currentYear = new Date().getUTCFullYear();

    const transactions = await this.prisma.vacationReserveTransaction.findMany({
      where: { membershipId: { in: membershipIds } },
      select: { membershipId: true, amount: true, createdAt: true },
    });
    const reserveByMember = new Map<string, number>();
    for (const t of transactions) {
      if (t.createdAt.getUTCFullYear() !== currentYear) continue;
      reserveByMember.set(
        t.membershipId,
        (reserveByMember.get(t.membershipId) ?? 0) + t.amount.toNumber(),
      );
    }

    const financialsByMember = new Map<string, MemberFinancials | null>();
    for (const r of allRequests) {
      if (!financialsByMember.has(r.membershipId)) {
        financialsByMember.set(r.membershipId, r.membership.financials);
      }
    }

    const balances = new Map<string, MemberBalance>();
    for (const membershipId of membershipIds) {
      const financials = financialsByMember.get(membershipId) ?? null;
      const reserveBalance = reserveByMember.get(membershipId) ?? 0;

      let usedDays = 0;
      let pendingDays = 0;
      let pendingHold = 0;
      for (const r of allRequests) {
        if (r.membershipId !== membershipId) continue;
        if (r.startDate.getUTCFullYear() !== currentYear) continue;
        if (r.status === 'approved') usedDays += r.workingDays;
        else if (r.status === 'pending') {
          pendingDays += r.workingDays;
          pendingHold += r.deductionAmount.toNumber();
        }
      }

      // Without financials the reserve/day math is undefined; report a zeroed block
      // (requests cannot normally exist without financials, but stay defensive).
      const availableDays = financials
        ? calculateAvailableDays({
            reserveBalance,
            monthlySalary: financials.monthlySalary.toNumber(),
            vacationDaysPerYear: financials.vacationDaysPerYear,
            usedDays,
            pendingHold,
          })
        : 0;
      const totalDaysPerYear = financials ? financials.vacationDaysPerYear : 0;

      balances.set(membershipId, { availableDays, usedDays, pendingDays, totalDaysPerYear });
    }
    return balances;
  }

  /** Prisma request row (with member) → the wire card shape. */
  private toCard(r: RequestWithMember, memberBalance: MemberBalance): RequestCard {
    const { firstName, lastName } = r.membership.account;
    return {
      id: r.id,
      type: 'vacation',
      member: {
        membershipId: r.membershipId,
        firstName,
        lastName,
        initials: initialsOf(firstName, lastName),
        avatarUrl: null,
      },
      startDate: r.startDate.toISOString().slice(0, 10),
      endDate: r.endDate.toISOString().slice(0, 10),
      workingDays: r.workingDays,
      deductionAmount: r.deductionAmount.toNumber(),
      status: r.status,
      requestedAt: r.requestedAt.toISOString(),
      reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
      reviewedBy: r.reviewedByAccountId ?? null,
      reviewerComment: r.reviewerComment ?? null,
      cancelledAt: r.cancelledAt ? r.cancelledAt.toISOString() : null,
      cancelledBy: r.cancelledByAccountId ?? null,
      memberBalance,
    };
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

/** Uppercase first letter of each name (spec 10 response `initials`). */
function initialsOf(firstName: string, lastName: string): string {
  const a = firstName.charAt(0).toUpperCase();
  const b = lastName.charAt(0).toUpperCase();
  return `${a}${b}`;
}

/**
 * Sort order (requirement 3 / API contract): all pending requests first, oldest
 * `requestedAt` first (longest-waiting at the top); then all non-pending, newest first.
 */
function compareRequests(a: RequestCard, b: RequestCard): number {
  const aPending = a.status === 'pending';
  const bPending = b.status === 'pending';
  if (aPending !== bPending) return aPending ? -1 : 1;
  const at = new Date(a.requestedAt).getTime();
  const bt = new Date(b.requestedAt).getTime();
  return aPending ? at - bt : bt - at;
}
