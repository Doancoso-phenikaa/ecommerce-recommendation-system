import type {
  RecommendationResponse,
  SimilarProductsResponse,
} from '../types/recommendation';
import { api } from './axios';

export async function getRecommendations(
  limit = 10,
  signal?: AbortSignal,
): Promise<RecommendationResponse> {
  const response = await api.get<RecommendationResponse>('/recommendations', {
    params: { limit },
    signal,
  });

  return response.data;
}

export async function getSimilarProducts(
  productId: string,
  limit = 10,
  signal?: AbortSignal,
): Promise<SimilarProductsResponse> {
  const response = await api.get<SimilarProductsResponse>(
    `/recommendations/similar/${productId}`,
    {
      params: { limit },
      signal,
    },
  );

  return response.data;
}
