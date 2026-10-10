import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/user-role.enum.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { AdminStatisticsService } from './admin-statistics.service.js';
import { AdminStatisticsQueryDto } from './dto/admin-statistics-query.dto.js';

@Controller('admin/statistics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminStatisticsController {
  constructor(
    private readonly adminStatisticsService: AdminStatisticsService,
  ) {}

  @Get('overview')
  getOverview(@Query() query: AdminStatisticsQueryDto) {
    return this.adminStatisticsService.getOverview(query);
  }
}
