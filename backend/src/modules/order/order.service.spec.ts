import type { Repository } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import type { Customer } from '../customer/entities/customer.entity.js';
import type { RecommendationEventPublisherService } from '../recommendation/recommendation-event-publisher.service.js';
import type { Seller } from '../seller/entities/seller.entity.js';
import type { Shop } from '../shop/entities/shop.entity.js';
import type { UserBehaviorService } from '../user-behavior/user-behavior.service.js';
import { BehaviorType } from '../user-behavior/enums/behavior-type.enum.js';
import type { UserBehavior } from '../user-behavior/entities/user-behavior.entity.js';
import type { OrderGroup } from './entities/order-group.entity.js';
import { OrderStatus } from './enums/order-status.enum.js';
import { OrderService } from './order.service.js';

describe('OrderService completed-order purchase behavior', () => {
  it('records and publishes only the durable OrderItems returned by completion', async () => {
    const completedAt = new Date('2026-10-20T08:00:00.000Z');
    const response = {
      orderId: '501',
      status: OrderStatus.COMPLETED,
      updatedAt: completedAt,
      message: 'Order receipt confirmed successfully',
    };
    const transaction = vi.fn().mockResolvedValue({
      customerId: '9007199254740993',
      orderItems: [
        { productId: '701', quantity: 2, unitPrice: '150000.00' },
        { productId: '702', quantity: 1, unitPrice: '99000.00' },
      ],
      response,
    });
    const recordBehavior = vi.fn(
      async (
        customerId: string,
        productId: string,
        behaviorType: BehaviorType,
      ) =>
        ({
          behaviorId: `8${productId}`,
          customerId,
          productId,
          behaviorType,
          createdAt: completedAt,
        }) as UserBehavior,
    );
    const publishBehavior = vi.fn().mockResolvedValue(undefined);
    const service = new OrderService(
      {} as Repository<Customer>,
      {} as Repository<OrderGroup>,
      {} as Repository<Seller>,
      {} as Repository<Shop>,
      { transaction } as never,
      { recordBehavior } as unknown as UserBehaviorService,
      { publishBehavior } as unknown as RecommendationEventPublisherService,
    );

    await expect(
      service.confirmOrderReceived('user-id-is-not-the-recsys-id', '501'),
    ).resolves.toEqual(response);
    expect(recordBehavior).toHaveBeenCalledTimes(2);
    expect(recordBehavior).toHaveBeenNthCalledWith(
      1,
      '9007199254740993',
      '701',
      BehaviorType.PURCHASE,
    );
    expect(publishBehavior).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        customerId: '9007199254740993',
        productId: '701',
      }),
      { quantity: 2, unitPrice: '150000.00' },
    );
    expect(publishBehavior).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ productId: '702' }),
      { quantity: 1, unitPrice: '99000.00' },
    );
  });

  it('keeps completion successful when behavior persistence fails', async () => {
    const response = {
      orderId: '501',
      status: OrderStatus.COMPLETED,
      updatedAt: new Date('2026-10-20T08:00:00.000Z'),
      message: 'Order receipt confirmed successfully',
    };
    const service = new OrderService(
      {} as Repository<Customer>,
      {} as Repository<OrderGroup>,
      {} as Repository<Seller>,
      {} as Repository<Shop>,
      {
        transaction: vi.fn().mockResolvedValue({
          customerId: '41',
          orderItems: [{ productId: '91', quantity: 1, unitPrice: '50000.00' }],
          response,
        }),
      } as never,
      {
        recordBehavior: vi.fn().mockResolvedValue(null),
      } as unknown as UserBehaviorService,
      {
        publishBehavior: vi.fn().mockRejectedValue(new Error('must not run')),
      } as unknown as RecommendationEventPublisherService,
    );

    await expect(service.confirmOrderReceived('12', '501')).resolves.toEqual(
      response,
    );
  });
});
