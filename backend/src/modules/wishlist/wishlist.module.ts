import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { Customer } from '../customer/entities/customer.entity.js';
import { Product } from '../product/entities/product.entity.js';
import { WishlistItem } from './entities/wishlist-item.entity.js';
import { Wishlist } from './entities/wishlist.entity.js';
import { WishlistController } from './wishlist.controller.js';
import { WishlistService } from './wishlist.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Customer, Wishlist, WishlistItem, Product]),
    AuthModule,
  ],
  controllers: [WishlistController],
  providers: [WishlistService],
})
export class WishlistModule {}
