import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSellerReviews } from '../../api/seller-review.api';
import type {
  ProductReviewSummary,
  SellerReviewItem,
} from '../../types/review';
import { getApiErrorMessage } from '../../utils/auth';
import { formatOrderDate } from '../../utils/order';
import './seller-review.css';

const ratingFilters = [0, 5, 4, 3, 2, 1] as const;

interface ReviewProductOption {
  productId: string;
  productName: string;
}

const emptySummary: ProductReviewSummary = {
  averageRating: 0,
  totalReviews: 0,
};

export function SellerReviewPage() {
  const [reviews, setReviews] = useState<SellerReviewItem[]>([]);
  const [summary, setSummary] = useState<ProductReviewSummary>(emptySummary);
  const [productOptions, setProductOptions] = useState<ReviewProductOption[]>([]);
  const [selectedRating, setSelectedRating] = useState(0);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const requestIdRef = useRef(0);

  const filters = useMemo(() => ({
    rating: selectedRating || undefined,
    productId: selectedProductId || undefined,
  }), [selectedProductId, selectedRating]);

  const loadReviews = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setErrorMessage('');

    try {
      const response = await getSellerReviews(filters);
      if (requestId !== requestIdRef.current) return;

      setReviews(response.data);
      setSummary(response.summary);

      if (!filters.rating && !filters.productId) {
        const uniqueProducts = new Map<string, ReviewProductOption>();
        response.data.forEach((review) => {
          uniqueProducts.set(review.productId, {
            productId: review.productId,
            productName: review.productName,
          });
        });
        setProductOptions(
          [...uniqueProducts.values()].sort((left, right) =>
            left.productName.localeCompare(right.productName, 'vi'),
          ),
        );
      }
    } catch (error: unknown) {
      if (requestId !== requestIdRef.current) return;
      setErrorMessage(getApiErrorMessage(error, 'Không thể tải đánh giá.'));
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadReviews(), 0);
    return () => {
      window.clearTimeout(timer);
      requestIdRef.current += 1;
    };
  }, [loadReviews]);

  const hasFilters = selectedRating !== 0 || selectedProductId !== '';

  return (
    <main className="seller-review-page">
      <header className="seller-review-heading">
        <div>
          <span>Phản hồi khách hàng</span>
          <h1>Đánh giá sản phẩm</h1>
          <p>Theo dõi phản hồi của khách hàng về các sản phẩm trong gian hàng.</p>
        </div>
      </header>

      <section className="seller-review-summary" aria-label="Đánh giá gian hàng">
        <div>
          <span>Đánh giá gian hàng</span>
          <strong>{summary.averageRating.toFixed(1)} <small>★</small></strong>
          <p>{summary.totalReviews} đánh giá</p>
        </div>
        <div className="seller-review-summary__stars" aria-label={`${summary.averageRating.toFixed(1)} sao`}>
          {'★'.repeat(Math.round(summary.averageRating))}
          <span>{'★'.repeat(5 - Math.round(summary.averageRating))}</span>
        </div>
        {summary.totalReviews === 0 && <p>Chưa có đánh giá cho gian hàng.</p>}
      </section>

      <section className="seller-review-filters" aria-label="Bộ lọc đánh giá">
        <div className="seller-review-rating-filter">
          {ratingFilters.map((rating) => (
            <button
              type="button"
              className={selectedRating === rating ? 'is-active' : ''}
              onClick={() => setSelectedRating(rating)}
              key={rating}
            >
              {rating === 0 ? 'Tất cả' : `${rating} sao`}
            </button>
          ))}
        </div>
        <label>
          <span>Sản phẩm</span>
          <select
            value={selectedProductId}
            onChange={(event) => setSelectedProductId(event.target.value)}
          >
            <option value="">Tất cả sản phẩm</option>
            {productOptions.map((product) => (
              <option value={product.productId} key={product.productId}>
                {product.productName}
              </option>
            ))}
          </select>
        </label>
      </section>

      {errorMessage && (
        <div className="seller-review-error" role="alert">
          <div><strong>Không thể tải đánh giá</strong><p>{errorMessage}</p></div>
          <button type="button" onClick={() => void loadReviews()}>Thử lại</button>
        </div>
      )}

      {isLoading ? (
        <SellerReviewSkeleton />
      ) : reviews.length === 0 && !errorMessage ? (
        <section className="seller-review-empty">
          <span aria-hidden="true">★</span>
          <h2>{hasFilters ? 'Không có đánh giá phù hợp với bộ lọc.' : 'Chưa có đánh giá nào'}</h2>
          <p>{hasFilters
            ? 'Hãy thử chọn mức sao hoặc sản phẩm khác.'
            : 'Đánh giá từ khách hàng sẽ xuất hiện tại đây sau khi đơn hàng hoàn thành.'}</p>
          {hasFilters && (
            <button type="button" onClick={() => {
              setSelectedRating(0);
              setSelectedProductId('');
            }}>Xóa bộ lọc</button>
          )}
        </section>
      ) : (
        <section className="seller-review-list" aria-label="Danh sách đánh giá">
          {reviews.map((review) => <SellerReviewCard review={review} key={review.reviewId} />)}
        </section>
      )}
    </main>
  );
}

function SellerReviewCard({ review }: { review: SellerReviewItem }) {
  return (
    <article className="seller-review-card">
      <div className="seller-review-card__image">
        {review.productImageUrl ? (
          <img src={review.productImageUrl} alt={review.productName} loading="lazy" />
        ) : (
          <span aria-hidden="true">{review.productName.charAt(0)}</span>
        )}
      </div>
      <div className="seller-review-card__content">
        <header>
          <div><strong>{review.productName}</strong><small>Đơn hàng #{review.orderId}</small></div>
          <time dateTime={review.createdAt}>{formatOrderDate(review.createdAt)}</time>
        </header>
        <div className="seller-review-card__rating">
          <span aria-label={`${review.rating} sao`}>
            {'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}
          </span>
          <strong>{review.customerName}</strong>
        </div>
        <p>{review.comment || 'Khách hàng không để lại nhận xét.'}</p>
      </div>
    </article>
  );
}

function SellerReviewSkeleton() {
  return (
    <section className="seller-review-loading" aria-label="Đang tải đánh giá" aria-busy="true">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} aria-hidden="true"><span /><i /><i /></div>
      ))}
    </section>
  );
}
