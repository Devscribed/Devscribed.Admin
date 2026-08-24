import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger } from '@nestjs/common';
import { FileStorage, PRESIGNED_URL_TTL_SECONDS, assertSafeStorageKey } from './file-storage';

/**
 * The production driver: one private bucket per environment, SSE-KMS with a
 * customer-managed key, and downloads only ever as presigned `GET`s.
 *
 * No credentials are constructed here. The API assumes its role through OIDC from
 * Vercel, so the SDK's default provider chain is deliberately the whole story — a static
 * access key anywhere in this repository would be the thing the IAM design exists to
 * avoid.
 */
@Injectable()
export class S3FileStorage extends FileStorage {
  private readonly logger = new Logger(S3FileStorage.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly kmsKeyId?: string;

  constructor() {
    super();
    const bucket = process.env.DOCUMENTS_BUCKET;
    if (!bucket) {
      // Failing at construction is deliberate: a misconfigured bucket must break the
      // deploy, not the first envelope somebody completes.
      throw new Error('STORAGE_DRIVER=s3 requires DOCUMENTS_BUCKET');
    }
    this.bucket = bucket;
    this.kmsKeyId = process.env.DOCUMENTS_KMS_KEY_ID || undefined;
    this.client = new S3Client({ region: process.env.AWS_REGION || 'eu-central-1' });
  }

  async put(key: string, bytes: Buffer, contentType: string): Promise<void> {
    assertSafeStorageKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType,
        // The bucket's default encryption already names the CMK; stating it on the
        // request too means an object cannot land unencrypted if that default is ever
        // loosened by accident.
        ServerSideEncryption: 'aws:kms',
        ...(this.kmsKeyId ? { SSEKMSKeyId: this.kmsKeyId } : {}),
      }),
    );
    this.logger.debug(`Stored s3://${this.bucket}/${key} (${bytes.length} bytes)`);
  }

  async get(key: string): Promise<Buffer> {
    assertSafeStorageKey(key);
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const body = response.Body as { transformToByteArray(): Promise<Uint8Array> } | undefined;
    if (!body) throw new Error(`Empty body for s3://${this.bucket}/${key}`);

    return Buffer.from(await body.transformToByteArray());
  }

  async exists(key: string): Promise<boolean> {
    assertSafeStorageKey(key);
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode;
      // Only a genuine 404/403 means "not there". Anything else is an outage, and
      // swallowing it would let the completion path believe a document is missing.
      if (status === 404 || status === 403) return false;
      throw error;
    }
  }

  async presignedUrl(key: string, ttlSeconds: number = PRESIGNED_URL_TTL_SECONDS): Promise<string> {
    assertSafeStorageKey(key);
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        // The recipient of a completion email wants a file, not a PDF rendered inside a
        // tab from a bucket origin.
        ResponseContentDisposition: 'attachment',
      }),
      // Clamped rather than trusted: the spec fixes 15 minutes and no caller gets to
      // widen the window by passing a larger number.
      { expiresIn: Math.min(ttlSeconds, PRESIGNED_URL_TTL_SECONDS) },
    );
  }
}
