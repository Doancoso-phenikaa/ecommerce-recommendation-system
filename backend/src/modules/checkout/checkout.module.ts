import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { CartItem } from '../cart/entities/cart-item.entity.js';
import { Cart } from '../cart/entities/cart.entity.js';
import { Customer } from '../customer/entities/customer.entity.js';
import { Discount } from '../discount/entities/discount.entity.js';
import { Inventory } from '../inventory/entities/inventory.entity.js';
import { OrderGroup } from '../order/entities/order-group.entity.js';
import { OrderItem } from '../order/entities/order-item.entity.js';
import { Order } from '../order/entities/order.entity.js';
import { CheckoutController } from './checkout.controller.js';
import { CheckoutService } from './checkout.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Customer,
      Cart,
      CartItem,
      Discount,
      Inventory,
      OrderGroup,
      Order,
      OrderItem,
    ]),
    AuthModule,
  ],
  controllers: [CheckoutController],
  providers: [CheckoutService],
})
export class CheckoutModule {}
