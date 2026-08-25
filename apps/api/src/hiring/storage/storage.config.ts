/**
 * Storage configuration, resolved once at boot.
 *
 * Filesystem storage on Vercel would accept a booking and silently discard the CV:
 * the function's filesystem is read-only except `/tmp`, and `/tmp` does not survive
 * the invocation. So production plus `fs` refuses to start (00 §03.15). That is
 * deliberately stricter than `SESSION_SECRET`, which falls back to a development key
 * without complaint — a missing signing key breaks loudly on the next request, where
 * a discarded CV breaks silently and is unrecoverable.
 */

export type StorageProvider = 'fs' | 's3';

export interface StorageConfig {
  provider: StorageProvider;
  /** Only meaningful for `fs`. */
  root: string;
}

export const DEFAULT_STORAGE_ROOT = '.storage';

export class StorageConfigError extends Error {}

export function resolveStorageConfig(env: NodeJS.ProcessEnv = process.env): StorageConfig {
  const provider = (env.STORAGE_PROVIDER ?? 'fs') as StorageProvider;

  if (provider !== 'fs' && provider !== 's3') {
    throw new StorageConfigError(
      `STORAGE_PROVIDER must be "fs" or "s3" — received "${String(env.STORAGE_PROVIDER)}".`,
    );
  }

  if (provider === 's3') {
    throw new StorageConfigError(
      'STORAGE_PROVIDER=s3 is not implemented in this release. Set STORAGE_PROVIDER=fs.',
    );
  }

  if (env.NODE_ENV === 'production') {
    throw new StorageConfigError(
      'STORAGE_PROVIDER=fs cannot be used in production: uploaded CVs would be discarded. ' +
        'Set STORAGE_PROVIDER to a durable provider before starting.',
    );
  }

  return { provider, root: env.STORAGE_FS_ROOT ?? DEFAULT_STORAGE_ROOT };
}
