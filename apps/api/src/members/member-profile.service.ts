import {
  PROFILE_MESSAGES,
  SENSITIVE_PROFILE_FIELDS,
  canEditProfile,
  canReadProfile,
  canReadProfilePii,
  isMaskedValue,
  maskProfileValue,
  validateProfileField,
} from '@devscribed/validation';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { MemberProfile, Prisma } from '@prisma/client';
import type { SessionPayload } from '../auth/session.service';
import { PrismaService } from '../prisma.service';
import type { UpdateMemberProfileDto } from './member-profile.controller';

/**
 * The order the profile is validated, stored, and presented in — the same order the
 * Contract details card renders. One list rather than four, so a field cannot be added
 * to the read path and forgotten on the write path.
 */
const PROFILE_FIELDS = [
  'addressLine',
  'city',
  'postalCode',
  'country',
  'taxId',
  'dateOfBirth',
  'idDocumentNumber',
  'bankDetails',
] as const;

type ProfileField = (typeof PROFILE_FIELDS)[number];

/** The wire shape: every value is a string or `null`, dates as ISO `YYYY-MM-DD`. */
type ProfileValues = Record<ProfileField, string | null>;

/**
 * `MemberProfile` behind `GET`/`PUT .../members/{memberId}/profile` (requirements 14-23).
 *
 * Two rules shape everything here and are worth stating before the code:
 *
 * 1. **Authorization is capability OR identity.** A member reads and edits their *own*
 *    contract details, and `Membership.role` can never say "self" — so every check runs
 *    through `canReadProfile` / `canReadProfilePii` / `canEditProfile`, which compose the
 *    role table with an `isSelf` the request alone can answer. That is also why this
 *    service's controller does not carry `CapabilityGuard`: a guard keyed on a capability
 *    would 403 a plain `user` before the identity half was ever consulted.
 *
 * 2. **Masking governs the profile, never the document.** Requirement 20 masks the four
 *    sensitive columns for a caller without `ViewMemberProfilePii`; requirement 23 shows a
 *    value in full once it has been snapshotted into an envelope. Nothing in this file is
 *    reachable from the envelope path, and nothing in the envelope path calls
 *    `maskProfileValue` — see the note on `resolveAutofillContext` in envelopes.service.ts.
 */
@Injectable()
export class MemberProfileService {
  /**
   * Requirement 21: sensitive values never appear in application logs. Everything this
   * logger is given is a *field name* or an id, never a value — see `logProfileChange`.
   */
  private readonly log = new Logger(MemberProfileService.name);

  constructor(private readonly prisma: PrismaService) {}

  async get(session: SessionPayload, memberId: string) {
    const { target, callerRole, isSelf } = await this.resolveAccess(session, memberId);

    if (!canReadProfile(callerRole, isSelf)) {
      throw new ForbiddenException({
        error: 'forbidden',
        message: PROFILE_MESSAGES.permission.view,
      });
    }

    return this.present(target.profile, callerRole, isSelf, target.id);
  }

