import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/user-role.enum.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { UpdateSellerProfileDto } from './dto/update-seller-profile.dto.js';
import { SellerService } from './seller.service.js';

@Controller('seller')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SELLER)
export class SellerController {
  constructor(private readonly sellerService: SellerService) {}

  @Get('profile')
  getProfile(@CurrentUser('userId') userId: string) {
    return this.sellerService.getProfile(userId);
  }

  @Patch('profile')
  updateProfile(
    @CurrentUser('userId') userId: string,
    @Body() updateSellerProfileDto: UpdateSellerProfileDto,
  ) {
    return this.sellerService.updateProfile(userId, updateSellerProfileDto);
  }
}
