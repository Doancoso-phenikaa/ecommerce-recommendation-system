import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/user-role.enum.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { ProductIdParamDto } from './dto/product-id-param.dto.js';
import { ProductQueryDto } from './dto/product-query.dto.js';
import { UpdateInventoryDto } from './dto/update-inventory.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { ProductService } from './product.service.js';

@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get()
  getProducts(@Query() productQueryDto: ProductQueryDto) {
    return this.productService.getProducts(productQueryDto);
  }

  @Get(':productId')
  getProductDetail(@Param() params: ProductIdParamDto) {
    return this.productService.getProductDetail(params.productId);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SELLER)
  createProduct(
    @CurrentUser('userId') userId: string,
    @Body() createProductDto: CreateProductDto,
  ) {
    return this.productService.createProduct(userId, createProductDto);
  }

  @Patch(':productId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SELLER)
  updateProduct(
    @CurrentUser('userId') userId: string,
    @Param() params: ProductIdParamDto,
    @Body() updateProductDto: UpdateProductDto,
  ) {
    return this.productService.updateProduct(
      userId,
      params.productId,
      updateProductDto,
    );
  }

  @Patch(':productId/inventory')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SELLER)
  updateInventory(
    @CurrentUser('userId') userId: string,
    @Param() params: ProductIdParamDto,
    @Body() updateInventoryDto: UpdateInventoryDto,
  ) {
    return this.productService.updateInventory(
      userId,
      params.productId,
      updateInventoryDto,
    );
  }

  @Post(':productId/resubmit')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SELLER)
  resubmitProduct(
    @CurrentUser('userId') userId: string,
    @Param() params: ProductIdParamDto,
  ) {
    return this.productService.resubmitProduct(userId, params.productId);
  }
}
