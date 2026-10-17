import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCategoryImageUrl1792128385798 implements MigrationInterface {
  name = 'AddCategoryImageUrl1792128385798';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "categories" ADD "image_url" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "categories" DROP COLUMN "image_url"`,
    );
  }
}
