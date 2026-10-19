import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderShippingDiscount1792454401000
  implements MigrationInterface
{
  name = 'AddOrderShippingDiscount1792454401000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" ADD "shipping_discount_amount" numeric(14,2) NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "CHK_orders_shipping_discount_amount_non_negative" CHECK ("shipping_discount_amount" >= 0)`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "CHK_orders_discount_not_above_subtotal" CHECK ("discount_amount" <= "subtotal")`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "CHK_orders_shipping_discount_not_above_fee" CHECK ("shipping_discount_amount" <= "shipping_fee")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "CHK_orders_shipping_discount_not_above_fee"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "CHK_orders_discount_not_above_subtotal"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "CHK_orders_shipping_discount_amount_non_negative"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN "shipping_discount_amount"`,
    );
  }
}
