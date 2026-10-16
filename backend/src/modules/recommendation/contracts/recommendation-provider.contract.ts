import { BadGatewayException } from '@nestjs/common';

export interface RecommendationProviderContext {
  customerId: string;
  hasBehavior: boolean;
}

export interface RecommendationProviderRequest {
  customerId: string;
  mode: 'DEFAULT' | 'PERSONALIZED';
}

export interface RecommendationCandidate {
  productId: string;
  score: number;
}

/**
 * This is the only place that maps NestJS data to the Python API request.
 * Update it when the Python team finalizes the request contract.
 */
export function buildRecommendationProviderRequest(
  context: RecommendationProviderContext,
): RecommendationProviderRequest {
  return {
    customerId: context.customerId,
    mode: context.hasBehavior ? 'PERSONALIZED' : 'DEFAULT',
  };
}

/**
 * The currently known response contract is an array of productId and score.
 * Keep provider-specific response changes isolated in this parser.
 */
export function parseRecommendationProviderResponse(
  data: unknown,
): RecommendationCandidate[] {
  if (!Array.isArray(data)) {
    throw new BadGatewayException(
      'Recommendation service returned an invalid response',
    );
  }

  return data.map((item) => {
    if (typeof item !== 'object' || item === null) {
      throw new BadGatewayException(
        'Recommendation service returned an invalid item',
      );
    }

    const candidate = item as Record<string, unknown>;
    const productId = normalizeProductId(candidate.productId);
    const score = candidate.score;

    if (productId === null || typeof score !== 'number' || !Number.isFinite(score)) {
      throw new BadGatewayException(
        'Recommendation service returned an invalid item',
      );
    }

    return { productId, score };
  });
}

function normalizeProductId(value: unknown): string | null {
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return value;
  }

  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }

  return null;
}
