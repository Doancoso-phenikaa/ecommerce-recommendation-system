import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/user-role.enum.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { ProductIdParamDto } from '../product/dto/product-id-param.dto.js';
import { WishlistService } from './wishlist.service.js';

@Controller('wishlist')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CUSTOMER)
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Get()
  getWishlist(@CurrentUser('userId') userId: string) {
    return this.wishlistService.getWishlist(userId);
  }

  @Post(':productId')
  addProduct(
    @CurrentUser('userId') userId: string,
    @Param() params: ProductIdParamDto,
  ) {
    return this.wishlistService.addProduct(userId, params.productId);
  }

  @Delete(':productId')
  removeProduct(
    @CurrentUser('userId') userId: string,
    @Param() params: ProductIdParamDto,
  ) {
    return this.wishlistService.removeProduct(userId, params.productId);
  }
}
