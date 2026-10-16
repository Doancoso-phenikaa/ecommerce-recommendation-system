import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { Category } from '../category/entities/category.entity.js';
import { Inventory } from '../inventory/entities/inventory.entity.js';
import { Seller } from '../seller/entities/seller.entity.js';
import { Shop } from '../shop/entities/shop.entity.js';
import { AdminProductController } from './admin-product.controller.js';
import { Product } from './entities/product.entity.js';
import { ProductController } from './product.controller.js';
import { ProductService } from './product.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      Inventory,
      Seller,
      Shop,
      Category,
    ]),
    AuthModule,
  ],
  controllers: [ProductController, AdminProductController],
  providers: [ProductService],
})
export class ProductModule {}
