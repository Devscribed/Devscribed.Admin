import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SIGNING_PROVIDER_KEY,
  SIGNING_PROVIDER_KEYS,
  SIGNING_PROVIDER_MESSAGES,
  assemblesCompletedDocument,
  isRemotelyTracked,
  isSigningProviderKey,
  issuesCertificateOfCompletion,
  providerDrivesSigningOrder,
  providerNotConfiguredMessage,
  sendsOurOwnInvitation,
  signingProviderName,
  signingSurfaceOf,
  validateProviderChangeConfirmed,
  validateSigningProvider,
} from './signing-providers';
import type { ProviderCapabilities } from './signing-providers';

/**
 * TC-04-UNIT-05 — **the capability record decides the branch, not the key.**
 *
 * This is the rule the whole spec turns on: a third provider must need no new `if` in the
 * envelope service, and the only way that is true is if nothing outside an adapter's own
 * directory ever asks *which* provider it is.
 */

/** A provider that is not SignWell, carrying SignWell's capability record. */
const STUB_PROVIDER = {
  key: 'stub',
  capabilities: {
    invitationMail: 'ours',
    signingSurface: 'embedded',
    completedDocument: 'provider',
    notifications: 'webhook',
    signingOrder: 'provider',
  } satisfies ProviderCapabilities,
};

const INTERNAL_CAPABILITIES: ProviderCapabilities = {
  invitationMail: 'ours',
  signingSurface: 'ours',
  completedDocument: 'ours',
  notifications: 'none',
  signingOrder: 'ours',
};

