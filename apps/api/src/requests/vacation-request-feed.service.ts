import { Injectable } from '@nestjs/common';
import { calculateAvailableDays } from '@devscribed/validation';
import type {
  MemberFinancials,
  VacationRequest,
  VacationReserveTransaction,
} from '@prisma/client';
import { PrismaService } from '../prisma.service';

/** Balance block carried on each request card (spec 10 API contract). */
export interface MemberBalance {
  availableDays: number;
  usedDays: number;
  pendingDays: number;
  totalDaysPerYear: number;
}

/** The member summary on each request card. */
export interface RequestMember {
  membershipId: string;
  firstName: string;
  lastName: string;
  initials: string;
  avatarUrl: null;
}

/** A single vacation row in the Requests page response. */
export interface RequestCard {
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

/** The `vacation` section of the Requests page response (requests spec 01). */
export interface VacationFeedView {
  requests: RequestCard[];
  pendingCount: number;
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
 * Spec 10 — the organization-wide vacation feed. Aggregates spec-09 `VacationRequest`s
 * across all active members of an organization into a single feed, with each row carrying
 * the member's current-year vacation balance (computed exactly as the member's own
 * Vacation tab computes it — see `VacationService.getVacation`). Read-only; the action
 * buttons on the page reuse the spec-09 review/cancel endpoints.
 *
 * Lifted out of `RequestsService` unchanged by requests spec 01 so the shipped behaviour
 * keeps one owner and the new request model cannot regress it. The only addition is the
 * `statuses` argument, which carries requirement 42's fixed mapping from the page's
 * vocabulary onto this one — the mapping itself lives in `packages/validation`.
 */
@Injectable()
export class VacationRequestFeedService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The feed for one organization. `statuses` is `null` for "every row" and an empty
   * array for "no row" — which is what `status=answered` selects, since it has no
   * vacation counterpart (requirement 42). `pendingCount` is computed from the
   * UNFILTERED set: it feeds the sidebar badge, so `status=granted` must not zero it.
   */
  async listFeed(
    organizationId: string,
    statuses: readonly string[] | null,
  ): Promise<VacationFeedView> {
    // Every request belonging to an ACTIVE membership in the organization (all
    // statuses), with the member's name and financials for the card and balance.
    const allRequests = (await this.prisma.vacationRequest.findMany({
      where: {
        membership: { organizationId, status: 'active' },
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

    // Org-wide count — computed from the unfiltered set so the sidebar badge is always
    // correct regardless of the current filter (spec 10 requirement 7 / API contract).
    const pendingCount = allRequests.filter((r) => r.status === 'pending').length;

    // Per-member balance, computed once per distinct membership (cached).
    const membershipIds = [...new Set(allRequests.map((r) => r.membershipId))];
    const balances = await this.buildBalances(membershipIds, allRequests);

    const filtered =
      statuses === null ? allRequests : allRequests.filter((r) => statuses.includes(r.status));

    const requests = filtered
      .map((r) => this.toCard(r, balances.get(r.membershipId)!))
      .sort(compareRequests);

    return { requests, pendingCount };
  }

  /** The unfiltered count of rows in the feed — spec 10's `totalCount`. */
  async countAll(organizationId: string): Promise<number> {
    return this.prisma.vacationRequest.count({
      where: { membership: { organizationId, status: 'active' } },
    });
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
    for (const t of transactions as Pick<
      VacationReserveTransaction,
      'membershipId' | 'amount' | 'createdAt'
    >[]) {
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
}

/** Uppercase first letter of each name (spec 10 response `initials`). */
function initialsOf(firstName: string, lastName: string): string {
  const a = firstName.charAt(0).toUpperCase();
  const b = lastName.charAt(0).toUpperCase();
  return `${a}${b}`;
}

/**
 * Sort order (spec 10 requirement 3 / API contract): all pending requests first, oldest
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
