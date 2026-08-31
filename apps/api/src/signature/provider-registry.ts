import {
  SIGNING_PROVIDER_CONFIG_LABELS,
  SIGNING_PROVIDER_KEYS,
  isSigningProviderKey,
  providerNotConfiguredMessage,
} from '@devscribed/validation';
import type { SigningProviderKey } from '@devscribed/validation';
import { Injectable } from '@nestjs/common';
import { InternalSigningProvider } from './internal-signing-provider';
import { SignWellSigningProvider } from './signwell/signwell-signing-provider';
import { SigningProvider } from './signing-provider';

/**
 * Which provider answers for a key, and whether a key is configured at all.
 *
 * This replaces `selectSignatureProvider()`, which resolved exactly one class at boot
 * from an env var. That shape cannot carry this spec for a reason backward compatibility
 * item 7 states outright: **an adapter is registered whenever its configuration is
 * present, independently of which provider any organization has selected.** An admin who
 * switches away from SignWell with envelopes in flight must not orphan them — those
 * envelopes keep reconciling, because the question "can we still talk to SignWell" has
 * nothing to do with the question "what do new envelopes use" (edge case 15).
 *
 * Configuration is read **at call time**, not captured at construction. Edge case 16 is
 * why: removing `SIGNWELL_API_KEY` while envelopes are in flight must unregister the
 * adapter and surface `provider_unconfigured` on read, rather than leaving a registry
 * that remembers a key nobody has any more.
 *
 * This file and the adapter's own directory are the only two places in `apps/api/src`
 * allowed to name a provider by its literal key. Everywhere else branches on
 * `capabilities` — TC-04-UNIT-05 makes that a test.
 */
@Injectable()
export class SigningProviderRegistry {
  private readonly providers: ReadonlyMap<SigningProviderKey, SigningProvider>;

  constructor(
    internal: InternalSigningProvider,
    signwell: SignWellSigningProvider,
  ) {
    this.providers = new Map<SigningProviderKey, SigningProvider>([
      ['internal', internal],
      ['signwell', signwell],
    ]);
  }

  /** Every key the product knows about, configured or not. The settings screen lists all. */
  keys(): readonly SigningProviderKey[] {
    return SIGNING_PROVIDER_KEYS;
  }

  /**
   * The provider for a key, or `null` when the key is unknown **or** its configuration is
   * absent. A caller that needs the distinction asks `missingConfiguration` as well.
   */
  find(key: string): SigningProvider | null {
    if (!isSigningProviderKey(key)) return null;
    if (this.missingConfiguration(key).length > 0) return null;
    return this.providers.get(key) ?? null;
  }

  /**
   * The provider for a key, or a thrown error naming what is absent. Used where a caller
   * cannot proceed without one — the send path, the signing page, the reconciler.
   */
  require(key: string): SigningProvider {
    const provider = this.find(key);
    if (provider) return provider;
    if (!isSigningProviderKey(key)) {
      throw new UnknownProviderError(key);
    }
    throw new ProviderUnconfiguredError(key, this.missingConfiguration(key));
  }

  /** Whether a provider may be selected: configuration present, and nothing else. */
  isConfigured(key: string): boolean {
    return isSigningProviderKey(key) && this.missingConfiguration(key).length === 0;
  }

  /**
   * What is absent, named the way the "Missing: …" line names it. Empty when the provider
   * is configured.
   *
   * The in-house engine needs nothing: it is the product itself, so it is always
   * configured and can never become the reason a document cannot be sent.
   */
  missingConfiguration(key: string): readonly string[] {
    if (key === 'internal') return [];
    if (key === 'signwell') {
      const missing: string[] = [];
      if (!process.env.SIGNWELL_API_KEY) missing.push(SIGNING_PROVIDER_CONFIG_LABELS.apiKey);
      if (!process.env.SIGNWELL_API_APPLICATION_ID) {
        missing.push(SIGNING_PROVIDER_CONFIG_LABELS.apiApplicationId);
      }
      if (!process.env.SIGNWELL_WEBHOOK_SECRET) {
        missing.push(SIGNING_PROVIDER_CONFIG_LABELS.webhookSecret);
      }
      return missing;
    }
    return ['configuration'];
  }

  /**
   * The provider a notification could have come from, resolved by key without regard to
   * what any organization has selected — a webhook for a document created before a switch
   * must still converge.
   */
  remotelyTracked(): readonly SigningProvider[] {
    return [...this.providers.entries()]
      .filter(([key]) => this.isConfigured(key))
      .map(([, provider]) => provider)
      .filter((provider) => provider.capabilities.notifications === 'webhook');
  }
}

export class UnknownProviderError extends Error {
  constructor(readonly key: string) {
    super(`Unknown signature provider: ${key}`);
    this.name = 'UnknownProviderError';
  }
}

export class ProviderUnconfiguredError extends Error {
  constructor(
    readonly key: string,
    readonly missing: readonly string[],
  ) {
    super(providerNotConfiguredMessage(key, missing));
    this.name = 'ProviderUnconfiguredError';
  }
}
