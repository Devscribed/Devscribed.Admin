import {
  SIGNING_PROVIDER_DESCRIPTIONS,
  SIGNING_PROVIDER_MESSAGES,
  isSigningProviderKey,
  signingProviderName,
  validateProviderChangeConfirmed,
  validateSigningProvider,
} from '@devscribed/validation';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { EnvelopeStatus } from '@prisma/client';
import type { SessionPayload } from '../auth/session.service';
import { PrismaService } from '../prisma.service';
import { SigningProviderRegistry } from '../signature/provider-registry';
import { SignWellHttpClient } from '../signature/signwell/signwell-http-client';
import type { UpdateSigningSettingsDto } from './signing-settings.dto';

export interface ProviderOptionView {
  key: string;
  name: string;
  description: string;
  configured: boolean;
  missing: string[];
  reachable: boolean;
  testMode: boolean;
  webhookRegistered?: boolean;
}

/**
 * The organization's signature provider: what it is, what else it could be, and what the
 * admin needs to know before changing it.
 *
 * **Configured is the whole gate**, and this was narrowed to that deliberately. A provider
 * is selectable when its configuration is *present*; `reachable` and `webhookRegistered`
 * are live checks **displayed beside the option and never gates on it**. Making a live
 * registration a precondition would make SignWell unselectable in every deployed
 * environment — none has a public address SignWell can reach — while those same
 * environments run correctly on convergence alone, which is precisely the degradation
 * requirement 24 is built to absorb.
 *
 * The connection check reads `GET /api/v1/hooks` as well, so a registration pointing
 * somewhere unexpected is visible on a screen rather than only in someone's memory. That
 * is not tidiness: a stale registration keeps posting live `embedded_signing_url` values
 * to whoever now answers that hostname, which is not a metadata leak but the ability to
 * sign as the recipient.
 */
@Injectable()
export class SigningSettingsService {
  private readonly log = new Logger(SigningSettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: SigningProviderRegistry,
    private readonly signwell: SignWellHttpClient,
  ) {}

  async get(session: SessionPayload) {
    // Scoped by the session, never by the path parameter — `OrgScopeGuard` has already
    // refused a mismatch with a 404, and this query would be right even if it had not.
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: session.organizationId },
      select: {
        signatureProviderKey: true,
        signatureProviderSetAt: true,
        signatureProviderSetByAccount: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return {
      current: organization.signatureProviderKey,
      setAt: organization.signatureProviderSetAt?.toISOString() ?? null,
      setBy: organization.signatureProviderSetByAccount
        ? {
            id: organization.signatureProviderSetByAccount.id,
            name: `${organization.signatureProviderSetByAccount.firstName} ${organization.signatureProviderSetByAccount.lastName}`.trim(),
          }
        : null,
      // What the confirmation modal names, and the modal says these envelopes stay with
      // the old provider — so a draft is not one of them (edge case 14).
      inFlightCount: await this.inFlightCount(session.organizationId),
      providers: await this.providerOptions(),
    };
  }

