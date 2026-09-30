import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/user-role.enum.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { ProductIdParamDto } from '../product/dto/product-id-param.dto.js';
import { CreateReviewDto } from './dto/create-review.dto.js';
import { ReviewIdParamDto } from './dto/review-id-param.dto.js';
import { UpdateReviewDto } from './dto/update-review.dto.js';
import { ReviewService } from './review.service.js';

@Controller()
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Post('reviews')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CUSTOMER)
  createReview(
    @CurrentUser('userId') userId: string,
    @Body() createReviewDto: CreateReviewDto,
  ) {
    return this.reviewService.createReview(userId, createReviewDto);
  }

  @Patch('reviews/:reviewId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CUSTOMER)
  updateReview(
    @CurrentUser('userId') userId: string,
    @Param() params: ReviewIdParamDto,
    @Body() updateReviewDto: UpdateReviewDto,
  ) {
    return this.reviewService.updateReview(
      userId,
      params.reviewId,
      updateReviewDto,
    );
  }

  @Get('products/:productId/reviews')
  getProductReviews(@Param() params: ProductIdParamDto) {
    return this.reviewService.getProductReviews(params.productId);
  }
}
