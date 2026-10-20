import { HttpService } from '@nestjs/axios';
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { firstValueFrom } from 'rxjs';
import { Repository } from 'typeorm';
import { CategoryStatus } from '../category/enums/category-status.enum.js';
import { Product } from '../product/entities/product.entity.js';
import { ProductStatus } from '../product/enums/product-status.enum.js';
import { ShopStatus } from '../shop/enums/shop-status.enum.js';
import { vndDecimalToMinorUnits } from './vnd-price.util.js';

export interface RecommendationCatalogItem {
  item_id: string;
  title: string;
  brand_id: null;
  category_path: string[];
  price_cents: number;
  image_url: string | null;
  available: boolean;
}

interface PythonCatalogSyncResponse {
  total_items: number;
  available_items: number;
  synced_at: string;
}

export interface RecommendationCatalogSyncResponse {
  totalItems: number;
  availableItems: number;
  syncedAt: string;
}

@Injectable()
export class RecommendationCatalogService {
  private readonly logger = new Logger(RecommendationCatalogService.name);

  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async syncFullCatalog(): Promise<RecommendationCatalogSyncResponse> {
    const products = await this.loadCatalogProducts();

    if (products.length === 0) {
      throw new BadRequestException(
        'Catalog sync refused because the product query returned no items',
      );
    }

    const items = products.map((product) => this.mapProduct(product));
    const endpoint = this.getCatalogEndpoint();

    this.logger.log(
      `Synchronizing ${items.length} catalog items (${items.filter((item) => item.available).length} available)`,
    );

    try {
      const response = await firstValueFrom(
        this.httpService.put<PythonCatalogSyncResponse>(endpoint, { items }),
      );

      this.logger.log(
        `Catalog synchronization completed at ${response.data.synced_at}`,
      );

      return {
        totalItems: response.data.total_items,
        availableItems: response.data.available_items,
        syncedAt: response.data.synced_at,
      };
    } catch (error: unknown) {
      const detail = this.getProviderErrorDetail(error);
      this.logger.error(`Catalog synchronization failed: ${detail}`);
      throw new BadGatewayException(
        `Recommendation catalog synchronization failed: ${detail}`,
      );
    }
  }

  async loadCatalogProducts(): Promise<Product[]> {
    return this.productRepository.find({
      relations: {
        category: true,
        shop: true,
        inventory: true,
      },
      order: {
        productId: 'ASC',
      },
    });
  }

  mapProduct(product: Product): RecommendationCatalogItem {
    const inventory = product.inventory;
    const availableQuantity = inventory
      ? inventory.quantity - inventory.reservedQuantity
      : 0;

    return {
      item_id: product.productId,
      title: product.name,
      brand_id: null,
      category_path: [product.category.name],
      price_cents: vndDecimalToMinorUnits(product.price),
      image_url: product.imageUrl,
      available:
        product.status === ProductStatus.APPROVED &&
        product.shop.status === ShopStatus.ACTIVE &&
        product.category.status === CategoryStatus.ACTIVE &&
        inventory !== undefined &&
        availableQuantity > 0,
    };
  }

  private getCatalogEndpoint(): string {
    const baseUrl = this.configService
      .get<string>('RECOMMENDATION_SERVICE_URL')
      ?.trim()
      .replace(/\/+$/, '');

    if (!baseUrl) {
      throw new ServiceUnavailableException(
        'RECOMMENDATION_SERVICE_URL is not configured',
      );
    }

    return `${baseUrl}/catalog`;
  }

  private getProviderErrorDetail(error: unknown): string {
    if (typeof error !== 'object' || error === null) {
      return String(error);
    }

    const candidate = error as {
      message?: string;
      response?: { status?: number; data?: unknown };
    };
    const status = candidate.response?.status;
    const data = candidate.response?.data;
    const providerMessage =
      typeof data === 'object' && data !== null && 'detail' in data
        ? String((data as { detail: unknown }).detail)
        : candidate.message ?? 'Unknown provider error';

    return status ? `HTTP ${status}: ${providerMessage}` : providerMessage;
  }
}
