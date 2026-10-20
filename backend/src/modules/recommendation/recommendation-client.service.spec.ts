import type { HttpService } from '@nestjs/axios';
import { Logger } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RecommendationClientService } from './recommendation-client.service.js';

describe('RecommendationClientService', () => {
  const get = vi.fn();
  let service: RecommendationClientService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    service = new RecommendationClientService({
      get,
    } as unknown as HttpService);
  });

  it('normalizes the exact personalized provider contract', async () => {
    get.mockReturnValue(
      of({
        data: {
          recommendations: [{ item_id: '60', score: 0.8, reason: 'als' }],
          cold_start: false,
          strategy: 'als_hybrid',
          model_version: 'v4',
        },
      }),
    );

    await expect(service.getPersonalized('15', 20)).resolves.toEqual({
      recommendations: [{ itemId: '60', score: 0.8, reason: 'als' }],
      coldStart: false,
      strategy: 'als_hybrid',
      modelVersion: 'v4',
    });
    expect(get).toHaveBeenCalledWith('/recommendations/15', {
      params: { count: 20 },
    });
  });

  it('returns null when the provider times out', async () => {
    get.mockReturnValue(
      throwError(() => new Error('timeout of 5000ms exceeded')),
    );

    await expect(service.getSimilar('60', 10)).resolves.toBeNull();
    expect(Logger.prototype.warn).toHaveBeenCalledOnce();
  });

  it('returns null instead of exposing a malformed provider response', async () => {
    get.mockReturnValue(
      of({
        data: {
          items: [{ item_id: 60, score: 'high' }],
          strategy: 'content',
          model_version: 'v4',
        },
      }),
    );

    await expect(service.getSimilar('20', 10)).resolves.toBeNull();
  });
});