  async update(session: SessionPayload, dto: UpdateSigningSettingsDto) {
    // Validation rule 1 — a known key, and an unknown one is a refusal rather than a
    // fallback: silently signing with the in-house engine when someone asked for SignWell
    // would be the worst possible way to discover a typo.
    const provider = validateSigningProvider(dto?.provider);
    if (!provider.valid) {
      throw new BadRequestException({ errors: { provider: provider.error } });
    }

    // Validation rule 2 — configured, and nothing more.
    const missing = this.providers.missingConfiguration(provider.value);
    if (missing.length > 0) {
      throw new BadRequestException({
        errors: {
          provider: SIGNING_PROVIDER_MESSAGES.provider.notConfigured(
            signingProviderName(provider.value),
            missing,
          ),
        },
      });
    }

    // Validation rule 3 — the deliberate confirmation. A rejected call changes nothing,
    // which is why this is checked before the write and not inside it.
    const confirmed = validateProviderChangeConfirmed(dto?.confirmed);
    if (!confirmed.valid) {
      throw new ConflictException({ message: confirmed.error });
    }

    const setAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id: session.organizationId },
        data: {
          signatureProviderKey: provider.value,
          signatureProviderSetAt: setAt,
          signatureProviderSetBy: session.accountId,
        },
      });
    });

    // Invariant 7 — **not one column of an already-sent envelope is touched.** There is
    // no backfill here and there is no code path anywhere that updates `providerKey` on a
    // sent, completed, declined, voided or expired envelope. A draft created before the
    // switch goes out on the new provider, because the provider is read at send.
    return { current: provider.value, setAt: setAt.toISOString() };
  }

  /* ---------------------------------------------------------------- *
   * Internals
   * ---------------------------------------------------------------- */

  /**
   * Requirement 33 — the count of in-flight envelopes **that will stay on the old
   * provider**, which is exactly `sent` and `partially_signed`.
   *
   * A draft is deliberately **not** counted, even though it is non-terminal. The provider
   * is read at send and not at creation (requirement 1), so a draft created before the
   * switch goes out on the **new** provider (edge case 14, pinned by TC-04-INT-17).
   * Counting it here would make the one sentence this deliberate confirmation exists to
   * say — "they stay with the built-in provider until they complete, decline, or expire" —
   * false for every draft in the organization.
   */
  private inFlightCount(organizationId: string): Promise<number> {
    return this.prisma.envelope.count({
      where: {
        organizationId,
        status: { in: [EnvelopeStatus.sent, EnvelopeStatus.partially_signed] },
      },
    });
  }

  private async providerOptions(): Promise<ProviderOptionView[]> {
    const options: ProviderOptionView[] = [];

    for (const key of this.providers.keys()) {
      const missing = [...this.providers.missingConfiguration(key)];
      const configured = missing.length === 0;
      const provider = this.providers.find(key);

      options.push({
        key,
        name: signingProviderName(key),
        description: isSigningProviderKey(key) ? SIGNING_PROVIDER_DESCRIPTIONS[key] : '',
        // An unconfigured provider is listed, disabled, with the missing items named — a
        // control nobody can use is not hidden here, because the admin needs to know the
        // option exists and what is absent.
        configured,
        missing,
        ...(await this.liveChecks(key, configured, provider !== null)),
      });
    }

    return options;
  }

  /**
   * The two checks that are displayed and never enforced. Both are best-effort: a failure
   * here reports `reachable: false` beside the option and changes nothing about whether it
   * can be selected.
   */
  private async liveChecks(
    key: string,
    configured: boolean,
    registered: boolean,
  ): Promise<{ reachable: boolean; testMode: boolean; webhookRegistered?: boolean }> {
    if (!configured || !registered) {
      return { reachable: false, testMode: false };
    }

    const provider = this.providers.find(key);
    // The in-house engine is the product itself: it is always reachable, never in test
    // mode, and has no webhook to register.
    if (!provider || provider.capabilities.notifications !== 'webhook') {
      return { reachable: true, testMode: false };
    }

    let reachable = false;
    let webhookRegistered = false;
    try {
      reachable = await this.signwell.ping();
      if (reachable) {
        const hooks = await this.signwell.hooks();
        webhookRegistered = hooks.length > 0;
      }
    } catch (error) {
      this.log.warn(
        `The live connection check for ${key} failed: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }

    return {
      reachable,
      // Read from configuration for the *option*, which is a statement about what a new
      // envelope would be. An envelope's own badge never comes from here — it comes from
      // the column written at its send, so history is not relabelled (edge case 17).
      testMode: testModeConfigured(),
      webhookRegistered,
    };
  }
}

/**
 * Validation rule 6 lives in the adapter, where a malformed value throws at boot. Here a
 * malformed value must not be able to 500 a settings screen, so it reads as "on" — the
 * safe direction for a badge whose whole job is to warn.
 */
function testModeConfigured(): boolean {
  const value = (process.env.SIGNWELL_TEST_MODE ?? '').trim().toLowerCase();
  return value !== 'false' && value !== '0';
}
