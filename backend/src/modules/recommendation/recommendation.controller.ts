import {
  Controller,
  Get,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { RecommendationService } from './recommendation.service.js';

interface JwtRequestUser {
  userId?: string;
  sub?: string;
}

@Controller('recommendations')
@UseGuards(AuthGuard('jwt'))
export class RecommendationController {
  constructor(
    private readonly recommendationService: RecommendationService,
  ) {}

  @Get()
  getRecommendations(@Req() request: Request) {
    const user = request.user as JwtRequestUser | undefined;
    const userId = user?.userId ?? user?.sub;

    if (!userId) {
      throw new UnauthorizedException('Authenticated user is required');
    }

    return this.recommendationService.getForUser(userId);
  }
}
