import type { PublicProduct } from './product';

export interface RecommendedProductItem {
  product: PublicProduct;
  score: number;
  reason: string | null;
}

export interface RecommendationResponse {
  items: RecommendedProductItem[];
  coldStart: boolean;
  strategy: string;
  modelVersion: string | null;
}

export interface SimilarProductsResponse {
  items: RecommendedProductItem[];
  strategy: string;
  modelVersion: string | null;
}
