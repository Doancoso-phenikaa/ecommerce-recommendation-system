import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { Customer } from '../customer/entities/customer.entity.js';
import { Inventory } from '../inventory/entities/inventory.entity.js';
import { OrderGroup } from './entities/order-group.entity.js';
import { OrderItem } from './entities/order-item.entity.js';
import { Order } from './entities/order.entity.js';
import { CustomerOrderController } from './customer-order.controller.js';
import { OrderService } from './order.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Customer,
      OrderGroup,
      Order,
      OrderItem,
      Inventory,
    ]),
    AuthModule,
  ],
  controllers: [CustomerOrderController],
  providers: [OrderService],
})
export class OrderModule {}
