import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
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
import { SellerReviewQueryDto } from './dto/seller-review-query.dto.js';
import { SellerReplyReviewDto } from './dto/seller-reply-review.dto.js';
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

  @Get('seller/reviews')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SELLER)
  getSellerReviews(
    @CurrentUser('userId') userId: string,
    @Query() query: SellerReviewQueryDto,
  ) {
    return this.reviewService.getSellerReviews(userId, query);
  }

  @Patch('seller/reviews/:reviewId/reply')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SELLER)
  replyToReview(
    @CurrentUser('userId') userId: string,
    @Param() params: ReviewIdParamDto,
    @Body() dto: SellerReplyReviewDto,
  ) {
    return this.reviewService.replyToReview(userId, params.reviewId, dto);
  }
}
