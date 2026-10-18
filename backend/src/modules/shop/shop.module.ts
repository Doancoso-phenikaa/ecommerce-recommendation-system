import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { Review } from '../review/entities/review.entity.js';
import { Seller } from '../seller/entities/seller.entity.js';
import { Shop } from './entities/shop.entity.js';
import { PublicShopController } from './public-shop.controller.js';
import { ShopController } from './shop.controller.js';
import { ShopService } from './shop.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Shop, Seller, Review]), AuthModule],
  controllers: [PublicShopController, ShopController],
  providers: [ShopService],
  exports: [ShopService],
})
export class ShopModule {}
