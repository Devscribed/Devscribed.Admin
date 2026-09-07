import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { can, normalizeRole, validateIncludeOrgCountry } from '@devscribed/validation';
import type { SessionPayload } from '../auth/session.service';
import { PrismaService } from '../prisma.service';

interface CallerMembership {
  role: string;
  organizationId: string;
  accountId: string;
}

/** The body both halves answer with (§`GET`/`PUT .../settings/holiday-sourcing`). */
export interface HolidaySourcingSettingsView {
  includeOrgCountry: boolean;
}

/** The submitted body of the `PUT`. One field, and nothing else is accepted. */
export interface HolidaySourcingSettingsInput {
  includeOrgCountry?: unknown;
}

/**
 * Time off spec 02 REQ-02-002 — the include-organization-country checkbox.
 *
 * Copied in shape from `organization-country.service.ts`, which sits on the column beside
 * it: both capability checks live here rather than on a decorator because both halves
 * answer **404** (REQ-02-019 on the read, REQ-02-020 on the write) and `CapabilityGuard`
 * answers 403. Every query scopes by `session.organizationId`; the path `orgId` is never
 * a selector.
 *
 * No lock and no version check: one row per organization, written whole through an upsert
 * keyed on the unique `organizationId`, with no read-modify-write, so there is nothing
 * for a concurrent writer to lose.
 *
 * An organization with **no row** reads `true` — resolved here rather than by a backfill,
 * so no organization changes behaviour before somebody touches the control.
 */
@Injectable()
export class HolidaySourcingSettingsService {
  private readonly logger = new Logger(HolidaySourcingSettingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async get(session: SessionPayload): Promise<HolidaySourcingSettingsView> {
    const caller = await this.requireCapability(session, 'view-holidays');
    const row = await this.prisma.organizationHolidaySourcing.findUnique({
      where: { organizationId: caller.organizationId },
      select: { includeOrgCountry: true },
    });
    return { includeOrgCountry: row?.includeOrgCountry ?? true };
  }

  async update(
    session: SessionPayload,
    input: HolidaySourcingSettingsInput,
  ): Promise<HolidaySourcingSettingsView> {
    const caller = await this.requireCapability(session, 'manage-holidays');

    // Validation Rule 2 — absent or non-boolean is refused and never coerced. `'false'`
    // read as `true` would silently add a country to everybody's sourced set.
    const result = validateIncludeOrgCountry((input ?? {}).includeOrgCountry);
    if (!result.valid) {
      throw new UnprocessableEntityException({
        error: 'validation_error',
        fields: { includeOrgCountry: result.error },
      });
    }

    const row = await this.prisma.organizationHolidaySourcing.upsert({
      where: { organizationId: caller.organizationId },
      create: {
        organizationId: caller.organizationId,
        includeOrgCountry: result.value,
        updatedByAccountId: caller.accountId,
      },
      update: {
        includeOrgCountry: result.value,
        updatedByAccountId: caller.accountId,
      },
      select: { includeOrgCountry: true },
    });

    this.logger.log(
      JSON.stringify({
        event: 'holiday_sourcing_setting_set',
        actorAccountId: caller.accountId,
        organizationId: caller.organizationId,
        includeOrgCountry: row.includeOrgCountry,
      }),
    );
    return { includeOrgCountry: row.includeOrgCountry };
  }

  /**
   * The caller's own active membership, from the session and never from the path, and the
   * capability that opens this half of the resource. `can` does not normalize, so the
   * stored role passes through `normalizeRole` first.
   */
  private async requireCapability(
    session: SessionPayload,
    capability: 'view-holidays' | 'manage-holidays',
  ): Promise<CallerMembership> {
    const caller = await this.prisma.membership.findUnique({
      where: { accountId: session.accountId },
    });
    if (
      !caller ||
      caller.status !== 'active' ||
      caller.organizationId !== session.organizationId
    ) {
      throw new ForbiddenException();
    }
    if (!can(normalizeRole(caller.role), capability)) {
      throw new NotFoundException();
    }
    return {
      role: caller.role,
      organizationId: caller.organizationId,
      accountId: caller.accountId,
    };
  }
}
