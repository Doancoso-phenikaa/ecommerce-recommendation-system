import { MigrationInterface, QueryRunner } from "typeorm";

export class RemovePendingSellerStatus1790564526964 implements MigrationInterface {
    name = 'RemovePendingSellerStatus1790564526964'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TYPE "public"."seller_status_enum"
            RENAME TO "seller_status_enum_old"
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."seller_status_enum" AS ENUM('ACTIVE', 'SUSPENDED')
        `);
        await queryRunner.query(`
            ALTER TABLE "sellers"
            ALTER COLUMN "status" DROP DEFAULT
        `);
        await queryRunner.query(`
            ALTER TABLE "sellers"
            ALTER COLUMN "status" TYPE "public"."seller_status_enum" USING "status"::"text"::"public"."seller_status_enum"
        `);
        await queryRunner.query(`
            ALTER TABLE "sellers"
            ALTER COLUMN "status"
            SET DEFAULT 'ACTIVE'
        `);
        await queryRunner.query(`
            DROP TYPE "public"."seller_status_enum_old"
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TYPE "public"."seller_status_enum_old" AS ENUM('PENDING', 'ACTIVE', 'SUSPENDED')
        `);
        await queryRunner.query(`
            ALTER TABLE "sellers"
            ALTER COLUMN "status" DROP DEFAULT
        `);
        await queryRunner.query(`
            ALTER TABLE "sellers"
            ALTER COLUMN "status" TYPE "public"."seller_status_enum_old" USING "status"::"text"::"public"."seller_status_enum_old"
        `);
        await queryRunner.query(`
            ALTER TABLE "sellers"
            ALTER COLUMN "status"
            SET DEFAULT 'PENDING'
        `);
        await queryRunner.query(`
            DROP TYPE "public"."seller_status_enum"
        `);
        await queryRunner.query(`
            ALTER TYPE "public"."seller_status_enum_old"
            RENAME TO "seller_status_enum"
        `);
    }

}
