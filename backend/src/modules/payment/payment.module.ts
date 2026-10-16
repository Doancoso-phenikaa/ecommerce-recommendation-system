import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { Customer } from '../customer/entities/customer.entity.js';
import { OrderGroup } from '../order/entities/order-group.entity.js';
import { Payment } from './entities/payment.entity.js';
import { PaymentController } from './payment.controller.js';
import { PaymentService } from './payment.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Customer, OrderGroup, Payment]),
    AuthModule,
  ],
  controllers: [PaymentController],
  providers: [PaymentService],
})
export class PaymentModule {}
