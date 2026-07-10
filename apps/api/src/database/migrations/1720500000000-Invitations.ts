import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Spec 03 (User Invitation): add the optional membership job title and the
 * invitations table (with its status enum, unique token-hash index, and the
 * partial index used for supersession lookups).
 */
export class Invitations1720500000000 implements MigrationInterface {
  name = 'Invitations1720500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "memberships" ADD COLUMN "job_title" character varying(100)`,
    );

    await queryRunner.query(
      `CREATE TYPE "invitation_status" AS ENUM ('pending', 'used', 'invalidated')`,
    );

    await queryRunner.query(`
      CREATE TABLE "invitations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "email" character varying(254) NOT NULL,
        "role" "membership_role" NOT NULL,
        "organization_id" uuid NOT NULL,
        "inviter_membership_id" uuid NOT NULL,
        "token_hash" character varying(64) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "status" "invitation_status" NOT NULL DEFAULT 'pending',
        "used_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_invitations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_invitations_organization" FOREIGN KEY ("organization_id")
          REFERENCES "organizations" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_invitations_inviter_membership" FOREIGN KEY ("inviter_membership_id")
          REFERENCES "memberships" ("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_invitations_token_hash" ON "invitations" ("token_hash")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_invitations_inviter_membership" ON "invitations" ("inviter_membership_id")`,
    );
    await queryRunner.query(`
      CREATE INDEX "IDX_pending_invitation_email_org"
        ON "invitations" ("email", "organization_id")
        WHERE "status" = 'pending'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "invitations"`);
    await queryRunner.query(`DROP TYPE "invitation_status"`);
    await queryRunner.query(`ALTER TABLE "memberships" DROP COLUMN "job_title"`);
  }
}