  async update(session: SessionPayload, memberId: string, dto: UpdateMemberProfileDto) {
    const { target, callerRole, isSelf } = await this.resolveAccess(session, memberId);

    if (!canEditProfile(callerRole, isSelf)) {
      throw new ForbiddenException({
        error: 'forbidden',
        message: PROFILE_MESSAGES.permission.edit,
      });
    }

    const canSeePii = canReadProfilePii(callerRole, isSelf);
    const body = (dto ?? {}) as Record<string, unknown>;
    const errors: Record<string, string> = {};
    const data: Prisma.MemberProfileUncheckedUpdateInput = {};
    const changed: ProfileField[] = [];

    const current = this.toValues(target.profile);

    for (const field of PROFILE_FIELDS) {
      // Requirement: omitted keys are left unchanged; an explicit `null` clears.
      if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
      const raw = body[field];

      /* ------------------------------------------------------------------ *
       * Requirement 22 — the mask-write guard.
       *
       * An explicit rule rather than a side effect, because it is the only thing
       * standing between a stale client and a corrupted tax id. The sequence it defends
       * against is mundane: a caller reads the profile at a moment when they lack
       * `ViewMemberProfilePii`, their form is populated with `***4567`, they edit the
       * address, and they `PUT` the whole object back. Nothing about that request is
       * malicious and nothing about it is invalid — `***4567` even passes the tax-id
       * pattern's cousin checks — so only a rule that recognizes the *shape of a mask*
       * can stop it.
       *
       * Two conditions, both required. `isMaskedValue` alone would refuse a legitimate
       * write by an admin who genuinely typed four bullets; `!canSeePii` alone would
       * refuse every write by a self-editing member. Together they say precisely what
       * requirement 22 says: a mask, from a caller who could only have got it *as* a
       * mask, is "unchanged" and not a value.
       *
       * "Unchanged" means the column is not written at all — not written-back with the
       * old value — so `updatedAt` and the change list stay honest about what happened.
       * ------------------------------------------------------------------ */
      if (typeof raw === 'string' && !canSeePii && isMaskedValue(field, raw)) {
        continue;
      }

      const checked = validateProfileField(field, raw);
      if (!checked.valid) {
        errors[field] = checked.error;
        continue;
      }

      const next = checked.value.length === 0 ? null : checked.value;
      if (next !== current[field]) changed.push(field);

      if (field === 'dateOfBirth') {
        // Stored at UTC midnight so the column round-trips the calendar day the member
        // typed, whatever zone the server happens to run in.
        data.dateOfBirth = next === null ? null : new Date(`${next}T00:00:00.000Z`);
      } else {
        (data as Record<string, unknown>)[field] = next;
      }
    }

    if (Object.keys(errors).length > 0) {
      // Nothing is persisted when any field fails: the card saves as a unit, and a
      // half-applied address is worse than a rejected one.
      throw new BadRequestException({ message: errors[Object.keys(errors)[0]], errors });
    }

    // Requirement 14: created lazily on first save. `upsert` rather than a read-then-
    // branch so two concurrent first saves cannot race the unique index on membershipId.
    const saved = await this.prisma.memberProfile.upsert({
      where: { membershipId: target.id },
      create: {
        ...(data as Omit<Prisma.MemberProfileUncheckedCreateInput, 'membershipId'>),
        membershipId: target.id,
        updatedByAccountId: session.accountId,
      },
      update: { ...data, updatedByAccountId: session.accountId },
      // The `PUT` response is the same shape as the `GET`, footer line included, so the
      // editor's name has to come back from the same round trip.
      include: { updatedBy: true },
    });

    this.logProfileChange(target.id, changed);

    return this.present(saved, callerRole, isSelf, target.id);
  }

  /* ---------------------------------------------------------------- *
   * Requirement 18 — DEFERRED, with the seam left in the open.
   * ---------------------------------------------------------------- */

  /**
   * Requirement 18 says editing the profile writes an entry to "the existing member
   * activity surface" naming the changed fields and never their values. **That surface
   * does not exist in this repository** — there is no activity, timeline, or audit model
   * for a member anywhere in `schema.prisma`; the only audit log is `EnvelopeEvent`, which
   * belongs to a document and would be the wrong home for a profile edit. Inventing one
   * here would be a new entity, a migration, and a read API that no spec has described.
   *
   * So the half of the requirement that is genuinely this spec's — *which* field names
   * are written, and the guarantee that no value is — is implemented and tested, and only
   * the sink is missing. Change detection above produces the list; this method is the
   * seam. When the member activity surface lands, its writer replaces the debug line and
   * nothing else in this file moves.
   *
   * The signature is the contract that matters: `changed` is a list of **field names**.
   * There is no parameter that could carry a value, which is what makes requirement 21
   * true by construction rather than by discipline — a future implementer cannot log a
   * tax id through this seam because it is never handed one.
   */
  private logProfileChange(membershipId: string, changed: readonly ProfileField[]): void {
    if (changed.length === 0) return;
    this.log.debug(
      `member profile updated: membership=${membershipId} fields=${changed.join(',')}`,
    );
  }

  /* ---------------------------------------------------------------- *
   * Helpers
   * ---------------------------------------------------------------- */

