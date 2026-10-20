import type { ProductService } from '../../product/product.service.js';

export interface RecommendedProduct {
  product: ReturnType<ProductService['mapPublicProduct']>;
  score: number;
  reason: string | null;
}

export interface PersonalizedRecommendationsResponse {
  items: RecommendedProduct[];
  coldStart: boolean;
  strategy: string;
  modelVersion: string | null;
}

export interface SimilarRecommendationsResponse {
  items: RecommendedProduct[];
  strategy: string;
  modelVersion: string | null;
}
