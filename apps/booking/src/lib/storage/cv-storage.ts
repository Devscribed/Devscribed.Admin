import "server-only";

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export interface StoredCv {
  data: Buffer;
  contentType: string;
}

/**
 * Storage boundary for uploaded CVs. Behind an interface so the local-FS stub
 * can be swapped for blob storage (S3/Azure Blob) without touching callers.
 */
export interface CvStorage {
  save(key: string, data: Buffer, contentType: string): Promise<void>;
  read(key: string): Promise<StoredCv | null>;
  delete(key: string): Promise<void>;
}

/** Local filesystem stub, writing under apps/booking/.cv-store (git-ignored). */
class LocalCvStorage implements CvStorage {
  private readonly root = path.join(process.cwd(), ".cv-store");

  private pathFor(key: string): string {
    // Keys are internal (booking id + safe name); guard against traversal.
    const safe = key.replace(/[^a-zA-Z0-9._-]/g, "_");
    return path.join(this.root, safe);
  }

  async save(key: string, data: Buffer, contentType: string): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await writeFile(this.pathFor(key), data);
    await writeFile(`${this.pathFor(key)}.type`, contentType, "utf8");
  }

  async read(key: string): Promise<StoredCv | null> {
    try {
      const data = await readFile(this.pathFor(key));
      const contentType = await readFile(`${this.pathFor(key)}.type`, "utf8");
      return { data, contentType };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
    await rm(`${this.pathFor(key)}.type`, { force: true });
  }
}

const storage: CvStorage = new LocalCvStorage();

export function getCvStorage(): CvStorage {
  return storage;
}
