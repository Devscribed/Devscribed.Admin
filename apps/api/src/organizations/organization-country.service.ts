import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { can, normalizeRole, validateStatedCountryCode } from '@devscribed/validation';
import type { SessionPayload } from '../auth/session.service';
import { PrismaService } from '../prisma.service';

interface CallerMembership {
  role: string;
  organizationId: string;
  accountId: string;
}

/** The body both halves answer with (§`GET /api/organizations/{orgId}/settings/country`). */
export interface OrganizationCountryView {
  countryCode: string | null;
}

/** The submitted body of the `PUT`. `null` and `''` both clear (REQ-01-034). */
export interface OrganizationCountryInput {
  countryCode?: unknown;
}

/**
 * Time off spec 01 — the organization's holiday country, the second link of the chain
 * (REQ-01-026). One column, read by `ViewHolidays` and written by `ManageHolidays`.
 *
 * Both capability checks live here rather than on a `RequireCapability` decorator, unlike
 * the signing settings this sits beside: both halves answer **404** (REQ-01-035,
 * REQ-01-047), the way the holiday list, create and edit next to them do, and
 * `CapabilityGuard` answers 403.
 *
 * No lock and no version check (REQ-01-033): one column, written whole, with no
 * read-modify-write, so there is nothing for a concurrent writer to lose. The two writers
 * that hold `SELECT id FROM "Organization" ... FOR UPDATE` — the member remove and the
 * member update, for their zero-admin count — simply make a concurrent country write wait
 * and then apply.
 */
@Injectable()
export class OrganizationCountryService {
  private readonly logger = new Logger(OrganizationCountryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** `GET /organizations/:orgId/settings/country` — the stored value, `null` included. */
  async get(session: SessionPayload): Promise<OrganizationCountryView> {
    const caller = await this.requireCapability(session, 'view-holidays');
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: caller.organizationId },
      select: { countryCode: true },
    });
    return { countryCode: organization.countryCode };
  }

  /** `PUT /organizations/:orgId/settings/country` — returns the value now stored. */
  async update(
    session: SessionPayload,
    input: OrganizationCountryInput,
  ): Promise<OrganizationCountryView> {
    const caller = await this.requireCapability(session, 'manage-holidays');

    // Validation Rule 9 — two tests, and both of them strict: `pl` is refused rather than
    // upcased, and `XX` is refused though it has the right shape, because this column is
    // the INPUT to REQ-01-026's resolution and a value that names no country removes
    // holiday pay in silence while the page reads it back as set. The READ
    // (`resolveMemberHolidayCountry`) is the forgiving half.
    //
    // An absent `countryCode` key clears the column, which is the opposite of the member
    // update beside it, and deliberately: this body IS the resource — one field, replaced
    // whole by a PUT — while the member update carries three fields and must be able to
    // save a role without stating a country.
    const result = validateStatedCountryCode((input ?? {}).countryCode);
    if (!result.valid) {
      throw new UnprocessableEntityException({
        error: 'validation_error',
        fields: { countryCode: result.error },
      });
    }

    const organization = await this.prisma.organization.update({
      where: { id: caller.organizationId },
      data: { countryCode: result.value },
      select: { countryCode: true },
    });

    this.logger.log(
      JSON.stringify({
        event: 'organization_country_set',
        actorAccountId: caller.accountId,
        organizationId: caller.organizationId,
        countryCode: organization.countryCode,
      }),
    );
    return { countryCode: organization.countryCode };
  }

  /**
   * The caller's own active membership, from the session and never from the path, and the
   * capability that opens this half of the resource. A missing / removed / wrong-org row
   * is only reachable with a broken cookie; a role without the capability gets a bare 404.
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
