import { MigrationInterface, QueryRunner } from 'typeorm';

export class MoveShippingToOrderGroup1792454402000
  implements MigrationInterface
{
  name = 'MoveShippingToOrderGroup1792454402000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order_groups" ADD "shipping_fee" numeric(14,2) NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_groups" ADD "shipping_discount_amount" numeric(14,2) NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_groups" ADD CONSTRAINT "CHK_order_groups_shipping_fee_non_negative" CHECK ("shipping_fee" >= 0)`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_groups" ADD CONSTRAINT "CHK_order_groups_shipping_discount_non_negative" CHECK ("shipping_discount_amount" >= 0)`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_groups" ADD CONSTRAINT "CHK_order_groups_shipping_discount_not_above_fee" CHECK ("shipping_discount_amount" <= "shipping_fee")`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "CHK_orders_shipping_discount_not_above_fee"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "CHK_orders_shipping_discount_amount_non_negative"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN "shipping_discount_amount"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "CHK_orders_shipping_fee_non_negative"`,
    );
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "shipping_fee"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" ADD "shipping_fee" numeric(14,2) NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "CHK_orders_shipping_fee_non_negative" CHECK ("shipping_fee" >= 0)`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD "shipping_discount_amount" numeric(14,2) NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "CHK_orders_shipping_discount_amount_non_negative" CHECK ("shipping_discount_amount" >= 0)`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "CHK_orders_shipping_discount_not_above_fee" CHECK ("shipping_discount_amount" <= "shipping_fee")`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_groups" DROP CONSTRAINT "CHK_order_groups_shipping_discount_not_above_fee"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_groups" DROP CONSTRAINT "CHK_order_groups_shipping_discount_non_negative"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_groups" DROP CONSTRAINT "CHK_order_groups_shipping_fee_non_negative"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_groups" DROP COLUMN "shipping_discount_amount"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_groups" DROP COLUMN "shipping_fee"`,
    );
  }
}
