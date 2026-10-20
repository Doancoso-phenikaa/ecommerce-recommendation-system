import type { HttpService } from '@nestjs/axios';
import type { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Category } from '../category/entities/category.entity.js';
import { CategoryStatus } from '../category/enums/category-status.enum.js';
import { Inventory } from '../inventory/entities/inventory.entity.js';
import { Product } from '../product/entities/product.entity.js';
import { ProductStatus } from '../product/enums/product-status.enum.js';
import { Shop } from '../shop/entities/shop.entity.js';
import { ShopStatus } from '../shop/enums/shop-status.enum.js';
import { RecommendationCatalogService } from './recommendation-catalog.service.js';

function productFixture(): Product {
  return Object.assign(new Product(), {
    productId: '9007199254740994',
    shopId: '12',
    categoryId: '7',
    name: 'Tai nghe Sony',
    price: '890000.00',
    imageUrl: 'https://example.com/headphones.jpg',
    status: ProductStatus.APPROVED,
    shop: Object.assign(new Shop(), { status: ShopStatus.ACTIVE }),
    category: Object.assign(new Category(), {
      name: 'Điện tử',
      status: CategoryStatus.ACTIVE,
    }),
    inventory: Object.assign(new Inventory(), {
      quantity: 5,
      reservedQuantity: 2,
    }),
  });
}

describe('RecommendationCatalogService', () => {
  const find = vi.fn();
  const put = vi.fn();
  const get = vi.fn();
  let service: RecommendationCatalogService;

  beforeEach(() => {
    vi.clearAllMocks();
    find.mockResolvedValue([productFixture()]);
    put.mockReturnValue(
      of({
        data: {
          total_items: 1,
          available_items: 1,
          synced_at: '2026-10-20T10:00:00Z',
        },
      }),
    );
    get.mockReturnValue('http://localhost:8000/');
    service = new RecommendationCatalogService(
      { find } as unknown as Repository<Product>,
      { put } as unknown as HttpService,
      { get } as unknown as ConfigService,
    );
  });

  it('maps real string IDs, category, null brand, image and exact VND price', () => {
    expect(service.mapProduct(productFixture())).toEqual({
      item_id: '9007199254740994',
      title: 'Tai nghe Sony',
      brand_id: null,
      category_path: ['Điện tử'],
      price_cents: 890000,
      image_url: 'https://example.com/headphones.jpg',
      available: true,
    });
  });

  it('rejects fractional dong instead of rounding', () => {
    const product = productFixture();
    product.price = '890000.25';

    expect(() => service.mapProduct(product)).toThrow(
      'VND unit price must not contain fractional dong',
    );
  });

  it.each([
    ['product pending', (p: Product) => (p.status = ProductStatus.PENDING)],
    ['shop suspended', (p: Product) => (p.shop.status = ShopStatus.SUSPENDED)],
    ['category inactive', (p: Product) => (p.category.status = CategoryStatus.INACTIVE)],
    ['missing inventory', (p: Product) => (p.inventory = undefined)],
    ['no sellable stock', (p: Product) => (p.inventory!.reservedQuantity = 5)],
  ])('marks unavailable when %s', (_label, mutate) => {
    const product = productFixture();
    mutate(product);

    expect(service.mapProduct(product).available).toBe(false);
  });

  it('loads all catalog relations in one repository query', async () => {
    await service.loadCatalogProducts();

    expect(find).toHaveBeenCalledWith({
      relations: { category: true, shop: true, inventory: true },
      order: { productId: 'ASC' },
    });
  });

  it('sends the complete payload to Python and maps the sync response', async () => {
    await expect(service.syncFullCatalog()).resolves.toEqual({
      totalItems: 1,
      availableItems: 1,
      syncedAt: '2026-10-20T10:00:00Z',
    });
    expect(put).toHaveBeenCalledWith('http://localhost:8000/catalog', {
      items: [service.mapProduct(productFixture())],
    });
  });
});
