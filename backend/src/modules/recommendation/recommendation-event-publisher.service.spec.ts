import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserBehavior } from '../user-behavior/entities/user-behavior.entity.js';
import { BehaviorType } from '../user-behavior/enums/behavior-type.enum.js';
import {
  RecommendationEventPublisherService,
  vndDecimalToMinorUnits,
} from './recommendation-event-publisher.service.js';

function behavior(type: BehaviorType): UserBehavior {
  return Object.assign(new UserBehavior(), {
    behaviorId: '9007199254740995',
    customerId: '9007199254740993',
    productId: '9007199254740994',
    behaviorType: type,
    createdAt: new Date('2026-10-20T08:00:00.000Z'),
  });
}

describe('RecommendationEventPublisherService', () => {
  const post = vi.fn();
  const get = vi.fn();
  let service: RecommendationEventPublisherService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    post.mockReturnValue(of({ data: { status: 'queued' } }));
    get.mockImplementation((key: string) =>
      key === 'RECOMMENDATION_SERVICE_URL'
        ? 'http://localhost:8000/'
        : undefined,
    );
    service = new RecommendationEventPublisherService(
      { post } as unknown as HttpService,
      { get } as unknown as ConfigService,
    );
  });

  it('maps ADD_CART to cart and preserves bigint identifiers as strings', async () => {
    await service.publishBehavior(behavior(BehaviorType.ADD_CART));

    expect(post).toHaveBeenCalledWith('http://localhost:8000/events', {
      user_id: '9007199254740993',
      item_id: '9007199254740994',
      event_type: 'cart',
      timestamp: '2026-10-20T08:00:00.000Z',
    });
  });

  it('publishes a purchase using the OrderItem quantity and VND snapshot', async () => {
    await service.publishBehavior(behavior(BehaviorType.PURCHASE), {
      quantity: 3,
      unitPrice: '125000.00',
    });

    expect(post).toHaveBeenCalledWith('http://localhost:8000/events', {
      user_id: '9007199254740993',
      item_id: '9007199254740994',
      event_type: 'purchase',
      timestamp: '2026-10-20T08:00:00.000Z',
      value: {
        quantity: 3,
        unit_price_cents: 125000,
        currency: 'VND',
      },
    });
  });

  it('swallows provider failures so commerce actions can continue', async () => {
    post.mockReturnValueOnce(throwError(() => new Error('provider down')));

    await expect(
      service.publishBehavior(behavior(BehaviorType.WISHLIST)),
    ).resolves.toBeUndefined();
  });

  it('does not publish when the provider URL is not configured', async () => {
    get.mockReturnValue(undefined);

    await service.publishBehavior(behavior(BehaviorType.VIEW));

    expect(post).not.toHaveBeenCalled();
  });
});

describe('vndDecimalToMinorUnits', () => {
  it('uses whole dong as the zero-decimal VND minor unit', () => {
    expect(vndDecimalToMinorUnits('125000.00')).toBe(125000);
  });

  it('rejects fractional dong instead of rounding it', () => {
    expect(() => vndDecimalToMinorUnits('125000.50')).toThrow(
      'VND unit price must not contain fractional dong',
    );
  });
});
