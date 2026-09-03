/**
 * Storage configuration, resolved once at boot.
 *
 * `STORAGE_PROVIDER` is read as given, in every environment; `NODE_ENV` plays no part
 * (hiring 00 §03.15). `fs` on an ephemeral filesystem keeps CVs only until the task is
 * replaced, and an environment that sets it there has accepted that. What is still
 * refused, before the port opens, is a value with no implementation behind it.
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

  return { provider, root: env.STORAGE_FS_ROOT ?? DEFAULT_STORAGE_ROOT };
}
