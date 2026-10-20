import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { Customer } from '../customer/entities/customer.entity.js';
import { Product } from '../product/entities/product.entity.js';
import { RecommendationEventModule } from '../recommendation/recommendation-event.module.js';
import { UserBehavior } from './entities/user-behavior.entity.js';
import { UserBehaviorController } from './user-behavior.controller.js';
import { UserBehaviorService } from './user-behavior.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserBehavior, Customer, Product]),
    AuthModule,
    RecommendationEventModule,
  ],
  controllers: [UserBehaviorController],
  providers: [UserBehaviorService],
  exports: [UserBehaviorService],
})
export class UserBehaviorModule {}
