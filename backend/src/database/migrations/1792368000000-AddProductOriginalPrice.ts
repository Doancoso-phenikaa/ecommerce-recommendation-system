import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductOriginalPrice1792368000000
  implements MigrationInterface
{
  name = 'AddProductOriginalPrice1792368000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "products" ADD "original_price" numeric(12,2)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "products" DROP COLUMN "original_price"`,
    );
  }
}
