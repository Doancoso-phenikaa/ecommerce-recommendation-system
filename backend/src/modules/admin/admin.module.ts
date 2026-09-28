import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ShopModule } from '../shop/shop.module.js';
import { AdminController } from './admin.controller.js';

@Module({
  imports: [AuthModule, ShopModule],
  controllers: [AdminController],
})
export class AdminModule {}
