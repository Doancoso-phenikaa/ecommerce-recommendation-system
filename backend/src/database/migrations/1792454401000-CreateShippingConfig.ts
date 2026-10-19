import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateShippingConfig1792454401000 implements MigrationInterface {
  name = 'CreateShippingConfig1792454401000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "shipping_configs" (
        "shipping_config_id" integer NOT NULL,
        "default_shipping_fee" numeric(14,2) NOT NULL DEFAULT '0',
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_shipping_configs_singleton" CHECK ("shipping_config_id" = 1),
        CONSTRAINT "CHK_shipping_configs_fee_non_negative" CHECK ("default_shipping_fee" >= 0),
        CONSTRAINT "PK_shipping_configs" PRIMARY KEY ("shipping_config_id")
      )
    `);
    await queryRunner.query(`
      INSERT INTO "shipping_configs" ("shipping_config_id", "default_shipping_fee")
      VALUES (1, '0.00')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "shipping_configs"`);
  }
}
