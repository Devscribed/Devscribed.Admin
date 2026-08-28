/**
 * Object storage for rendered documents.
 *
 * Spec 02 keeps every signed PDF in S3 in production, but nothing in the Jest or
 * Playwright suites may touch AWS — that is what keeps the suite hermetic and free.
 * The port is therefore the narrowest surface the envelope code actually needs, and it
 * is an abstract class rather than an interface because Nest uses the class itself as
 * the DI token (the same idiom `MailService` established).
 *
 * Keys follow the layout the spec fixes: `signed/{orgId}/{envelopeId}/{sha256}.pdf` and
 * `render-tmp/{jobId}.html`. Content-addressed names are what make the write-once rule
 * (requirement 29) structural rather than a convention someone has to remember.
 */
export abstract class FileStorage {
  /** Writes bytes at `key`. Overwriting an existing key is never done by the app. */
  abstract put(key: string, bytes: Buffer, contentType: string): Promise<void>;

  /** Reads bytes back. Throws if the key does not exist. */
  abstract get(key: string): Promise<Buffer>;

  /**
   * A short-lived download URL. No object is ever public, so every download is a fresh,
   * expiring grant — see `PRESIGNED_URL_TTL_SECONDS` for the value the spec fixes.
   */
  abstract presignedUrl(key: string, ttlSeconds: number): Promise<string>;

  abstract exists(key: string): Promise<boolean>;
}

/**
 * 15 minutes, from the S3 table in spec 02. Long enough for a mail client to follow the
 * link, short enough that a leaked URL out of an email archive is worthless.
 */
export const PRESIGNED_URL_TTL_SECONDS = 15 * 60;

/**
 * Storage keys come from application code, never from a request, but a traversal here
 * would escape the local driver's directory and — with a bucket prefix condition in the
 * IAM policy — silently fail in production instead. Rejecting the shape once, centrally,
 * keeps both drivers honest.
 */
export function assertSafeStorageKey(key: string): void {
  const invalid =
    !key ||
    key.startsWith('/') ||
    key.includes('\\') ||
    key.split('/').some((segment) => segment === '' || segment === '.' || segment === '..');

  if (invalid) throw new Error(`Unsafe storage key: ${JSON.stringify(key)}`);
}
