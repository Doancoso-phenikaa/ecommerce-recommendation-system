export type ReviewStatus = 'ACTIVE' | 'HIDDEN';

export interface Review {
  reviewId: string;
  productId: string;
  orderId: string;
  rating: number;
  comment: string | null;
  sellerReply: string | null;
  sellerRepliedAt: string | null;
  status: ReviewStatus;
  createdAt: string;
  updatedAt: string;
}

export type OrderItemReview = Pick<
  Review,
  'reviewId' | 'rating' | 'comment' | 'status' | 'createdAt' | 'updatedAt'
>;

export interface CreateReviewRequest {
  orderId: string;
  productId: string;
  rating: number;
  comment?: string;
}

export interface UpdateReviewRequest {
  rating?: number;
  comment?: string;
}

export interface PublicProductReview {
  reviewId: string;
  rating: number;
  comment: string | null;
  customerName: string;
  sellerReply: string | null;
  sellerRepliedAt: string | null;
  createdAt: string;
}

export interface ProductReviewSummary {
  averageRating: number;
  totalReviews: number;
}

export interface ProductReviewsResponse {
  summary: ProductReviewSummary;
  data: PublicProductReview[];
}

export interface SellerReviewItem {
  reviewId: string;
  productId: string;
  productName: string;
  productImageUrl: string | null;
  orderId: string;
  rating: number;
  comment: string | null;
  customerName: string;
  sellerReply: string | null;
  sellerRepliedAt: string | null;
  createdAt: string;
}

export interface SellerReplyReviewRequest {
  reply: string;
}

export interface SellerReviewResponse {
  summary: ProductReviewSummary;
  data: SellerReviewItem[];
}

export interface SellerReviewFilters {
  rating?: number;
  productId?: string;
}
