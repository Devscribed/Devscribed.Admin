/**
 * The storage capability, as specified in `specs/hiring/00-integrations.md` §03.
 *
 * Keys are opaque and application-generated (`{applicationId}{extension}`); one is
 * never derived from user input, and no implementation ever hands out a URL. CVs are
 * streamed back through an authenticated endpoint — presigned URLs are an optimisation
 * for later, not the security model.
 */

export interface StoredFile {
  bytes: Buffer;
  contentType: string;
}

export abstract class Storage {
  abstract put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  abstract get(key: string): Promise<StoredFile | null>;
  abstract delete(key: string): Promise<void>;
}
