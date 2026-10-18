import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProfileImages1792280000000 implements MigrationInterface {
  name = 'AddProfileImages1792280000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "avatar_url" text`);
    await queryRunner.query(`ALTER TABLE "shops" ADD "logo_url" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "shops" DROP COLUMN "logo_url"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "avatar_url"`);
  }
}
