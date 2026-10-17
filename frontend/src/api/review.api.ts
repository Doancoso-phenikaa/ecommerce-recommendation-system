import type {
  CreateReviewRequest,
  ProductReviewsResponse,
  Review,
  UpdateReviewRequest,
} from '../types/review';
import { api } from './axios';

export async function createReview(data: CreateReviewRequest): Promise<Review> {
  const response = await api.post<Review>('/reviews', data);
  return response.data;
}

export async function updateReview(
  reviewId: string,
  data: UpdateReviewRequest,
): Promise<Review> {
  const response = await api.patch<Review>(`/reviews/${reviewId}`, data);
  return response.data;
}

export async function getProductReviews(
  productId: string,
): Promise<ProductReviewsResponse> {
  const response = await api.get<ProductReviewsResponse>(
    `/products/${productId}/reviews`,
  );
  return response.data;
}