describe('TC-04-UNIT-05: Capability record decides the branch, not the key', () => {
  it('chooses our own SES mail and the embedded surface for a provider called "stub"', () => {
    // The key is deliberately not `signwell`. Every answer below still comes out right,
    // which is the whole claim: the decisions are properties of the record.
    expect(STUB_PROVIDER.key).not.toBe('signwell');
    expect(sendsOurOwnInvitation(STUB_PROVIDER.capabilities)).toBe(true);
    expect(signingSurfaceOf(STUB_PROVIDER.capabilities)).toBe('embedded');
  });

  it('withholds our Certificate of Completion from a provider that produces its own', () => {
    // Requirement 28 — their audit page is the certificate, and issuing both would put
    // two documents in the record with different timestamps for the same act.
    expect(assemblesCompletedDocument(STUB_PROVIDER.capabilities)).toBe(false);
    expect(issuesCertificateOfCompletion(STUB_PROVIDER.capabilities)).toBe(false);
    expect(issuesCertificateOfCompletion(INTERNAL_CAPABILITIES)).toBe(true);
  });

  it('reconciles only a provider that can ever ring a doorbell', () => {
    expect(isRemotelyTracked(STUB_PROVIDER.capabilities)).toBe(true);
    expect(isRemotelyTracked(INTERNAL_CAPABILITIES)).toBe(false);
  });

  it('leaves turn n+1 to the provider that already opened it, and mails it ourselves', () => {
    expect(providerDrivesSigningOrder(STUB_PROVIDER.capabilities)).toBe(true);
    // Two separate questions on purpose: the provider drives the order, and the
    // invitation is still ours (requirement 12).
    expect(sendsOurOwnInvitation(STUB_PROVIDER.capabilities)).toBe(true);
    expect(providerDrivesSigningOrder(INTERNAL_CAPABILITIES)).toBe(false);
  });

  /**
   * The second half of the case, and the one that keeps being true a year from now: **no
   * branch anywhere in the API compares against the literal `"signwell"`.**
   *
   * Two places may: the adapter's own directory, and the registry that resolves a key to
   * an adapter. Everywhere else the question has to be asked of the capability record.
   */
  it('has no branch outside the adapter and the registry that compares against "signwell"', () => {
    const root = join(__dirname, '..', '..', '..', 'apps', 'api', 'src');
    const allowed = [
      join('signature', 'signwell') + sep,
      join('signature', 'provider-registry.ts'),
    ];

    // `=== 'signwell'`, `!== "signwell"`, `case 'signwell':` — a comparison in any shape.
    const comparison = /(?:[=!]==?\s*|case\s+)['"`]signwell['"`]/;

    const offenders: string[] = [];
    for (const file of walk(root)) {
      const path = relative(root, file);
      if (allowed.some((prefix) => path.startsWith(prefix))) continue;
      if (comparison.test(readFileSync(file, 'utf8'))) offenders.push(path);
    }

    expect(offenders).toEqual([]);
  });
});

describe('signature-provider vocabulary', () => {
  it('defaults every organization to the in-house engine', () => {
    // Backward compatibility 2 — a new column with a default, so existing rows read as
    // `internal` without being written.
    expect(DEFAULT_SIGNING_PROVIDER_KEY).toBe('internal');
    expect(SIGNING_PROVIDER_KEYS).toEqual(['internal', 'signwell']);
  });

  it('refuses an unknown key rather than falling back to one that works', () => {
    // Validation rule 1. Silently signing with the in-house engine when someone asked for
    // SignWell would be the worst possible way to discover a typo.
    const result = validateSigningProvider('docusign');
    expect(result.valid).toBe(false);
    expect(result.valid === false && result.error).toBe('Unknown signature provider');

    expect(validateSigningProvider(' signwell ').valid).toBe(true);
    expect(validateSigningProvider(undefined).valid).toBe(false);
    expect(isSigningProviderKey('internal')).toBe(true);
    expect(isSigningProviderKey('nonsense')).toBe(false);
  });

  it('demands the confirmation, and accepts nothing truthy in its place', () => {
    // Validation rule 3. The checkbox gates the modal's button; this gates the write.
    expect(validateProviderChangeConfirmed(true).valid).toBe(true);
    for (const value of [false, undefined, null, 'true', 1]) {
      const result = validateProviderChangeConfirmed(value);
      expect(result.valid).toBe(false);
      expect(result.valid === false && result.error).toBe('Confirm the change before saving');
    }
  });

  it('names what is missing exactly as the spec spells it', () => {
    expect(providerNotConfiguredMessage('signwell', ['API key'])).toBe(
      'SignWell is not configured. Missing: API key.',
    );
    expect(signingProviderName('internal')).toBe('Built-in');
    expect(signingProviderName('unknown')).toBe('unknown');
  });

  it("carries every message the spec's Error Messages table names, verbatim", () => {
    expect(SIGNING_PROVIDER_MESSAGES.settings.saved('SignWell')).toBe(
      'New documents will be signed through SignWell.',
    );
    expect(SIGNING_PROVIDER_MESSAGES.settings.saveFailed).toBe(
      'Something went wrong. Your change was not saved.',
    );
    expect(SIGNING_PROVIDER_MESSAGES.send.unresolvedPlaceholders(['tbd'])).toBe(
      'This document still contains unresolved placeholders and cannot be sent: tbd',
    );
    expect(SIGNING_PROVIDER_MESSAGES.send.signerIncomplete).toBe(
      'Every signer needs a name and an email address',
    );
    expect(SIGNING_PROVIDER_MESSAGES.send.providerUnavailable).toBe(
      'Signing service is unavailable. Nothing was sent — try again shortly.',
    );
    expect(SIGNING_PROVIDER_MESSAGES.signing.providerUnavailableApi).toBe(
      'Signing service is unavailable',
    );
    expect(SIGNING_PROVIDER_MESSAGES.signing.testModeBanner).toBe(
      'TEST DOCUMENT — this signature has no legal effect.',
    );
    expect(SIGNING_PROVIDER_MESSAGES.signing.loading).toBe('Preparing your document…');
    expect(SIGNING_PROVIDER_MESSAGES.signing.attribution('SignWell', 'Acme Inc')).toBe(
      'Signed through SignWell on behalf of Acme Inc.',
    );
    expect(SIGNING_PROVIDER_MESSAGES.envelope.testDocument).toBe(
      'Test document — no legal effect',
    );
    expect(SIGNING_PROVIDER_MESSAGES.envelope.unconfiguredInFlight).toBe(
      'This document is waiting on a signing provider that is no longer configured.',
    );
    expect(SIGNING_PROVIDER_MESSAGES.settings.inFlight(3)).toBe(
      '3 documents are currently in flight. They stay with the built-in provider until ' +
        'they complete, decline, or expire. Nothing about them changes.',
    );
  });
});

function* walk(directory: string): Generator<string> {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.name.endsWith('.ts')) yield path;
  }
}
