import type { Product } from '../../product/entities/product.entity.js';

export interface RecommendedProduct {
  product: Product;
  score: number;
}
