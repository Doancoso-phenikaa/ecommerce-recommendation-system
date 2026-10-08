import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { Customer } from '../customer/entities/customer.entity.js';
import { Order } from '../order/entities/order.entity.js';
import { Product } from '../product/entities/product.entity.js';
import { Seller } from '../seller/entities/seller.entity.js';
import { Shop } from '../shop/entities/shop.entity.js';
import { ShopModule } from '../shop/shop.module.js';
import { User } from '../user/entities/user.entity.js';
import { AdminController } from './admin.controller.js';
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
    TypeOrmModule.forFeature([User, Customer, Seller, Shop, Product, Order]),
  ],
  controllers: [
    AdminController,
    AdminUserController,
    AdminOrderController,
    AdminStatisticsController,
  ],
  providers: [AdminUserService, AdminOrderService, AdminStatisticsService],
})
export class AdminModule {}
