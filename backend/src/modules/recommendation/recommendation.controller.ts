import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/user-role.enum.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { ProductIdParamDto } from '../product/dto/product-id-param.dto.js';
import { RecommendationQueryDto } from './dto/recommendation-query.dto.js';
import { RecommendationService } from './recommendation.service.js';

@Controller('recommendations')
export class RecommendationController {
  constructor(private readonly recommendationService: RecommendationService) {}

  @Get('similar/:productId')
  getSimilarProducts(
    @Param() params: ProductIdParamDto,
    @Query() query: RecommendationQueryDto,
  ) {
    return this.recommendationService.getSimilar(params.productId, query.limit);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CUSTOMER)
  getRecommendations(
    @CurrentUser('userId') userId: string,
    @Query() query: RecommendationQueryDto,
  ) {
    return this.recommendationService.getForUser(userId, query.limit);
  }
}
