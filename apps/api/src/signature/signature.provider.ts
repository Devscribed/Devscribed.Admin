import type { Provider } from '@nestjs/common';
import { InternalSignatureProvider } from './internal-signature-provider';
import { SignatureProvider } from './signature-provider';

/**
 * `SIGNATURE_PROVIDER` has exactly one value today, and the selection function exists
 * anyway — the point of the port is that a second value is a class and a case here,
 * never a migration. An unrecognized value fails loudly rather than falling back, since
 * silently signing with the internal provider when someone asked for DocuSign would be
 * the worst possible way to discover a typo.
 */
export function selectSignatureProvider(): typeof InternalSignatureProvider {
  const configured = process.env.SIGNATURE_PROVIDER;
  if (configured && configured !== 'internal') {
    throw new Error(`Unknown SIGNATURE_PROVIDER: ${configured}`);
  }

  return InternalSignatureProvider;
}

export const signatureProviderProvider: Provider = {
  provide: SignatureProvider,
  useClass: selectSignatureProvider(),
};
