import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { Seller } from '../seller/entities/seller.entity.js';
import { Shop } from './entities/shop.entity.js';
import { ShopController } from './shop.controller.js';
import { ShopService } from './shop.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Shop, Seller]), AuthModule],
  controllers: [ShopController],
  providers: [ShopService],
})
export class ShopModule {}
