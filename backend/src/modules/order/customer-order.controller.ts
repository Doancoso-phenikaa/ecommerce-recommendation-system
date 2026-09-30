import { Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/user-role.enum.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { OrderGroupIdParamDto } from './dto/order-group-id-param.dto.js';
import { OrderIdParamDto } from './dto/order-id-param.dto.js';
import { OrderService } from './order.service.js';

@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CUSTOMER)
export class CustomerOrderController {
  constructor(private readonly orderService: OrderService) {}

  @Get()
  getMyOrders(@CurrentUser('userId') userId: string) {
    return this.orderService.getMyOrders(userId);
  }

  @Get(':orderGroupId')
  getMyOrderDetail(
    @CurrentUser('userId') userId: string,
    @Param() params: OrderGroupIdParamDto,
  ) {
    return this.orderService.getMyOrderDetail(userId, params.orderGroupId);
  }

  @Patch(':orderId/cancel')
  cancelMyOrder(
    @CurrentUser('userId') userId: string,
    @Param() params: OrderIdParamDto,
  ) {
    return this.orderService.cancelMyOrder(userId, params.orderId);
  }
}
