import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/user-role.enum.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { ProductIdParamDto } from './dto/product-id-param.dto.js';
import { SellerProductQueryDto } from './dto/seller-product-query.dto.js';
import { ProductService } from './product.service.js';

@Controller('seller/products')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SELLER)
export class SellerProductController {
  constructor(private readonly productService: ProductService) {}

  @Get()
  getSellerProducts(
    @CurrentUser('userId') userId: string,
    @Query() query: SellerProductQueryDto,
  ) {
    return this.productService.getSellerProducts(userId, query);
  }

  @Get(':productId')
  getSellerProductDetail(
    @CurrentUser('userId') userId: string,
    @Param() params: ProductIdParamDto,
  ) {
    return this.productService.getSellerProductDetail(userId, params.productId);
  }
}
