import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial schema for the user-management surface: accounts, organizations, and
 * memberships, plus the role/status enum types and the partial unique index
 * enforcing single-organization-per-account (spec 01).
 */
export class InitialSchema1720137600000 implements MigrationInterface {
  name = 'InitialSchema1720137600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "membership_role" AS ENUM ('admin', 'manager', 'user', 'viewer')`,
    );
    await queryRunner.query(`CREATE TYPE "membership_status" AS ENUM ('active', 'removed')`);

    await queryRunner.query(`
      CREATE TABLE "accounts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "email" character varying(320) NOT NULL,
        "password_hash" character varying NOT NULL,
        "first_name" character varying(200) NOT NULL,
        "last_name" character varying(200) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_accounts" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_accounts_email" ON "accounts" ("email")`);

    await queryRunner.query(`
      CREATE TABLE "organizations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying(100) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_organizations" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "memberships" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "account_id" uuid NOT NULL,
        "organization_id" uuid NOT NULL,
        "role" "membership_role" NOT NULL,
        "status" "membership_status" NOT NULL DEFAULT 'active',
        "joined_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_memberships" PRIMARY KEY ("id"),
        CONSTRAINT "FK_memberships_account" FOREIGN KEY ("account_id")
          REFERENCES "accounts" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_memberships_organization" FOREIGN KEY ("organization_id")
          REFERENCES "organizations" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_memberships_account" ON "memberships" ("account_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_memberships_organization" ON "memberships" ("organization_id")`,
    );
    // Single-organization-per-account: at most one active membership per account.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_active_membership_per_account"
        ON "memberships" ("account_id")
        WHERE "status" = 'active'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "memberships"`);
    await queryRunner.query(`DROP TABLE "organizations"`);
    await queryRunner.query(`DROP TABLE "accounts"`);
    await queryRunner.query(`DROP TYPE "membership_status"`);
    await queryRunner.query(`DROP TYPE "membership_role"`);
  }
}
