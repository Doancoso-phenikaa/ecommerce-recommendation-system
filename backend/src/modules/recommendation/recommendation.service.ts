import { HttpService } from '@nestjs/axios';
import {
  BadGatewayException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { firstValueFrom } from 'rxjs';
import { In, Repository } from 'typeorm';
import { Customer } from '../customer/entities/customer.entity.js';
import { Product } from '../product/entities/product.entity.js';
import { ProductStatus } from '../product/enums/product-status.enum.js';
import { UserBehavior } from '../user-behavior/entities/user-behavior.entity.js';
import {
  buildRecommendationProviderRequest,
  parseRecommendationProviderResponse,
  type RecommendationCandidate,
} from './contracts/recommendation-provider.contract.js';
import type { RecommendedProduct } from './interfaces/recommended-product.interface.js';

@Injectable()
export class RecommendationService {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(UserBehavior)
    private readonly userBehaviorRepository: Repository<UserBehavior>,
  ) {}

  async getForUser(userId: string): Promise<RecommendedProduct[]> {
    const customer = await this.customerRepository.findOne({
      where: { userId },
    });

    if (!customer) {
      throw new ForbiddenException('Customer profile is required');
    }

    const behaviorCount = await this.userBehaviorRepository.count({
      where: { customerId: customer.customerId },
    });

    const candidates = await this.requestRecommendations({
      customerId: customer.customerId,
      hasBehavior: behaviorCount > 0,
    });

    return this.hydrateProducts(candidates);
  }

  private async requestRecommendations(context: {
    customerId: string;
    hasBehavior: boolean;
  }): Promise<RecommendationCandidate[]> {
    const endpoint = this.configService.getOrThrow<string>(
      'RECOMMENDATION_SERVICE_RECOMMENDATIONS_PATH',
    );
    const request = buildRecommendationProviderRequest(context);

    try {
      const response = await firstValueFrom(
        this.httpService.post<unknown>(endpoint, request),
      );

      return parseRecommendationProviderResponse(response.data);
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }

      throw new ServiceUnavailableException(
        'Recommendation service is unavailable',
      );
    }
  }

  private async hydrateProducts(
    candidates: RecommendationCandidate[],
  ): Promise<RecommendedProduct[]> {
    if (candidates.length === 0) {
      return [];
    }

    const productIds = [...new Set(candidates.map(({ productId }) => productId))];
    const products = await this.productRepository.find({
      where: {
        productId: In(productIds),
        status: ProductStatus.APPROVED,
      },
    });
    const productsById = new Map(
      products.map((product) => [product.productId, product]),
    );

    return candidates.flatMap(({ productId, score }) => {
      const product = productsById.get(productId);
      return product ? [{ product, score }] : [];
    });
  }
}
