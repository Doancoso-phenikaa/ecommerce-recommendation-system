import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { UserBehavior } from '../user-behavior/entities/user-behavior.entity.js';
import { BehaviorType } from '../user-behavior/enums/behavior-type.enum.js';

export const RECOMMENDATION_EVENT_TYPES = {
  [BehaviorType.VIEW]: 'view',
  [BehaviorType.ADD_CART]: 'cart',
  [BehaviorType.WISHLIST]: 'wishlist',
  [BehaviorType.PURCHASE]: 'purchase',
} as const satisfies Record<BehaviorType, RecommendationEventType>;

type RecommendationEventType = 'view' | 'cart' | 'wishlist' | 'purchase';

interface PurchaseSnapshot {
  quantity: number;
  unitPrice: string;
}

interface RecommendationEventPayload {
  user_id: string;
  item_id: string;
  event_type: RecommendationEventType;
  timestamp: string;
  value?: {
    quantity: number;
    unit_price_cents: number;
    currency: 'VND';
  };
}

/**
 * The Python field keeps its generic `unit_price_cents` name. VND has no
 * fractional minor unit, so this integration sends an integer number of dong.
 * Database values with a non-zero fractional part are rejected instead of
 * being rounded silently.
 */
export function vndDecimalToMinorUnits(value: string): number {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(value.trim());

  if (!match) {
    throw new Error('VND unit price must be a non-negative decimal string');
  }

  const fraction = (match[2] ?? '').padEnd(2, '0');

  if (fraction !== '00') {
    throw new Error('VND unit price must not contain fractional dong');
  }

  const minorUnits = BigInt(match[1]);

  if (minorUnits > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('VND unit price exceeds the safe JSON integer range');
  }

  return Number(minorUnits);
}

@Injectable()
export class RecommendationEventPublisherService {
  // Best-effort by design: there is no durable outbox/retry in this project
  // scope. Callers persist UserBehavior first; this service never throws a
  // provider failure back into the core commerce action.
  private readonly logger = new Logger(
    RecommendationEventPublisherService.name,
  );
  private hasLoggedMissingConfiguration = false;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async publishBehavior(
    behavior: UserBehavior,
    purchaseSnapshot?: PurchaseSnapshot,
  ): Promise<void> {
    const eventType = RECOMMENDATION_EVENT_TYPES[behavior.behaviorType];

    try {
      const payload = this.buildPayload(behavior, eventType, purchaseSnapshot);
      const endpoint = this.getEventsEndpoint();

      if (!endpoint) {
        return;
      }

      await firstValueFrom(this.httpService.post(endpoint, payload));
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to publish ${eventType} event for customer ${behavior.customerId} and product ${behavior.productId}: ${detail}`,
      );
    }
  }

  private buildPayload(
    behavior: UserBehavior,
    eventType: RecommendationEventType,
    purchaseSnapshot?: PurchaseSnapshot,
  ): RecommendationEventPayload {
    const payload: RecommendationEventPayload = {
      user_id: behavior.customerId,
      item_id: behavior.productId,
      event_type: eventType,
      timestamp: behavior.createdAt.toISOString(),
    };

    if (eventType !== 'purchase') {
      return payload;
    }

    if (!purchaseSnapshot) {
      throw new Error('Purchase event requires an OrderItem snapshot');
    }

    payload.value = {
      quantity: purchaseSnapshot.quantity,
      unit_price_cents: vndDecimalToMinorUnits(purchaseSnapshot.unitPrice),
      currency: 'VND',
    };

    return payload;
  }

  private getEventsEndpoint(): string | null {
    const baseUrl = this.configService
      .get<string>('RECOMMENDATION_SERVICE_URL')
      ?.trim()
      .replace(/\/+$/, '');

    if (baseUrl) {
      return `${baseUrl}/events`;
    }

    if (!this.hasLoggedMissingConfiguration) {
      this.hasLoggedMissingConfiguration = true;
      this.logger.warn(
        'Recommendation event publishing is disabled because RECOMMENDATION_SERVICE_URL is not configured',
      );
    }

    return null;
  }
}
