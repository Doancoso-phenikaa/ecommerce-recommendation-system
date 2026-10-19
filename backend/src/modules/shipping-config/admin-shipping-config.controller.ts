import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/user-role.enum.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { UpdateShippingConfigDto } from './dto/update-shipping-config.dto.js';
import { ShippingConfigService } from './shipping-config.service.js';

@Controller('admin/shipping-config')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminShippingConfigController {
  constructor(private readonly shippingConfigService: ShippingConfigService) {}

  @Get()
  getConfig() {
    return this.shippingConfigService.getConfig();
  }

  @Patch()
  updateConfig(@Body() dto: UpdateShippingConfigDto) {
    return this.shippingConfigService.updateConfig(dto);
  }
}
