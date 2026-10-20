import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { Customer } from '../customer/entities/customer.entity.js';
import { Product } from '../product/entities/product.entity.js';
import { ProductModule } from '../product/product.module.js';
import { RecommendationClientService } from './recommendation-client.service.js';
import { RecommendationController } from './recommendation.controller.js';
import { RecommendationService } from './recommendation.service.js';

const DEFAULT_RECOMMENDATION_TIMEOUT_MS = 5000;

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    ProductModule,
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const configuredTimeout = Number(
          configService.get('RECOMMENDATION_SERVICE_TIMEOUT_MS') ??
            DEFAULT_RECOMMENDATION_TIMEOUT_MS,
        );

        return {
          baseURL: configService.getOrThrow<string>(
            'RECOMMENDATION_SERVICE_URL',
          ),
          timeout:
            Number.isFinite(configuredTimeout) && configuredTimeout > 0
              ? configuredTimeout
              : DEFAULT_RECOMMENDATION_TIMEOUT_MS,
        };
      },
    }),
    TypeOrmModule.forFeature([Customer, Product]),
  ],
  controllers: [RecommendationController],
  providers: [RecommendationClientService, RecommendationService],
  exports: [RecommendationService],
})
export class RecommendationModule {}
