import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/user-role.enum.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { OrderIdParamDto } from '../order/dto/order-id-param.dto.js';
import { AdminOrderService } from './admin-order.service.js';
import { AdminOrderQueryDto } from './dto/admin-order-query.dto.js';

@Controller('admin/orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminOrderController {
  constructor(private readonly adminOrderService: AdminOrderService) {}

  @Get()
  getOrders(@Query() query: AdminOrderQueryDto) {
    return this.adminOrderService.getOrders(query);
  }

  @Get(':orderId')
  getOrderDetail(@Param() params: OrderIdParamDto) {
    return this.adminOrderService.getOrderDetail(params.orderId);
  }
}
