import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { Order } from '../order/entities/order.entity.js';
import { Shop } from '../shop/entities/shop.entity.js';
import { Seller } from './entities/seller.entity.js';
import { SellerStatisticsController } from './seller-statistics.controller.js';
import { SellerStatisticsService } from './seller-statistics.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Seller, Shop, Order]), AuthModule],
  controllers: [SellerStatisticsController],
  providers: [SellerStatisticsService],
})
export class SellerModule {}
