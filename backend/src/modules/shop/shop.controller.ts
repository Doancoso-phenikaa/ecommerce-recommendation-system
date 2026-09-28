import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/user-role.enum.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { CreateShopDto } from './dto/create-shop.dto.js';
import { ShopService } from './shop.service.js';

@Controller('shop')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SELLER)
export class ShopController {
  constructor(private readonly shopService: ShopService) {}

  @Post()
  createShop(
    @CurrentUser('userId') userId: string,
    @Body() createShopDto: CreateShopDto,
  ) {
    return this.shopService.createShop(userId, createShopDto);
  }
}
