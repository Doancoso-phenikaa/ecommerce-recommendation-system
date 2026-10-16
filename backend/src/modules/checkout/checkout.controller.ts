import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/user-role.enum.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { CheckoutService } from './checkout.service.js';
import { CheckoutPreviewDto } from './dto/checkout-preview.dto.js';
import { ConfirmCheckoutDto } from './dto/confirm-checkout.dto.js';

@Controller('checkout')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CUSTOMER)
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Post('preview')
  previewCheckout(
    @CurrentUser('userId') userId: string,
    @Body() checkoutPreviewDto?: CheckoutPreviewDto,
  ) {
    return this.checkoutService.previewCheckout(userId, checkoutPreviewDto);
  }

  @Post()
  confirmCheckout(
    @CurrentUser('userId') userId: string,
    @Body() confirmCheckoutDto: ConfirmCheckoutDto,
  ) {
    return this.checkoutService.confirmCheckout(userId, confirmCheckoutDto);
  }
}
