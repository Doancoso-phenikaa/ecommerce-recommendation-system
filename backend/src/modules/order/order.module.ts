import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { Customer } from '../customer/entities/customer.entity.js';
import { Inventory } from '../inventory/entities/inventory.entity.js';
import { Seller } from '../seller/entities/seller.entity.js';
import { Shop } from '../shop/entities/shop.entity.js';
import { OrderGroup } from './entities/order-group.entity.js';
import { OrderItem } from './entities/order-item.entity.js';
import { Order } from './entities/order.entity.js';
import { CustomerOrderController } from './customer-order.controller.js';
import { OrderService } from './order.service.js';
import { SellerOrderController } from './seller-order.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Customer,
      OrderGroup,
      Order,
      OrderItem,
      Inventory,
      Seller,
      Shop,
    ]),
    AuthModule,
  ],
  controllers: [CustomerOrderController, SellerOrderController],
  providers: [OrderService],
})
export class OrderModule {}
