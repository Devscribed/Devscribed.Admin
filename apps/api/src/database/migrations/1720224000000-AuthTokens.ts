import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Spec 02 additions: per-account session-revocation counter (`token_version`)
 * and the single-use password-reset token table.
 */
export class AuthTokens1720224000000 implements MigrationInterface {
  name = 'AuthTokens1720224000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "accounts" ADD COLUMN "token_version" integer NOT NULL DEFAULT 0`,
    );

    await queryRunner.query(`
      CREATE TABLE "password_reset_tokens" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "account_id" uuid NOT NULL,
        "token_hash" character varying(64) NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "used_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_password_reset_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "FK_password_reset_tokens_account" FOREIGN KEY ("account_id")
          REFERENCES "accounts" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_password_reset_tokens_token_hash" ON "password_reset_tokens" ("token_hash")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_password_reset_tokens_account" ON "password_reset_tokens" ("account_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "password_reset_tokens"`);
    await queryRunner.query(`ALTER TABLE "accounts" DROP COLUMN "token_version"`);
  }
}
