import { Injectable } from '@nestjs/common';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { Storage, StoredFile } from './storage';

/** Anything outside this is replaced before a path is built (00 §03.17). */
const SAFE_KEY = /[^A-Za-z0-9._-]/g;

/**
 * Development and test storage. `S3Storage` is the production implementation and is
 * not built in this release — `resolveStorageConfig` refuses to boot rather than let
 * this one run somewhere its writes would evaporate.
 *
 * The content type is kept beside the bytes in a sidecar file rather than guessed back
 * from the extension: the CV download endpoint must reply with the type that was
 * stored, and a `.doc` has more than one plausible one.
 */
@Injectable()
export class LocalFsStorage extends Storage {
  constructor(private readonly root: string) {
    super();
  }

  async put(key: string, bytes: Buffer, contentType: string): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
    await writeFile(`${path}.type`, contentType, 'utf8');
  }

  async get(key: string): Promise<StoredFile | null> {
    const path = this.pathFor(key);
    try {
      const bytes = await readFile(path);
      const contentType = await readFile(`${path}.type`, 'utf8').catch(
        () => 'application/octet-stream',
      );
      return { bytes, contentType };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    const path = this.pathFor(key);
    await rm(path, { force: true });
    await rm(`${path}.type`, { force: true });
  }

  /**
   * Sanitising rather than rejecting: keys are application-generated, so a key that
   * needs sanitising is a bug in this codebase, not a hostile request. Replacing the
   * characters keeps the file readable back rather than losing an already-created
   * booking's CV — and `..` cannot survive the substitution, so no path can escape
   * the root either way.
   */
  private pathFor(key: string): string {
    const safe = (key ?? '').replace(SAFE_KEY, '_');
    return join(resolve(this.root), safe);
  }
}
