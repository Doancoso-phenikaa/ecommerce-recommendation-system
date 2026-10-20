import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { Customer } from '../customer/entities/customer.entity.js';
import { Order } from '../order/entities/order.entity.js';
import { OrderItem } from '../order/entities/order-item.entity.js';
import { Product } from '../product/entities/product.entity.js';
import { RecommendationCatalogService } from '../recommendation/recommendation-catalog.service.js';
import { Seller } from '../seller/entities/seller.entity.js';
import { Shop } from '../shop/entities/shop.entity.js';
import { ShopModule } from '../shop/shop.module.js';
import { User } from '../user/entities/user.entity.js';
import { AdminController } from './admin.controller.js';
import { AdminRecommendationCatalogController } from './admin-recommendation-catalog.controller.js';
import { AdminOrderController } from './admin-order.controller.js';
import { AdminOrderService } from './admin-order.service.js';
import { AdminStatisticsController } from './admin-statistics.controller.js';
import { AdminStatisticsService } from './admin-statistics.service.js';
import { AdminUserController } from './admin-user.controller.js';
import { AdminUserService } from './admin-user.service.js';

@Module({
  imports: [
    AuthModule,
    ShopModule,
    ConfigModule,
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        timeout: Number(
          configService.get('RECOMMENDATION_SERVICE_TIMEOUT_MS') ?? 5000,
        ),
      }),
    }),
    TypeOrmModule.forFeature([
      User,
      Customer,
      Seller,
      Shop,
      Product,
      Order,
      OrderItem,
    ]),
  ],
  controllers: [
    AdminController,
    AdminUserController,
    AdminOrderController,
    AdminStatisticsController,
    AdminRecommendationCatalogController,
  ],
  providers: [
    AdminUserService,
    AdminOrderService,
    AdminStatisticsService,
    RecommendationCatalogService,
  ],
})
export class AdminModule {}
