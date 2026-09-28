import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1790500004931 implements MigrationInterface {
    name = 'InitialSchema1790500004931'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TYPE "public"."category_status_enum" AS ENUM('ACTIVE', 'INACTIVE')
        `);
        await queryRunner.query(`
            CREATE TABLE "categories" (
                "category_id" BIGSERIAL NOT NULL,
                "name" character varying(100) NOT NULL,
                "description" text,
                "status" "public"."category_status_enum" NOT NULL DEFAULT 'ACTIVE',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_8b0be371d28245da6e4f4b61878" UNIQUE ("name"),
                CONSTRAINT "PK_51615bef2cea22812d0dcab6e18" PRIMARY KEY ("category_id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "inventories" (
                "inventory_id" BIGSERIAL NOT NULL,
                "product_id" bigint NOT NULL,
                "quantity" integer NOT NULL DEFAULT '0',
                "reserved_quantity" integer NOT NULL DEFAULT '0',
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "REL_92fc0c77bab4a656b9619322c6" UNIQUE ("product_id"),
                CONSTRAINT "CHK_b187552fc1d88642d57ee8e27e" CHECK ("reserved_quantity" <= "quantity"),
                CONSTRAINT "CHK_4ddac20dae62d2e1928913fb19" CHECK ("reserved_quantity" >= 0),
                CONSTRAINT "CHK_e913de84da5af0e37d347419f0" CHECK ("quantity" >= 0),
                CONSTRAINT "PK_ba79be4ba6f714453c535943172" PRIMARY KEY ("inventory_id")
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."discount_type_enum" AS ENUM('PERCENT', 'FIXED')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."discount_status_enum" AS ENUM('ACTIVE', 'INACTIVE')
        `);
        await queryRunner.query(`
            CREATE TABLE "discounts" (
                "discount_id" BIGSERIAL NOT NULL,
                "code" character varying(50) NOT NULL,
                "type" "public"."discount_type_enum" NOT NULL,
                "value" numeric(12, 2) NOT NULL,
                "min_order_amount" numeric(14, 2) NOT NULL DEFAULT '0',
                "start_date" TIMESTAMP WITH TIME ZONE NOT NULL,
                "end_date" TIMESTAMP WITH TIME ZONE NOT NULL,
                "usage_limit" integer,
                "used_count" integer NOT NULL DEFAULT '0',
                "status" "public"."discount_status_enum" NOT NULL DEFAULT 'ACTIVE',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_8c7cc2340e9ea0fc5a246e63749" UNIQUE ("code"),
                CONSTRAINT "CHK_discounts_used_count_limit" CHECK (
                    "usage_limit" IS NULL
                    OR "used_count" <= "usage_limit"
                ),
                CONSTRAINT "CHK_discounts_usage_limit_positive" CHECK (
                    "usage_limit" IS NULL
                    OR "usage_limit" > 0
                ),
                CONSTRAINT "CHK_discounts_percent_value" CHECK (
                    "type" <> 'PERCENT'
                    OR "value" <= 100
                ),
                CONSTRAINT "CHK_discounts_min_order_amount_non_negative" CHECK ("min_order_amount" >= 0),
                CONSTRAINT "CHK_discounts_used_count_non_negative" CHECK ("used_count" >= 0),
                CONSTRAINT "CHK_discounts_date_range" CHECK ("end_date" > "start_date"),
                CONSTRAINT "CHK_discounts_value_positive" CHECK ("value" > 0),
                CONSTRAINT "PK_7341cdb1d12929c19915126077e" PRIMARY KEY ("discount_id")
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."review_status_enum" AS ENUM('ACTIVE', 'HIDDEN')
        `);
        await queryRunner.query(`
            CREATE TABLE "reviews" (
                "review_id" BIGSERIAL NOT NULL,
                "customer_id" bigint NOT NULL,
                "product_id" bigint NOT NULL,
                "order_id" bigint NOT NULL,
                "rating" smallint NOT NULL,
                "comment" text,
                "status" "public"."review_status_enum" NOT NULL DEFAULT 'ACTIVE',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_reviews_customer_id_product_id_order_id" UNIQUE ("customer_id", "product_id", "order_id"),
                CONSTRAINT "CHK_reviews_rating_range" CHECK (
                    "rating" BETWEEN 1 AND 5
                ),
                CONSTRAINT "PK_bfe951d9dca4ba99674c5772905" PRIMARY KEY ("review_id")
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."seller_status_enum" AS ENUM('PENDING', 'ACTIVE', 'SUSPENDED')
        `);
        await queryRunner.query(`
            CREATE TABLE "sellers" (
                "seller_id" BIGSERIAL NOT NULL,
                "user_id" bigint NOT NULL,
                "status" "public"."seller_status_enum" NOT NULL DEFAULT 'PENDING',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "REL_83f4670f0e114d0be3731bade8" UNIQUE ("user_id"),
                CONSTRAINT "PK_909a225177ad1113c316d78d42c" PRIMARY KEY ("seller_id")
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."shop_status_enum" AS ENUM('PENDING', 'ACTIVE', 'SUSPENDED')
        `);
        await queryRunner.query(`
            CREATE TABLE "shops" (
                "shop_id" BIGSERIAL NOT NULL,
                "seller_id" bigint NOT NULL,
                "name" character varying(150) NOT NULL,
                "description" text,
                "rating" numeric(2, 1) NOT NULL DEFAULT '0',
                "status" "public"."shop_status_enum" NOT NULL DEFAULT 'PENDING',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "REL_24acfab664c1ee213d7b9afac9" UNIQUE ("seller_id"),
                CONSTRAINT "PK_a1c960b70b4f013a3b57238b58d" PRIMARY KEY ("shop_id")
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."payment_method_enum" AS ENUM('COD', 'ONLINE')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."payment_status_enum" AS ENUM('PENDING', 'PAID', 'FAILED')
        `);
        await queryRunner.query(`
            CREATE TABLE "payments" (
                "payment_id" BIGSERIAL NOT NULL,
                "order_group_id" bigint NOT NULL,
                "payment_method" "public"."payment_method_enum" NOT NULL,
                "amount" numeric(14, 2) NOT NULL,
                "status" "public"."payment_status_enum" NOT NULL DEFAULT 'PENDING',
                "paid_at" TIMESTAMP WITH TIME ZONE,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "REL_fc671157dd1f46d63912cfd969" UNIQUE ("order_group_id"),
                CONSTRAINT "CHK_payments_amount_non_negative" CHECK ("amount" >= 0),
                CONSTRAINT "PK_8866a3cfff96b8e17c2b204aae0" PRIMARY KEY ("payment_id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "order_groups" (
                "order_group_id" BIGSERIAL NOT NULL,
                "customer_id" bigint NOT NULL,
                "total_amount" numeric(14, 2) NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "CHK_order_groups_total_amount_non_negative" CHECK ("total_amount" >= 0),
                CONSTRAINT "PK_b904cd34f850471af18d4b29f67" PRIMARY KEY ("order_group_id")
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."order_status_enum" AS ENUM(
                'PENDING',
                'CONFIRMED',
                'SHIPPING',
                'COMPLETED',
                'CANCELLED'
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "orders" (
                "order_id" BIGSERIAL NOT NULL,
                "order_group_id" bigint NOT NULL,
                "shop_id" bigint NOT NULL,
                "discount_id" bigint,
                "subtotal" numeric(14, 2) NOT NULL,
                "discount_amount" numeric(14, 2) NOT NULL DEFAULT '0',
                "shipping_fee" numeric(14, 2) NOT NULL DEFAULT '0',
                "total_amount" numeric(14, 2) NOT NULL,
                "shipping_address" text NOT NULL,
                "shipping_method" character varying(50),
                "status" "public"."order_status_enum" NOT NULL DEFAULT 'PENDING',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "CHK_orders_total_amount_non_negative" CHECK ("total_amount" >= 0),
                CONSTRAINT "CHK_orders_shipping_fee_non_negative" CHECK ("shipping_fee" >= 0),
                CONSTRAINT "CHK_orders_discount_amount_non_negative" CHECK ("discount_amount" >= 0),
                CONSTRAINT "CHK_orders_subtotal_non_negative" CHECK ("subtotal" >= 0),
                CONSTRAINT "PK_cad55b3cb25b38be94d2ce831db" PRIMARY KEY ("order_id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "order_items" (
                "order_item_id" BIGSERIAL NOT NULL,
                "order_id" bigint NOT NULL,
                "product_id" bigint NOT NULL,
                "product_name" character varying(180) NOT NULL,
                "quantity" integer NOT NULL,
                "unit_price" numeric(12, 2) NOT NULL,
                "subtotal" numeric(14, 2) NOT NULL,
                CONSTRAINT "CHK_order_items_subtotal_non_negative" CHECK ("subtotal" >= 0),
                CONSTRAINT "CHK_order_items_unit_price_non_negative" CHECK ("unit_price" >= 0),
                CONSTRAINT "CHK_order_items_quantity_positive" CHECK ("quantity" > 0),
                CONSTRAINT "PK_54c952fdc94b9b487ef968b4047" PRIMARY KEY ("order_item_id")
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."behavior_type_enum" AS ENUM('VIEW', 'ADD_CART', 'WISHLIST', 'PURCHASE')
        `);
        await queryRunner.query(`
            CREATE TABLE "user_behaviors" (
                "behavior_id" BIGSERIAL NOT NULL,
                "customer_id" bigint NOT NULL,
                "product_id" bigint NOT NULL,
                "behavior_type" "public"."behavior_type_enum" NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_4acca8967a073be35dd644ccd06" PRIMARY KEY ("behavior_id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "wishlists" (
                "wishlist_id" BIGSERIAL NOT NULL,
                "customer_id" bigint NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "REL_1ecae3acee67b8f1b5ae9f5149" UNIQUE ("customer_id"),
                CONSTRAINT "PK_06edcd2fc1ea12ee26d351f0e1a" PRIMARY KEY ("wishlist_id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "wishlist_items" (
                "wishlist_item_id" BIGSERIAL NOT NULL,
                "wishlist_id" bigint NOT NULL,
                "product_id" bigint NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_wishlist_items_wishlist_id_product_id" UNIQUE ("wishlist_id", "product_id"),
                CONSTRAINT "PK_debb42e2967f8e52afa79f923cf" PRIMARY KEY ("wishlist_item_id")
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."product_status_enum" AS ENUM('PENDING', 'APPROVED', 'REJECTED')
        `);
        await queryRunner.query(`
            CREATE TABLE "products" (
                "product_id" BIGSERIAL NOT NULL,
                "shop_id" bigint NOT NULL,
                "category_id" bigint NOT NULL,
                "name" character varying(180) NOT NULL,
                "description" text,
                "price" numeric(12, 2) NOT NULL,
                "image_url" text,
                "status" "public"."product_status_enum" NOT NULL DEFAULT 'PENDING',
                "rejection_reason" text,
                "approved_at" TIMESTAMP WITH TIME ZONE,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "CHK_ba339f178553051542254ef21d" CHECK ("price" > 0),
                CONSTRAINT "PK_a8940a4bf3b90bd7ac15c8f4dd9" PRIMARY KEY ("product_id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "cart_items" (
                "cart_item_id" BIGSERIAL NOT NULL,
                "cart_id" bigint NOT NULL,
                "product_id" bigint NOT NULL,
                "quantity" integer NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_cart_items_cart_id_product_id" UNIQUE ("cart_id", "product_id"),
                CONSTRAINT "CHK_cart_items_quantity_positive" CHECK ("quantity" > 0),
                CONSTRAINT "PK_136052dba9e33c62b93c6a291f8" PRIMARY KEY ("cart_item_id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "carts" (
                "cart_id" BIGSERIAL NOT NULL,
                "customer_id" bigint NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "REL_5a9dade7a4baafc128f8e0d804" UNIQUE ("customer_id"),
                CONSTRAINT "PK_2fb47cbe0c6f182bb31c66689e9" PRIMARY KEY ("cart_id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "customers" (
                "customer_id" BIGSERIAL NOT NULL,
                "user_id" bigint NOT NULL,
                "shipping_address" text,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "REL_11d81cd7be87b6f8865b0cf766" UNIQUE ("user_id"),
                CONSTRAINT "PK_6c444ce6637f2c1d71c3cf136c1" PRIMARY KEY ("customer_id")
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."user_role_enum" AS ENUM('CUSTOMER', 'SELLER', 'ADMIN')
        `);
        await queryRunner.query(`
            CREATE TABLE "users" (
                "user_id" BIGSERIAL NOT NULL,
                "full_name" character varying(100) NOT NULL,
                "email" character varying(150) NOT NULL,
                "password" character varying(255) NOT NULL,
                "phone" character varying(20),
                "role" "public"."user_role_enum" NOT NULL,
                "is_active" boolean NOT NULL DEFAULT true,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"),
                CONSTRAINT "UQ_a000cca60bcf04454e727699490" UNIQUE ("phone"),
                CONSTRAINT "PK_96aac72f1574b88752e9fb00089" PRIMARY KEY ("user_id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "admins" (
                "admin_id" BIGSERIAL NOT NULL,
                "user_id" bigint NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "REL_2b901dd818a2a6486994d915a6" UNIQUE ("user_id"),
                CONSTRAINT "PK_88070d08be64522fc84fdefef85" PRIMARY KEY ("admin_id")
            )
        `);
        await queryRunner.query(`
            ALTER TABLE "inventories"
            ADD CONSTRAINT "FK_92fc0c77bab4a656b9619322c62" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "reviews"
            ADD CONSTRAINT "FK_4dd42f48aa60ad8c0d5d5c4ea5b" FOREIGN KEY ("customer_id") REFERENCES "customers"("customer_id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "reviews"
            ADD CONSTRAINT "FK_9482e9567d8dcc2bc615981ef44" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "reviews"
            ADD CONSTRAINT "FK_e4b0ed40bdd0f318108612c2851" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "sellers"
            ADD CONSTRAINT "FK_83f4670f0e114d0be3731bade87" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "shops"
            ADD CONSTRAINT "FK_24acfab664c1ee213d7b9afac9c" FOREIGN KEY ("seller_id") REFERENCES "sellers"("seller_id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "payments"
            ADD CONSTRAINT "FK_fc671157dd1f46d63912cfd9698" FOREIGN KEY ("order_group_id") REFERENCES "order_groups"("order_group_id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "order_groups"
            ADD CONSTRAINT "FK_c9a5bdb1a0fbb6712a1aba0a6b6" FOREIGN KEY ("customer_id") REFERENCES "customers"("customer_id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "orders"
            ADD CONSTRAINT "FK_1711cab53c8573c3eafbfad6c8d" FOREIGN KEY ("order_group_id") REFERENCES "order_groups"("order_group_id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "orders"
            ADD CONSTRAINT "FK_33f20db82908f7685a5c0c58ac6" FOREIGN KEY ("shop_id") REFERENCES "shops"("shop_id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "orders"
            ADD CONSTRAINT "FK_555d48c77395dc43554c7067ed6" FOREIGN KEY ("discount_id") REFERENCES "discounts"("discount_id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "order_items"
            ADD CONSTRAINT "FK_145532db85752b29c57d2b7b1f1" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "order_items"
            ADD CONSTRAINT "FK_9263386c35b6b242540f9493b00" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "user_behaviors"
            ADD CONSTRAINT "FK_bbdc2a44c3e92bba5a13dfdaf51" FOREIGN KEY ("customer_id") REFERENCES "customers"("customer_id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "user_behaviors"
            ADD CONSTRAINT "FK_7323baa8c86028929c5af404a52" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "wishlists"
            ADD CONSTRAINT "FK_1ecae3acee67b8f1b5ae9f51498" FOREIGN KEY ("customer_id") REFERENCES "customers"("customer_id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "wishlist_items"
            ADD CONSTRAINT "FK_754a9ecec7627d432c2134dd00e" FOREIGN KEY ("wishlist_id") REFERENCES "wishlists"("wishlist_id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "wishlist_items"
            ADD CONSTRAINT "FK_177397e044732e7e9c0215cd5b7" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "products"
            ADD CONSTRAINT "FK_9e952e93f369f16e27dd786c33f" FOREIGN KEY ("shop_id") REFERENCES "shops"("shop_id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "products"
            ADD CONSTRAINT "FK_9a5f6868c96e0069e699f33e124" FOREIGN KEY ("category_id") REFERENCES "categories"("category_id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "cart_items"
            ADD CONSTRAINT "FK_6385a745d9e12a89b859bb25623" FOREIGN KEY ("cart_id") REFERENCES "carts"("cart_id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "cart_items"
            ADD CONSTRAINT "FK_30e89257a105eab7648a35c7fce" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "carts"
            ADD CONSTRAINT "FK_5a9dade7a4baafc128f8e0d8041" FOREIGN KEY ("customer_id") REFERENCES "customers"("customer_id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "customers"
            ADD CONSTRAINT "FK_11d81cd7be87b6f8865b0cf7661" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "admins"
            ADD CONSTRAINT "FK_2b901dd818a2a6486994d915a68" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "admins" DROP CONSTRAINT "FK_2b901dd818a2a6486994d915a68"
        `);
        await queryRunner.query(`
            ALTER TABLE "customers" DROP CONSTRAINT "FK_11d81cd7be87b6f8865b0cf7661"
        `);
        await queryRunner.query(`
            ALTER TABLE "carts" DROP CONSTRAINT "FK_5a9dade7a4baafc128f8e0d8041"
        `);
        await queryRunner.query(`
            ALTER TABLE "cart_items" DROP CONSTRAINT "FK_30e89257a105eab7648a35c7fce"
        `);
        await queryRunner.query(`
            ALTER TABLE "cart_items" DROP CONSTRAINT "FK_6385a745d9e12a89b859bb25623"
        `);
        await queryRunner.query(`
            ALTER TABLE "products" DROP CONSTRAINT "FK_9a5f6868c96e0069e699f33e124"
        `);
        await queryRunner.query(`
            ALTER TABLE "products" DROP CONSTRAINT "FK_9e952e93f369f16e27dd786c33f"
        `);
        await queryRunner.query(`
            ALTER TABLE "wishlist_items" DROP CONSTRAINT "FK_177397e044732e7e9c0215cd5b7"
        `);
        await queryRunner.query(`
            ALTER TABLE "wishlist_items" DROP CONSTRAINT "FK_754a9ecec7627d432c2134dd00e"
        `);
        await queryRunner.query(`
            ALTER TABLE "wishlists" DROP CONSTRAINT "FK_1ecae3acee67b8f1b5ae9f51498"
        `);
        await queryRunner.query(`
            ALTER TABLE "user_behaviors" DROP CONSTRAINT "FK_7323baa8c86028929c5af404a52"
        `);
        await queryRunner.query(`
            ALTER TABLE "user_behaviors" DROP CONSTRAINT "FK_bbdc2a44c3e92bba5a13dfdaf51"
        `);
        await queryRunner.query(`
            ALTER TABLE "order_items" DROP CONSTRAINT "FK_9263386c35b6b242540f9493b00"
        `);
        await queryRunner.query(`
            ALTER TABLE "order_items" DROP CONSTRAINT "FK_145532db85752b29c57d2b7b1f1"
        `);
        await queryRunner.query(`
            ALTER TABLE "orders" DROP CONSTRAINT "FK_555d48c77395dc43554c7067ed6"
        `);
        await queryRunner.query(`
            ALTER TABLE "orders" DROP CONSTRAINT "FK_33f20db82908f7685a5c0c58ac6"
        `);
        await queryRunner.query(`
            ALTER TABLE "orders" DROP CONSTRAINT "FK_1711cab53c8573c3eafbfad6c8d"
        `);
        await queryRunner.query(`
            ALTER TABLE "order_groups" DROP CONSTRAINT "FK_c9a5bdb1a0fbb6712a1aba0a6b6"
        `);
        await queryRunner.query(`
            ALTER TABLE "payments" DROP CONSTRAINT "FK_fc671157dd1f46d63912cfd9698"
        `);
        await queryRunner.query(`
            ALTER TABLE "shops" DROP CONSTRAINT "FK_24acfab664c1ee213d7b9afac9c"
        `);
        await queryRunner.query(`
            ALTER TABLE "sellers" DROP CONSTRAINT "FK_83f4670f0e114d0be3731bade87"
        `);
        await queryRunner.query(`
            ALTER TABLE "reviews" DROP CONSTRAINT "FK_e4b0ed40bdd0f318108612c2851"
        `);
        await queryRunner.query(`
            ALTER TABLE "reviews" DROP CONSTRAINT "FK_9482e9567d8dcc2bc615981ef44"
        `);
        await queryRunner.query(`
            ALTER TABLE "reviews" DROP CONSTRAINT "FK_4dd42f48aa60ad8c0d5d5c4ea5b"
        `);
        await queryRunner.query(`
            ALTER TABLE "inventories" DROP CONSTRAINT "FK_92fc0c77bab4a656b9619322c62"
        `);
        await queryRunner.query(`
            DROP TABLE "admins"
        `);
        await queryRunner.query(`
            DROP TABLE "users"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."user_role_enum"
        `);
        await queryRunner.query(`
            DROP TABLE "customers"
        `);
        await queryRunner.query(`
            DROP TABLE "carts"
        `);
        await queryRunner.query(`
            DROP TABLE "cart_items"
        `);
        await queryRunner.query(`
            DROP TABLE "products"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."product_status_enum"
        `);
        await queryRunner.query(`
            DROP TABLE "wishlist_items"
        `);
        await queryRunner.query(`
            DROP TABLE "wishlists"
        `);
        await queryRunner.query(`
            DROP TABLE "user_behaviors"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."behavior_type_enum"
        `);
        await queryRunner.query(`
            DROP TABLE "order_items"
        `);
        await queryRunner.query(`
            DROP TABLE "orders"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."order_status_enum"
        `);
        await queryRunner.query(`
            DROP TABLE "order_groups"
        `);
        await queryRunner.query(`
            DROP TABLE "payments"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."payment_status_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."payment_method_enum"
        `);
        await queryRunner.query(`
            DROP TABLE "shops"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."shop_status_enum"
        `);
        await queryRunner.query(`
            DROP TABLE "sellers"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."seller_status_enum"
        `);
        await queryRunner.query(`
            DROP TABLE "reviews"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."review_status_enum"
        `);
        await queryRunner.query(`
            DROP TABLE "discounts"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."discount_status_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."discount_type_enum"
        `);
        await queryRunner.query(`
            DROP TABLE "inventories"
        `);
        await queryRunner.query(`
            DROP TABLE "categories"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."category_status_enum"
        `);
    }

}
