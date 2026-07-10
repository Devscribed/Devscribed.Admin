import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Spec 02 (gold-standard revision): replace the integer `token_version` session
 * revocation counter with a random-GUID `security_stamp`, and add
 * `is_invalidated` to password-reset tokens so a new request supersedes prior
 * unused tokens.
 */
export class SecurityStamp1720400000000 implements MigrationInterface {
  name = 'SecurityStamp1720400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "accounts" ADD COLUMN "security_stamp" uuid NOT NULL DEFAULT gen_random_uuid()`,
    );
    await queryRunner.query(`ALTER TABLE "accounts" DROP COLUMN "token_version"`);
    await queryRunner.query(
      `ALTER TABLE "password_reset_tokens" ADD COLUMN "is_invalidated" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "password_reset_tokens" DROP COLUMN "is_invalidated"`);
    await queryRunner.query(
      `ALTER TABLE "accounts" ADD COLUMN "token_version" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(`ALTER TABLE "accounts" DROP COLUMN "security_stamp"`);
  }
}
