import { Body, Controller, Param, Patch, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/user-role.enum.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { ShopService } from '../shop/shop.service.js';
import { RejectShopDto } from './dto/reject-shop.dto.js';
import { ShopIdParamDto } from './dto/shop-id-param.dto.js';

@Controller('admin/shops')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private readonly shopService: ShopService) {}

  @Patch(':shopId/approve')
  approveShop(@Param() params: ShopIdParamDto) {
    return this.shopService.approveShop(params.shopId);
  }

  @Patch(':shopId/reject')
  rejectShop(
    @Param() params: ShopIdParamDto,
    @Body() rejectShopDto: RejectShopDto,
  ) {
    return this.shopService.rejectShop(
      params.shopId,
      rejectShopDto.rejectionReason,
    );
  }
}
