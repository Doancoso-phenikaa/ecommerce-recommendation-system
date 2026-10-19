import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { Order } from '../order/entities/order.entity.js';
import { OrderItem } from '../order/entities/order-item.entity.js';
import { Shop } from '../shop/entities/shop.entity.js';
import { UserModule } from '../user/user.module.js';
import { Seller } from './entities/seller.entity.js';
import { SellerController } from './seller.controller.js';
import { SellerService } from './seller.service.js';
import { SellerStatisticsController } from './seller-statistics.controller.js';
import { SellerStatisticsService } from './seller-statistics.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Seller, Shop, Order, OrderItem]),
    AuthModule,
    UserModule,
  ],
  controllers: [SellerController, SellerStatisticsController],
  providers: [SellerService, SellerStatisticsService],
})
export class SellerModule {}
