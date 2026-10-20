import { Controller, Post, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/user-role.enum.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { RecommendationCatalogService } from '../recommendation/recommendation-catalog.service.js';

@Controller('admin/recommendation/catalog')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminRecommendationCatalogController {
  constructor(
    private readonly recommendationCatalogService: RecommendationCatalogService,
  ) {}

  @Post('sync')
  syncCatalog() {
    return this.recommendationCatalogService.syncFullCatalog();
  }
}
