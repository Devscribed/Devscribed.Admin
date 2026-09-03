import type { Provider } from '@nestjs/common';
import { FileStorage } from './file-storage';
import { LocalFileStorage } from './local-file-storage';
import { S3FileStorage } from './s3-file-storage';

/**
 * Driver selection, in the shape `app.module.ts` already uses for mail: an explicit env
 * var always wins, and the local driver is the default whenever we are not in
 * production.
 *
 * Defaulting rather than requiring `STORAGE_DRIVER=local` is the load-bearing part.
 * Playwright reuses an already-running dev server, so if the local driver were opt-in,
 * whether the suite touched AWS would depend on how that server happened to be started.
 */
export function selectStorageDriver(): typeof LocalFileStorage | typeof S3FileStorage {
  const configured = process.env.STORAGE_DRIVER;
  if (configured === 's3') return S3FileStorage;
  if (configured === 'local') return LocalFileStorage;

  return process.env.NODE_ENV === 'production' ? S3FileStorage : LocalFileStorage;
}

export const fileStorageProvider: Provider = {
  provide: FileStorage,
  useClass: selectStorageDriver(),
};
