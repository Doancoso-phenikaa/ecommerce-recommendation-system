import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { CategoryStatus } from '../category/enums/category-status.enum.js';
import { Customer } from '../customer/entities/customer.entity.js';
import { Product } from '../product/entities/product.entity.js';
import { ProductStatus } from '../product/enums/product-status.enum.js';
import { ProductService } from '../product/product.service.js';
import { ShopStatus } from '../shop/enums/shop-status.enum.js';
import type { RecommendationCandidate } from './contracts/recommendation-provider.contract.js';
import type {
  PersonalizedRecommendationsResponse,
  RecommendedProduct,
  SimilarRecommendationsResponse,
} from './interfaces/recommended-product.interface.js';
import { RecommendationClientService } from './recommendation-client.service.js';

const MAX_PROVIDER_CANDIDATES = 40;

@Injectable()
export class RecommendationService {
  constructor(
    private readonly recommendationClient: RecommendationClientService,
    private readonly productService: ProductService,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  async getForUser(
    userId: string,
    limit: number,
  ): Promise<PersonalizedRecommendationsResponse> {
    const customer = await this.customerRepository.findOneBy({ userId });

    if (!customer) {
      throw new ForbiddenException('Customer profile is required');
    }

    const candidateCount = this.getCandidateCount(limit);
    const provider = await this.recommendationClient.getPersonalized(
      customer.customerId,
      candidateCount,
    );

    if (provider) {
      const items = await this.hydrateRankedProducts(
        provider.recommendations.slice(0, candidateCount),
        limit,
      );

      if (items.length > 0) {
        return {
          items,
          coldStart: provider.coldStart,
          strategy: provider.strategy,
          modelVersion: provider.modelVersion,
        };
      }
    }

    return {
      items: await this.getNewestFallback(limit),
      coldStart: true,
      strategy: 'database_fallback',
      modelVersion: null,
    };
  }

  async getSimilar(
    productId: string,
    limit: number,
  ): Promise<SimilarRecommendationsResponse> {
    const sourceProduct = await this.findPublicSourceProduct(productId);
    const candidateCount = this.getCandidateCount(limit);
    const provider = await this.recommendationClient.getSimilar(
      productId,
      candidateCount,
    );

    if (provider) {
      const items = await this.hydrateRankedProducts(
        provider.items.slice(0, candidateCount),
        limit,
        new Set([productId]),
      );

      if (items.length > 0) {
        return {
          items,
          strategy: provider.strategy,
          modelVersion: provider.modelVersion,
        };
      }
    }

    return {
      items: await this.getSameCategoryFallback(
        sourceProduct.categoryId,
        productId,
        limit,
      ),
      strategy: 'database_same_category_fallback',
      modelVersion: null,
    };
  }

  private getCandidateCount(limit: number): number {
    return Math.min(limit * 2, MAX_PROVIDER_CANDIDATES);
  }

  private async hydrateRankedProducts(
    candidates: RecommendationCandidate[],
    limit: number,
    excludedIds: Set<string> = new Set(),
  ): Promise<RecommendedProduct[]> {
    const productIds: string[] = [];
    const requested = new Set<string>();

    for (const candidate of candidates) {
      if (
        !excludedIds.has(candidate.itemId) &&
        !requested.has(candidate.itemId)
      ) {
        requested.add(candidate.itemId);
        productIds.push(candidate.itemId);
      }
    }

    if (productIds.length === 0) {
      return [];
    }

    const products = await this.createEligibleProductQuery()
      .andWhere('product.productId IN (:...productIds)', { productIds })
      .getMany();
    const productsById = new Map(
      products
        .filter((product) => this.isEligibleProduct(product))
        .map((product) => [product.productId, product]),
    );
    const emitted = new Set<string>();
    const result: RecommendedProduct[] = [];

    for (const candidate of candidates) {
      if (emitted.has(candidate.itemId) || excludedIds.has(candidate.itemId)) {
        continue;
      }

      const product = productsById.get(candidate.itemId);

      if (!product) {
        continue;
      }

      emitted.add(candidate.itemId);
      result.push({
        product: this.productService.mapPublicProduct(product),
        score: candidate.score,
        reason: candidate.reason,
      });

      if (result.length === limit) {
        break;
      }
    }

    return result;
  }

  private async getNewestFallback(
    limit: number,
  ): Promise<RecommendedProduct[]> {
    const products = await this.createEligibleProductQuery()
      .orderBy('product.createdAt', 'DESC')
      .addOrderBy('product.productId', 'DESC')
      .take(limit)
      .getMany();

    return this.mapFallbackProducts(products, 'database_fallback');
  }

  private async getSameCategoryFallback(
    categoryId: string,
    sourceProductId: string,
    limit: number,
  ): Promise<RecommendedProduct[]> {
    const products = await this.createEligibleProductQuery()
      .andWhere('product.categoryId = :categoryId', { categoryId })
      .andWhere('product.productId != :sourceProductId', { sourceProductId })
      .orderBy('product.createdAt', 'DESC')
      .addOrderBy('product.productId', 'DESC')
      .take(limit)
      .getMany();

    return this.mapFallbackProducts(
      products,
      'database_same_category_fallback',
    );
  }

  private mapFallbackProducts(
    products: Product[],
    reason: string,
  ): RecommendedProduct[] {
    return products
      .filter((product) => this.isEligibleProduct(product))
      .map((product) => ({
        product: this.productService.mapPublicProduct(product),
        score: 0,
        reason,
      }));
  }

  private isEligibleProduct(product: Product): boolean {
    return (
      product.status === ProductStatus.APPROVED &&
      product.shop?.status === ShopStatus.ACTIVE &&
      product.category?.status === CategoryStatus.ACTIVE &&
      product.inventory !== undefined &&
      product.inventory.quantity > product.inventory.reservedQuantity
    );
  }

  private async findPublicSourceProduct(productId: string): Promise<Product> {
    const product = await this.productRepository
      .createQueryBuilder('product')
      .innerJoinAndSelect('product.shop', 'shop')
      .innerJoinAndSelect('product.category', 'category')
      .innerJoinAndSelect('product.inventory', 'inventory')
      .where('product.productId = :productId', { productId })
      .andWhere('product.status = :productStatus', {
        productStatus: ProductStatus.APPROVED,
      })
      .andWhere('shop.status = :shopStatus', {
        shopStatus: ShopStatus.ACTIVE,
      })
      .andWhere('category.status = :categoryStatus', {
        categoryStatus: CategoryStatus.ACTIVE,
      })
      .getOne();

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  private createEligibleProductQuery(): SelectQueryBuilder<Product> {
    return this.productRepository
      .createQueryBuilder('product')
      .innerJoinAndSelect('product.shop', 'shop')
      .innerJoinAndSelect('product.category', 'category')
      .innerJoinAndSelect('product.inventory', 'inventory')
      .where('product.status = :productStatus', {
        productStatus: ProductStatus.APPROVED,
      })
      .andWhere('shop.status = :shopStatus', {
        shopStatus: ShopStatus.ACTIVE,
      })
      .andWhere('category.status = :categoryStatus', {
        categoryStatus: CategoryStatus.ACTIVE,
      })
      .andWhere('inventory.quantity > inventory.reservedQuantity');
  }
}
