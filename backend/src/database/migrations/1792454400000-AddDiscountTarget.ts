import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDiscountTarget1792454400000 implements MigrationInterface {
  name = 'AddDiscountTarget1792454400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."discount_target_enum" AS ENUM('PRODUCT', 'SHIPPING')`,
    );
    await queryRunner.query(
      `ALTER TABLE "discounts" ADD "target" "public"."discount_target_enum" NOT NULL DEFAULT 'PRODUCT'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "discounts" DROP COLUMN "target"`);
    await queryRunner.query(`DROP TYPE "public"."discount_target_enum"`);
  }
}
