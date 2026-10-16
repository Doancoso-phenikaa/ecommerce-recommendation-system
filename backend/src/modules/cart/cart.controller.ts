import {
  Body,
  Controller,
  Delete,
  Get,
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
import { ProductIdParamDto } from '../product/dto/product-id-param.dto.js';
import { CartService } from './cart.service.js';
import { AddCartItemDto } from './dto/add-cart-item.dto.js';
import { UpdateCartItemDto } from './dto/update-cart-item.dto.js';

@Controller('cart')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CUSTOMER)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  getCart(@CurrentUser('userId') userId: string) {
    return this.cartService.getCart(userId);
  }

  @Post('items')
  addItem(
    @CurrentUser('userId') userId: string,
    @Body() addCartItemDto: AddCartItemDto,
  ) {
    return this.cartService.addItem(userId, addCartItemDto);
  }

  @Patch('items/:productId')
  updateItem(
    @CurrentUser('userId') userId: string,
    @Param() params: ProductIdParamDto,
    @Body() updateCartItemDto: UpdateCartItemDto,
  ) {
    return this.cartService.updateItem(
      userId,
      params.productId,
      updateCartItemDto,
    );
  }

  @Delete('items/:productId')
  removeItem(
    @CurrentUser('userId') userId: string,
    @Param() params: ProductIdParamDto,
  ) {
    return this.cartService.removeItem(userId, params.productId);
  }
}
