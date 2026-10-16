import {
  Body,
  Controller,
  Get,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/user-role.enum.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { CustomerService } from './customer.service.js';
import { UpdateCustomerProfileDto } from './dto/update-customer-profile.dto.js';

@Controller('customer')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CUSTOMER)
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Get('profile')
  getProfile(@CurrentUser('userId') userId: string) {
    return this.customerService.getProfile(userId);
  }

  @Patch('profile')
  updateProfile(
    @CurrentUser('userId') userId: string,
    @Body() updateCustomerProfileDto: UpdateCustomerProfileDto,
  ) {
    return this.customerService.updateProfile(
      userId,
      updateCustomerProfileDto,
    );
  }
}
