import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/user-role.enum.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { RevenueStatisticsQueryDto } from './dto/revenue-statistics-query.dto.js';
import { SellerStatisticsService } from './seller-statistics.service.js';

@Controller('seller/statistics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SELLER)
export class SellerStatisticsController {
  constructor(
    private readonly sellerStatisticsService: SellerStatisticsService,
  ) {}

  @Get('revenue')
  getRevenueStatistics(
    @CurrentUser('userId') userId: string,
    @Query() query: RevenueStatisticsQueryDto,
  ) {
    return this.sellerStatisticsService.getRevenueStatistics(userId, query);
  }
}
