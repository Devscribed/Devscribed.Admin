import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Spec 01 (gold-standard revision): store the browser-detected timezone on the
 * account at signup.
 */
export class AccountTimezone1720300000000 implements MigrationInterface {
  name = 'AccountTimezone1720300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "accounts" ADD COLUMN "timezone" character varying(64)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "accounts" DROP COLUMN "timezone"`);
  }
}
