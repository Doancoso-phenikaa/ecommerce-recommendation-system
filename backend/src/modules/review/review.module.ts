import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { Customer } from '../customer/entities/customer.entity.js';
import { OrderItem } from '../order/entities/order-item.entity.js';
import { Order } from '../order/entities/order.entity.js';
import { Review } from './entities/review.entity.js';
import { ReviewController } from './review.controller.js';
import { ReviewService } from './review.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Customer, Order, OrderItem, Review]),
    AuthModule,
  ],
  controllers: [ReviewController],
  providers: [ReviewService],
})
export class ReviewModule {}
