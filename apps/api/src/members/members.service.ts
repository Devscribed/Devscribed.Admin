import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { HIRING_MESSAGES, MEMBER_MESSAGES, canManageMembers } from '@devscribed/validation';
import { PrismaService } from '../prisma.service';
import { VacanciesService } from '../hiring/vacancies.service';

/**
 * Removing a member — user-management spec 04's `DELETE` endpoint, and the one hiring
 * needs in order to enforce its cross-spec guard (01 §06.17).
 *
 * The rest of that screen (search, the removed filter, restore) arrives with the spec
 * itself. What is here is the endpoint the guard hangs off, so that guard is enforced
 * rather than merely written down.
 */
@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vacancies: VacanciesService,
  ) {}

  async remove(
    organizationId: string,
    callerAccountId: string,
    membershipId: string,
  ): Promise<{ success: true }> {
    const caller = await this.prisma.membership.findUnique({
      where: { accountId: callerAccountId },
      select: { role: true, status: true, organizationId: true },
    });

    const permitted =
      caller?.status === 'active' &&
      caller.organizationId === organizationId &&
      canManageMembers(caller.role);

    // 403 rather than 404: the caller is a member of this organization and already
    // knows it exists, so there is nothing to conceal by being vague.
    if (!permitted) {
      throw new ForbiddenException({
        error: 'forbidden',
        message: MEMBER_MESSAGES.removeForbidden,
      });
    }

    const target = await this.prisma.membership.findFirst({
      where: { id: membershipId, organizationId },
      select: { id: true, accountId: true, role: true, status: true },
    });
    if (!target) throw new NotFoundException();

    if (target.accountId === callerAccountId) {
      throw new ConflictException({
        error: 'cannot_remove_self',
        message: MEMBER_MESSAGES.cannotRemoveSelf,
      });
    }

    if (target.status === 'removed') {
      throw new ConflictException({
        error: 'already_removed',
        message: MEMBER_MESSAGES.alreadyRemoved,
      });
    }

    if (target.role === 'admin') {
      const admins = await this.prisma.membership.count({
        where: { organizationId, role: 'admin', status: 'active' },
      });
      if (admins <= 1) {
        throw new ConflictException({
          error: 'last_admin_guard',
          message: MEMBER_MESSAGES.lastAdmin,
        });
      }
    }

    // Hiring's guard, checked last because it is the most expensive and the least
    // likely to fire. A member who still holds open vacancies cannot be removed:
    // soft-deleting them would leave every booking link pointing at a mailbox nobody
    // is watching, and the candidate would never learn why (01 §06.17).
    const openVacancies = await this.vacancies.openVacancyCount(organizationId, target.accountId);
    if (openVacancies > 0) {
      throw new ConflictException({
        error: 'interviewer_on_open_vacancies',
        message: HIRING_MESSAGES.vacancy.interviewer.removalBlocked,
        // The count travels beside the message rather than inside it, so the screen can
        // name the number without this string having to guess at its own grammar.
        openVacancies,
      });
    }

    await this.prisma.$transaction([
      this.prisma.membership.update({
        where: { id: target.id },
        data: { status: 'removed' },
      }),
      // Rotating the stamp revokes every outstanding cookie at once — the same single
      // column write the password reset uses.
      this.prisma.account.update({
        where: { id: target.accountId },
        data: { securityStamp: randomUUID() },
      }),
    ]);

    return { success: true };
  }
}
