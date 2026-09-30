import { Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/user-role.enum.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { OrderIdParamDto } from './dto/order-id-param.dto.js';
import { OrderService } from './order.service.js';

@Controller('seller/orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SELLER)
export class SellerOrderController {
  constructor(private readonly orderService: OrderService) {}

  @Get()
  getSellerOrders(@CurrentUser('userId') userId: string) {
    return this.orderService.getSellerOrders(userId);
  }

  @Get(':orderId')
  getSellerOrderDetail(
    @CurrentUser('userId') userId: string,
    @Param() params: OrderIdParamDto,
  ) {
    return this.orderService.getSellerOrderDetail(userId, params.orderId);
  }

  @Patch(':orderId/confirm')
  confirmOrder(
    @CurrentUser('userId') userId: string,
    @Param() params: OrderIdParamDto,
  ) {
    return this.orderService.confirmOrder(userId, params.orderId);
  }

  @Patch(':orderId/shipping')
  startShipping(
    @CurrentUser('userId') userId: string,
    @Param() params: OrderIdParamDto,
  ) {
    return this.orderService.startShipping(userId, params.orderId);
  }

  @Patch(':orderId/complete')
  completeOrder(
    @CurrentUser('userId') userId: string,
    @Param() params: OrderIdParamDto,
  ) {
    return this.orderService.completeOrder(userId, params.orderId);
  }

  @Patch(':orderId/cancel')
  cancelOrderBySeller(
    @CurrentUser('userId') userId: string,
    @Param() params: OrderIdParamDto,
  ) {
    return this.orderService.cancelOrderBySeller(userId, params.orderId);
  }
}
