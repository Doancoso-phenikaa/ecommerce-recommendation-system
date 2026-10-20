import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import {
  parsePersonalizedProviderResponse,
  parseSimilarProviderResponse,
  type PersonalizedProviderResponse,
  type SimilarProviderResponse,
} from './contracts/recommendation-provider.contract.js';

@Injectable()
export class RecommendationClientService {
  private readonly logger = new Logger(RecommendationClientService.name);

  constructor(private readonly httpService: HttpService) {}

  async getPersonalized(
    customerId: string,
    count: number,
  ): Promise<PersonalizedProviderResponse | null> {
    return this.request(
      `/recommendations/${encodeURIComponent(customerId)}`,
      count,
      parsePersonalizedProviderResponse,
    );
  }

  async getSimilar(
    productId: string,
    count: number,
  ): Promise<SimilarProviderResponse | null> {
    return this.request(
      `/similar/${encodeURIComponent(productId)}`,
      count,
      parseSimilarProviderResponse,
    );
  }

  private async request<T>(
    endpoint: string,
    count: number,
    parse: (data: unknown) => T,
  ): Promise<T | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<unknown>(endpoint, { params: { count } }),
      );
      return parse(response.data);
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      const route = endpoint.startsWith('/similar')
        ? 'GET /similar/:productId'
        : 'GET /recommendations/:customerId';
      this.logger.warn(`Recommendation provider ${route} failed: ${detail}`);
      return null;
    }
  }
}
