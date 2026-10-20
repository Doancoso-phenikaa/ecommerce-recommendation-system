import type { Repository } from 'typeorm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Category } from '../category/entities/category.entity.js';
import { CategoryStatus } from '../category/enums/category-status.enum.js';
import { Customer } from '../customer/entities/customer.entity.js';
import { Inventory } from '../inventory/entities/inventory.entity.js';
import { Product } from '../product/entities/product.entity.js';
import { ProductStatus } from '../product/enums/product-status.enum.js';
import type { ProductService } from '../product/product.service.js';
import { Shop } from '../shop/entities/shop.entity.js';
import { ShopStatus } from '../shop/enums/shop-status.enum.js';
import type { RecommendationClientService } from './recommendation-client.service.js';
import { RecommendationService } from './recommendation.service.js';

interface QueryResult {
  many?: Product[];
  one?: Product | null;
}

class QueryBuilderStub {
  readonly andWhereCalls: Array<[string, unknown]> = [];
  readonly getMany = vi.fn<() => Promise<Product[]>>();
  readonly getOne = vi.fn<() => Promise<Product | null>>();

  constructor(result: QueryResult) {
    this.getMany.mockResolvedValue(result.many ?? []);
    this.getOne.mockResolvedValue(result.one ?? null);
  }

  innerJoinAndSelect() {
    return this;
  }

  where() {
    return this;
  }

  andWhere(sql: string, params?: unknown) {
    this.andWhereCalls.push([sql, params]);
    return this;
  }

  orderBy() {
    return this;
  }

  addOrderBy() {
    return this;
  }

  take() {
    return this;
  }
}

function productFixture(productId: string): Product {
  return Object.assign(new Product(), {
    productId,
    shopId: '5',
    categoryId: '7',
    name: `Product ${productId}`,
    description: null,
    price: '100000.00',
    originalPrice: null,
    imageUrl: null,
    status: ProductStatus.APPROVED,
    approvedAt: new Date('2026-10-20T00:00:00.000Z'),
    createdAt: new Date('2026-10-20T00:00:00.000Z'),
    updatedAt: new Date('2026-10-20T00:00:00.000Z'),
    shop: Object.assign(new Shop(), {
      shopId: '5',
      name: 'MarketNest Shop',
      status: ShopStatus.ACTIVE,
      logoUrl: null,
    }),
    category: Object.assign(new Category(), {
      categoryId: '7',
      name: 'Electronics',
      status: CategoryStatus.ACTIVE,
    }),
    inventory: Object.assign(new Inventory(), {
      quantity: 10,
      reservedQuantity: 2,
    }),
  });
}

