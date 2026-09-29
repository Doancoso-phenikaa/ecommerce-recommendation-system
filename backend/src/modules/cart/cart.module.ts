import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { Customer } from '../customer/entities/customer.entity.js';
import { Product } from '../product/entities/product.entity.js';
import { CartController } from './cart.controller.js';
import { CartService } from './cart.service.js';
import { CartItem } from './entities/cart-item.entity.js';
import { Cart } from './entities/cart.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Customer, Cart, CartItem, Product]),
    AuthModule,
  ],
  controllers: [CartController],
  providers: [CartService],
})
export class CartModule {}
