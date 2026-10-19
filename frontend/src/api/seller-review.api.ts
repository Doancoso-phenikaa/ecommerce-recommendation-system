import type {
  Review,
  SellerReplyReviewRequest,
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

export async function replyToSellerReview(
  reviewId: string,
  data: SellerReplyReviewRequest,
): Promise<Review> {
  const response = await api.patch<Review>(
    `/seller/reviews/${reviewId}/reply`,
    data,
  );
  return response.data;
}
