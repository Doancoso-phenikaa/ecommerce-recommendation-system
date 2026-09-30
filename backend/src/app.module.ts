import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import databaseConfig from './configs/database.config.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CartModule } from './modules/cart/cart.module.js';
import { CategoryModule } from './modules/category/category.module.js';
import { CheckoutModule } from './modules/checkout/checkout.module.js';
import { CustomerModule } from './modules/customer/customer.module.js';
import { DiscountModule } from './modules/discount/discount.module.js';
import { PaymentModule } from './modules/payment/payment.module.js';
import { OrderModule } from './modules/order/order.module.js';
import { ProductModule } from './modules/product/product.module.js';
import { ReviewModule } from './modules/review/review.module.js';
import { SellerModule } from './modules/seller/seller.module.js';
import { ShopModule } from './modules/shop/shop.module.js';
import { UserModule } from './modules/user/user.module.js';
import { WishlistModule } from './modules/wishlist/wishlist.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService): TypeOrmModuleOptions =>
        configService.getOrThrow<TypeOrmModuleOptions>('database'),
    }),
    UserModule,
    AuthModule,
    CustomerModule,
    ShopModule,
    AdminModule,
    CategoryModule,
    ProductModule,
    WishlistModule,
    CartModule,
    DiscountModule,
    CheckoutModule,
    PaymentModule,
    OrderModule,
    ReviewModule,
    SellerModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
