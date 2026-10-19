import type {
  RecommendationApiItem,
  RecommendedProduct,
} from '../types/recommendation';
import { api } from './axios';
import { getProductDetail } from './product.api';

export async function getRecommendations(): Promise<RecommendedProduct[]> {
  const response = await api.get<RecommendationApiItem[]>('/recommendations');
  const uniqueRecommendations = response.data.filter(
    (item, index, items) =>
      items.findIndex(
        (candidate) => candidate.product.productId === item.product.productId,
      ) === index,
  );
  const productResults = await Promise.allSettled(
    uniqueRecommendations.map((item) =>
      getProductDetail(item.product.productId),
    ),
  );

  return productResults.flatMap((result, index) =>
    result.status === 'fulfilled'
      ? [{ product: result.value, score: uniqueRecommendations[index].score }]
      : [],
  );
}
