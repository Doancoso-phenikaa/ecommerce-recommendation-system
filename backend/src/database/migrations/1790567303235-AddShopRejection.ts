import { MigrationInterface, QueryRunner } from "typeorm";

export class AddShopRejection1790567303235 implements MigrationInterface {
    name = 'AddShopRejection1790567303235'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "shops"
            ADD "rejection_reason" text
        `);
        await queryRunner.query(`
            ALTER TYPE "public"."shop_status_enum"
            ADD VALUE 'REJECTED'
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TYPE "public"."shop_status_enum_old" AS ENUM('PENDING', 'ACTIVE', 'SUSPENDED')
        `);
        await queryRunner.query(`
            ALTER TABLE "shops"
            ALTER COLUMN "status" TYPE "public"."shop_status_enum_old" USING "status"::"text"::"public"."shop_status_enum_old"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."shop_status_enum"
        `);
        await queryRunner.query(`
            ALTER TYPE "public"."shop_status_enum_old"
            RENAME TO "shop_status_enum"
        `);
        await queryRunner.query(`
            ALTER TABLE "shops" DROP COLUMN "rejection_reason"
        `);
    }

}
