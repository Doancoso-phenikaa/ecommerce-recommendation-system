import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/user-role.enum.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { ProductIdParamDto } from '../product/dto/product-id-param.dto.js';
import { RecommendationEventPublisherService } from '../recommendation/recommendation-event-publisher.service.js';
import { UserBehaviorService } from './user-behavior.service.js';

@Controller('user-behaviors')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CUSTOMER)
export class UserBehaviorController {
  constructor(
    private readonly userBehaviorService: UserBehaviorService,
    private readonly recommendationEventPublisher: RecommendationEventPublisherService,
  ) {}

  @Post('view/:productId')
  async recordView(
    @CurrentUser('userId') userId: string,
    @Param() params: ProductIdParamDto,
  ) {
    const behavior = await this.userBehaviorService.recordViewByUserId(
      userId,
      params.productId,
    );

    if (behavior) {
      await this.recommendationEventPublisher.publishBehavior(behavior);
    }

    return { message: 'View behavior received' };
  }
}
