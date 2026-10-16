import { Body, Controller, Param, Patch, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/user-role.enum.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { ProductIdParamDto } from './dto/product-id-param.dto.js';
import { RejectProductDto } from './dto/reject-product.dto.js';
import { ProductService } from './product.service.js';

@Controller('admin/products')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminProductController {
  constructor(private readonly productService: ProductService) {}

  @Patch(':productId/approve')
  approveProduct(@Param() params: ProductIdParamDto) {
    return this.productService.approveProduct(params.productId);
  }

  @Patch(':productId/reject')
  rejectProduct(
    @Param() params: ProductIdParamDto,
    @Body() rejectProductDto: RejectProductDto,
  ) {
    return this.productService.rejectProduct(
      params.productId,
      rejectProductDto.rejectionReason,
    );
  }
}
