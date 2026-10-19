import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSellerReplyToReviews1792454403000
  implements MigrationInterface
{
  name = 'AddSellerReplyToReviews1792454403000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD "seller_reply" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD "seller_replied_at" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "reviews" DROP COLUMN "seller_replied_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" DROP COLUMN "seller_reply"`,
    );
  }
}
