import type { PublicProduct } from './product';

export interface RecommendationApiItem {
  product: {
    productId: string;
  };
  score: number;
}

export interface RecommendedProduct {
  product: PublicProduct;
  score: number;
}
