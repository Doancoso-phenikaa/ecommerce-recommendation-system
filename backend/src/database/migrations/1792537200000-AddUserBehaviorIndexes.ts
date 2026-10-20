import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserBehaviorIndexes1792537200000 implements MigrationInterface {
  name = 'AddUserBehaviorIndexes1792537200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX "IDX_user_behaviors_customer_id"
      ON "user_behaviors" ("customer_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_user_behaviors_product_id"
      ON "user_behaviors" ("product_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_user_behaviors_customer_id_created_at"
      ON "user_behaviors" ("customer_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_user_behaviors_behavior_type_created_at"
      ON "user_behaviors" ("behavior_type", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX "public"."IDX_user_behaviors_behavior_type_created_at"',
    );
    await queryRunner.query(
      'DROP INDEX "public"."IDX_user_behaviors_customer_id_created_at"',
    );
    await queryRunner.query(
      'DROP INDEX "public"."IDX_user_behaviors_product_id"',
    );
    await queryRunner.query(
      'DROP INDEX "public"."IDX_user_behaviors_customer_id"',
    );
  }
}
