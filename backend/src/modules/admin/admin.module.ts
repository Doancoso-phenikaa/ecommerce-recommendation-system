import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { Order } from '../order/entities/order.entity.js';
import { ShopModule } from '../shop/shop.module.js';
import { User } from '../user/entities/user.entity.js';
import { AdminController } from './admin.controller.js';
import { AdminOrderController } from './admin-order.controller.js';
import { AdminOrderService } from './admin-order.service.js';
import { AdminUserController } from './admin-user.controller.js';
import { AdminUserService } from './admin-user.service.js';

@Module({
  imports: [AuthModule, ShopModule, TypeOrmModule.forFeature([User, Order])],
  controllers: [AdminController, AdminUserController, AdminOrderController],
  providers: [AdminUserService, AdminOrderService],
})
export class AdminModule {}
