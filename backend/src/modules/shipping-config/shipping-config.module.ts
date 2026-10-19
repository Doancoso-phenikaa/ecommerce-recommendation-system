import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { AdminShippingConfigController } from './admin-shipping-config.controller.js';
import { ShippingConfig } from './entities/shipping-config.entity.js';
import { ShippingConfigService } from './shipping-config.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([ShippingConfig]), AuthModule],
  controllers: [AdminShippingConfigController],
  providers: [ShippingConfigService],
  exports: [ShippingConfigService],
})
export class ShippingConfigModule {}
