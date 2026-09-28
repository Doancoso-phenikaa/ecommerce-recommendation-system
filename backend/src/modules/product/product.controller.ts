import {
  Body,
  Controller,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/user-role.enum.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { ProductIdParamDto } from './dto/product-id-param.dto.js';
import { UpdateInventoryDto } from './dto/update-inventory.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { ProductService } from './product.service.js';

@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SELLER)
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Post()
  createProduct(
    @CurrentUser('userId') userId: string,
    @Body() createProductDto: CreateProductDto,
  ) {
    return this.productService.createProduct(userId, createProductDto);
  }

  @Patch(':productId')
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
  resubmitProduct(
    @CurrentUser('userId') userId: string,
    @Param() params: ProductIdParamDto,
  ) {
    return this.productService.resubmitProduct(
      userId,
      params.productId,
    );
  }
}