describe('RecommendationService', () => {
  const getPersonalized = vi.fn();
  const getSimilar = vi.fn();
  const findOneBy = vi.fn();
  const createQueryBuilder = vi.fn();
  const mapPublicProduct = vi.fn((product: Product) => ({
    productId: product.productId,
  }));
  let service: RecommendationService;

  beforeEach(() => {
    vi.clearAllMocks();
    findOneBy.mockResolvedValue(
      Object.assign(new Customer(), { customerId: '15', userId: '900' }),
    );
    service = new RecommendationService(
      { getPersonalized, getSimilar } as unknown as RecommendationClientService,
      { mapPublicProduct } as unknown as ProductService,
      { findOneBy } as unknown as Repository<Customer>,
      { createQueryBuilder } as unknown as Repository<Product>,
    );
  });

  function useQueries(...results: QueryResult[]): QueryBuilderStub[] {
    const builders = results.map((result) => new QueryBuilderStub(result));
    builders.forEach((builder) =>
      createQueryBuilder.mockReturnValueOnce(builder),
    );
    return builders;
  }

  it('uses customerId, batch hydrates once, restores rank and deduplicates IDs', async () => {
    getPersonalized.mockResolvedValue({
      recommendations: [
        { itemId: '60', score: 0.9, reason: 'content_similar' },
        { itemId: '62', score: 0.8, reason: 'als' },
        { itemId: '60', score: 0.7, reason: 'duplicate' },
        { itemId: '61', score: 0.6, reason: null },
      ],
      coldStart: false,
      strategy: 'als_hybrid',
      modelVersion: 'v4',
    });
    const [batchQuery] = useQueries({
      many: [productFixture('61'), productFixture('60'), productFixture('62')],
    });

    const response = await service.getForUser('900', 3);

    expect(findOneBy).toHaveBeenCalledWith({ userId: '900' });
    expect(getPersonalized).toHaveBeenCalledWith('15', 6);
    expect(response.items.map((item) => item.product.productId)).toEqual([
      '60',
      '62',
      '61',
    ]);
    expect(response).toMatchObject({
      coldStart: false,
      strategy: 'als_hybrid',
      modelVersion: 'v4',
    });
    expect(createQueryBuilder).toHaveBeenCalledOnce();
    expect(batchQuery.getMany).toHaveBeenCalledOnce();
  });

  it('silently filters every invalid commerce state while retaining valid items', async () => {
    const pending = productFixture('70');
    pending.status = ProductStatus.PENDING;
    const inactiveShop = productFixture('71');
    inactiveShop.shop.status = ShopStatus.SUSPENDED;
    const inactiveCategory = productFixture('72');
    inactiveCategory.category.status = CategoryStatus.INACTIVE;
    const soldOut = productFixture('73');
    soldOut.inventory!.reservedQuantity = 10;
    const missingInventory = productFixture('74');
    missingInventory.inventory = undefined;
    const valid = productFixture('75');
    const products = [
      pending,
      inactiveShop,
      inactiveCategory,
      soldOut,
      missingInventory,
      valid,
    ];

    getPersonalized.mockResolvedValue({
      recommendations: products.map((product) => ({
        itemId: product.productId,
        score: 1,
        reason: 'test',
      })),
      coldStart: false,
      strategy: 'hybrid',
      modelVersion: 'v4',
    });
    useQueries({ many: products });

    const response = await service.getForUser('900', 10);

    expect(response.items.map((item) => item.product.productId)).toEqual([
      '75',
    ]);
  });

  it.each([
    ['provider failure', null],
    [
      'zero usable IDs',
      {
        recommendations: [{ itemId: '404', score: 1, reason: null }],
        coldStart: false,
        strategy: 'als_hybrid',
        modelVersion: 'v4',
      },
    ],
  ])(
    'uses newest valid products when personalized %s',
    async (_label, provider) => {
      getPersonalized.mockResolvedValue(provider);
      const fallback = productFixture('80');
      useQueries(
        ...(provider
          ? [{ many: [] }, { many: [fallback] }]
          : [{ many: [fallback] }]),
      );

      const response = await service.getForUser('900', 5);

      expect(response.items[0]?.product.productId).toBe('80');
      expect(response).toMatchObject({
        coldStart: true,
        strategy: 'database_fallback',
      });
    },
  );

  it('preserves similar ranking, excludes the source and uses one batch query', async () => {
    const source = productFixture('60');
    getSimilar.mockResolvedValue({
      items: [
        { itemId: '60', score: 1, reason: 'self' },
        { itemId: '62', score: 0.9, reason: 'content' },
        { itemId: '61', score: 0.8, reason: 'content' },
        { itemId: '63', score: 0.75, reason: 'content' },
        { itemId: '62', score: 0.7, reason: 'duplicate' },
      ],
      strategy: 'content',
      modelVersion: 'v4',
    });
    const soldOut = productFixture('63');
    soldOut.inventory!.reservedQuantity = soldOut.inventory!.quantity;
    const [, batchQuery] = useQueries(
      { one: source },
      { many: [productFixture('61'), soldOut, productFixture('62')] },
    );

    const response = await service.getSimilar('60', 5);

    expect(response.items.map((item) => item.product.productId)).toEqual([
      '62',
      '61',
    ]);
    expect(response).toMatchObject({ strategy: 'content', modelVersion: 'v4' });
    expect(batchQuery.getMany).toHaveBeenCalledOnce();
  });

  it.each([
    ['provider failure', null],
    [
      'no usable candidates',
      {
        items: [{ itemId: '999', score: 1, reason: 'missing' }],
        strategy: 'content',
        modelVersion: 'v4',
      },
    ],
  ])(
    'uses same-category fallback when similar has %s',
    async (_label, provider) => {
      getSimilar.mockResolvedValue(provider);
      const source = productFixture('60');
      const fallback = productFixture('81');
      const builders = useQueries(
        { one: source },
        ...(provider
          ? [{ many: [] }, { many: [fallback] }]
          : [{ many: [fallback] }]),
      );

      const response = await service.getSimilar('60', 4);
      const fallbackQuery = builders.at(-1)!;

      expect(response.items[0]?.product.productId).toBe('81');
      expect(response.strategy).toBe('database_same_category_fallback');
      expect(fallbackQuery.andWhereCalls).toContainEqual([
        'product.categoryId = :categoryId',
        { categoryId: '7' },
      ]);
      expect(fallbackQuery.andWhereCalls).toContainEqual([
        'product.productId != :sourceProductId',
        { sourceProductId: '60' },
      ]);
    },
  );
});
