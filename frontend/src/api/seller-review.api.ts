import type {
  SellerReviewFilters,
  SellerReviewResponse,
} from '../types/review';
import { api } from './axios';

export async function getSellerReviews(
  filters: SellerReviewFilters = {},
): Promise<SellerReviewResponse> {
  const response = await api.get<SellerReviewResponse>('/seller/reviews', {
    params: filters,
  });
  return response.data;
}