  /**
   * The membership named in the URL, the caller's own role, and whether the two are the
   * same person.
   *
   * Scoped by `session.organizationId` and never by the path's `:orgId` — the guard has
   * only established that the two agree. A member of another organization is a 404, not a
   * 403: refusing differently would confirm that the id exists somewhere.
   *
   * `isSelf` compares **account ids**, not membership ids. A membership id is what the URL
   * carries, but identity belongs to the account behind it, and comparing the two
   * different kinds of id is the sort of mistake that silently grants nothing or
   * everything.
   */
  private async resolveAccess(session: SessionPayload, memberId: string) {
    const target = await this.prisma.membership.findFirst({
      where: { id: memberId ?? '', organizationId: session.organizationId },
      include: { profile: { include: { updatedBy: true } } },
    });
    if (!target) throw new NotFoundException();

    const caller = await this.prisma.membership.findFirst({
      where: {
        accountId: session.accountId,
        organizationId: session.organizationId,
        status: 'active',
      },
      select: { role: true },
    });

    return {
      target,
      // A caller with no active membership normalizes to `viewer` inside the role
      // helpers, which is the closed-by-default answer.
      callerRole: caller?.role ?? null,
      isSelf: target.accountId === session.accountId,
    };
  }

  /** The stored row as the wire sees it, before any masking. */
  private toValues(profile: MemberProfile | null): ProfileValues {
    return {
      addressLine: profile?.addressLine ?? null,
      city: profile?.city ?? null,
      postalCode: profile?.postalCode ?? null,
      country: profile?.country ?? null,
      taxId: profile?.taxId ?? null,
      dateOfBirth: isoDate(profile?.dateOfBirth ?? null),
      idDocumentNumber: profile?.idDocumentNumber ?? null,
      bankDetails: profile?.bankDetails ?? null,
    };
  }

  /**
   * Requirement 20: a caller without `ViewMemberProfilePii` receives masked values, and
   * the response **marks each masked field** so the UI never presents a mask as an
   * editable value.
   *
   * `maskedFields` is deliberately a list of names rather than a per-value flag inside
   * each field: the client needs to know which inputs to leave out of edit mode
   * altogether (the spec's UI notes are explicit that they are absent, not disabled), and
   * a name list is what a form builder can act on directly.
   *
   * A field whose stored value is `null` is *not* listed even when the caller cannot read
   * it. There is nothing to hide, and listing it would make the empty state unreachable —
   * the card would claim data is being withheld from a profile that has none.
   */
  private present(
    profile: (MemberProfile & { updatedBy?: { id: string; firstName: string; lastName: string } | null }) | null,
    callerRole: string | null,
    isSelf: boolean,
    membershipId: string,
  ) {
    const values = this.toValues(profile);
    const canSeePii = canReadProfilePii(callerRole, isSelf);

    const maskedFields: string[] = [];
    const out: Record<string, string | null> = {};
    for (const field of PROFILE_FIELDS) {
      const value = values[field];
      if (canSeePii || !SENSITIVE_PROFILE_FIELDS.includes(field) || value === null) {
        out[field] = value;
        continue;
      }
      out[field] = maskProfileValue(field, value);
      maskedFields.push(field);
    }

    const updatedBy = profile?.updatedBy ?? null;

    return {
      membershipId,
      ...out,
      maskedFields,
      updatedAt: profile?.updatedAt?.toISOString() ?? null,
      updatedBy: updatedBy
        ? { id: updatedBy.id, name: `${updatedBy.firstName} ${updatedBy.lastName}` }
        : null,
      canEdit: canEditProfile(callerRole, isSelf),
      // Drives the `profile-masked-hint` banner. Derived rather than sent as a separate
      // boolean the client could disagree with.
      maskedHint: maskedFields.length > 0 ? PROFILE_MESSAGES.masked.hint : null,
    };
  }
}

/** A date-only column, stored at UTC midnight, rendered as ISO `YYYY-MM-DD`. */
function isoDate(value: Date | null): string | null {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  return value.toISOString().slice(0, 10);
}
