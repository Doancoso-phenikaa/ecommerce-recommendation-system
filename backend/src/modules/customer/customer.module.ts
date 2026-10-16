import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { UserModule } from '../user/user.module.js';
import { CustomerController } from './customer.controller.js';
import { CustomerService } from './customer.service.js';
import { Customer } from './entities/customer.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Customer]), UserModule, AuthModule],
  controllers: [CustomerController],
  providers: [CustomerService],
})
export class CustomerModule {}
