import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { FileStorage, assertSafeStorageKey } from './file-storage';

/**
 * Disk-backed storage for local development and the whole test suite.
 *
 * The directory is gitignored: a signed contract written by a developer is still a
 * signed contract, and nothing about it belongs in version control.
 *
 * `presignedUrl` returns an application-served URL rather than a `file://` path, because
 * the calling code — completion emails, the download action on the envelope screen —
 * hands the URL to a browser and must behave identically under both drivers. The URL is
 * signed and expiring for the same reason: the local driver should fail the same way S3
 * does when a link is stale, so an expiry bug shows up in development rather than in
 * production.
 */
@Injectable()
export class LocalFileStorage extends FileStorage {
  private readonly logger = new Logger(LocalFileStorage.name);
  private readonly root: string;
  private readonly publicUrl: string;
  private readonly secret: string;

  constructor() {
    super();
    // Relative to the API's working directory, so `apps/api/.local-storage` in dev and
    // in Jest alike. Overridable because CI may want it on a scratch volume.
    this.root = path.resolve(process.env.LOCAL_STORAGE_DIR || '.local-storage');
    // The API's own origin, not `APP_PUBLIC_URL` — that one points at the web app, and
    // this route is served by the API. There is no env var for it because this driver
    // never runs anywhere but a developer's machine and CI.
    this.publicUrl = `http://localhost:${process.env.PORT || 4000}`;
    // Not a real secret and never used in production — it only has to stop a stale link
    // from working, which is the behaviour we want to be able to observe locally.
    this.secret = process.env.SESSION_SECRET || 'dev-only-insecure-secret';
  }

  async put(key: string, bytes: Buffer, contentType: string): Promise<void> {
    assertSafeStorageKey(key);
    const file = this.pathFor(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, bytes);
    // The content type is not part of the file on disk, so it is kept beside it. S3
    // stores it as object metadata; the sidecar keeps the local driver's `GET` able to
    // answer with the same header rather than guessing from the extension.
    await fs.writeFile(`${file}.contenttype`, contentType, 'utf8');
    this.logger.debug(`Stored ${key} (${bytes.length} bytes, ${contentType})`);
  }

  async get(key: string): Promise<Buffer> {
    assertSafeStorageKey(key);
    return fs.readFile(this.pathFor(key));
  }

  async contentTypeOf(key: string): Promise<string> {
    assertSafeStorageKey(key);
    try {
      return await fs.readFile(`${this.pathFor(key)}.contenttype`, 'utf8');
    } catch {
      return 'application/octet-stream';
    }
  }

  async exists(key: string): Promise<boolean> {
    assertSafeStorageKey(key);
    try {
      await fs.access(this.pathFor(key));
      return true;
    } catch {
      return false;
    }
  }

  async presignedUrl(key: string, ttlSeconds: number): Promise<string> {
    assertSafeStorageKey(key);
    const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
    const signature = signLocalDownload(key, expires, this.secret);
    const query = new URLSearchParams({ key, expires: String(expires), signature });
    return `${this.publicUrl}/api/local-files?${query.toString()}`;
  }

  /** Exposed so the controller that serves these URLs verifies with the same secret. */
  verify(key: string, expires: number, signature: string): boolean {
    return verifyLocalDownload(key, expires, signature, this.secret);
  }

  private pathFor(key: string): string {
    return path.join(this.root, key);
  }
}

export function signLocalDownload(key: string, expires: number, secret: string): string {
  return createHmac('sha256', secret).update(`${key}\n${expires}`).digest('hex');
}

/**
 * Constant-time comparison, and the expiry is checked before the signature so a stale
 * link is rejected for the honest reason rather than looking like a forgery.
 */
export function verifyLocalDownload(
  key: string,
  expires: number,
  signature: string,
  secret: string,
): boolean {
  if (!Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000)) return false;

  const expected = Buffer.from(signLocalDownload(key, expires, secret), 'utf8');
  const actual = Buffer.from(signature ?? '', 'utf8');
  if (expected.length !== actual.length) return false;

  return timingSafeEqual(expected, actual);
}
