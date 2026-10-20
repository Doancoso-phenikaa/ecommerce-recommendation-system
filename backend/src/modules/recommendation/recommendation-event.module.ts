import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RecommendationEventPublisherService } from './recommendation-event-publisher.service.js';

@Module({
  imports: [
    ConfigModule,
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        timeout: Number(
          configService.get('RECOMMENDATION_SERVICE_TIMEOUT_MS') ?? 5000,
        ),
      }),
    }),
  ],
  providers: [RecommendationEventPublisherService],
  exports: [RecommendationEventPublisherService],
})
export class RecommendationEventModule {}
