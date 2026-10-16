import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { AdminDiscountController } from './admin-discount.controller.js';
import { DiscountService } from './discount.service.js';
import { Discount } from './entities/discount.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Discount]), AuthModule],
  controllers: [AdminDiscountController],
  providers: [DiscountService],
})
export class DiscountModule {}
