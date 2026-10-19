import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { getSellerReviews, replyToSellerReview } from '../../api/seller-review.api';
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

interface ReviewRatingCounts {
  1: number;
  2: number;
  3: number;
  4: number;
  5: number;
}

const emptySummary: ProductReviewSummary = {
  averageRating: 0,
  totalReviews: 0,
};

const emptyRatingCounts: ReviewRatingCounts = {
  1: 0,
  2: 0,
  3: 0,
  4: 0,
  5: 0,
};

export function SellerReviewPage() {
  const [reviews, setReviews] = useState<SellerReviewItem[]>([]);
  const [summary, setSummary] = useState<ProductReviewSummary>(emptySummary);
  const [ratingCounts, setRatingCounts] = useState<ReviewRatingCounts>(emptyRatingCounts);
  const [productOptions, setProductOptions] = useState<ReviewProductOption[]>([]);
  const [selectedRating, setSelectedRating] = useState(0);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [replyTarget, setReplyTarget] = useState<SellerReviewItem | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [replyError, setReplyError] = useState('');
  const [isReplySubmitting, setIsReplySubmitting] = useState(false);
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
        const nextRatingCounts: ReviewRatingCounts = { ...emptyRatingCounts };

        response.data.forEach((review) => {
          uniqueProducts.set(review.productId, {
            productId: review.productId,
            productName: review.productName,
          });
          nextRatingCounts[review.rating as keyof ReviewRatingCounts] += 1;
        });

        setRatingCounts(nextRatingCounts);
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
  const attentionCount = ratingCounts[1] + ratingCounts[2];

  const clearFilters = () => {
    setSelectedRating(0);
    setSelectedProductId('');
  };

  const openReplyModal = (review: SellerReviewItem) => {
    setReplyTarget(review);
    setReplyDraft(review.sellerReply ?? '');
    setReplyError('');
  };

  const closeReplyModal = () => {
    if (isReplySubmitting) return;
    setReplyTarget(null);
    setReplyDraft('');
    setReplyError('');
  };

  const handleReplySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!replyTarget || isReplySubmitting) return;

    const reply = replyDraft.trim();
    if (!reply) {
      setReplyError('Vui lòng nhập nội dung phản hồi.');
      return;
    }

    setIsReplySubmitting(true);
    setReplyError('');

    try {
      const updatedReview = await replyToSellerReview(replyTarget.reviewId, { reply });
      setReviews((currentReviews) => currentReviews.map((review) =>
        review.reviewId === replyTarget.reviewId
          ? {
              ...review,
              sellerReply: updatedReview.sellerReply,
              sellerRepliedAt: updatedReview.sellerRepliedAt,
            }
          : review,
      ));
      setReplyTarget(null);
      setReplyDraft('');
    } catch (error: unknown) {
      setReplyError(getApiErrorMessage(error, 'Không thể lưu phản hồi.'));
    } finally {
      setIsReplySubmitting(false);
    }
  };

  return (
    <main className="seller-review-page">
      <header className="seller-review-heading">
        <span>KÊNH NGƯỜI BÁN</span>
        <h1>Đánh giá sản phẩm</h1>
        <p>Theo dõi phản hồi của khách hàng về sản phẩm trong gian hàng.</p>
      </header>

      {isLoading && summary.totalReviews === 0 && !hasFilters ? (
        <SellerReviewSkeleton />
      ) : (
        <>
          <section className="seller-review-summary" aria-label="Tổng quan đánh giá">
            <ReviewSummaryCard
              label="Điểm đánh giá gian hàng"
              value={summary.averageRating.toFixed(1)}
              suffix="/5"
              helper="Trung bình từ đánh giá hiện có"
              tone="red"
              icon="star"
            />
            <ReviewSummaryCard
              label="Tổng đánh giá"
              value={summary.totalReviews.toLocaleString('vi-VN')}
              helper="Đánh giá đang hoạt động"
              tone="neutral"
              icon="reviews"
            />
            <ReviewSummaryCard
              label="Đánh giá 5 sao"
              value={ratingCounts[5].toLocaleString('vi-VN')}
              helper="Phản hồi ở mức cao nhất"
              tone="green"
              icon="positive"
            />
            <ReviewSummaryCard
              label="Đánh giá cần chú ý"
              value={attentionCount.toLocaleString('vi-VN')}
              helper="Đánh giá từ 1 đến 2 sao"
              tone="amber"
              icon="attention"
            />
          </section>

          <nav className="seller-review-tabs" aria-label="Lọc đánh giá theo số sao">
            {ratingFilters.map((rating) => (
              <button
                type="button"
                className={selectedRating === rating ? 'is-active' : ''}
                onClick={() => setSelectedRating(rating)}
                key={rating}
              >
                {rating === 0 ? 'Tất cả' : `${rating} sao`}
                {rating > 0 && <span>{ratingCounts[rating as keyof ReviewRatingCounts]}</span>}
              </button>
            ))}
          </nav>

          <section className="seller-review-panel" aria-label="Danh sách đánh giá">
            <div className="seller-review-toolbar">
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
              <p>{isLoading ? 'Đang cập nhật danh sách...' : `${reviews.length} đánh giá phù hợp`}</p>
              {hasFilters && <button type="button" onClick={clearFilters}>Đặt lại bộ lọc</button>}
            </div>

            {errorMessage && (
              <div className="seller-review-error" role="alert">
                <div><strong>Không thể tải đánh giá</strong><p>{errorMessage}</p></div>
                <button type="button" onClick={() => void loadReviews()}>Thử lại</button>
              </div>
            )}

            {isLoading ? (
              <SellerReviewRowsSkeleton />
            ) : reviews.length === 0 && !errorMessage ? (
              <section className="seller-review-empty">
                <span aria-hidden="true"><ReviewEmptyIcon /></span>
                <h2>{hasFilters ? 'Không có đánh giá phù hợp với bộ lọc.' : 'Chưa có đánh giá nào.'}</h2>
                <p>{hasFilters
                  ? 'Hãy thử chọn mức sao hoặc sản phẩm khác.'
                  : 'Đánh giá từ khách hàng sẽ xuất hiện tại đây sau khi đơn hàng hoàn thành.'}</p>
                {hasFilters && <button type="button" onClick={clearFilters}>Xóa bộ lọc</button>}
              </section>
            ) : (
              <div className="seller-review-table-wrap">
                <div className="seller-review-table-head" aria-hidden="true">
                  <span>Sản phẩm</span>
                  <span>Khách hàng</span>
                  <span>Đánh giá</span>
                  <span>Nội dung & phản hồi</span>
                  <span>Đơn hàng / Ngày</span>
                </div>
                <section className="seller-review-list">
                  {reviews.map((review) => (
                    <SellerReviewRow
                      review={review}
                      onReply={openReplyModal}
                      key={review.reviewId}
                    />
                  ))}
                </section>
              </div>
            )}
          </section>
        </>
      )}

      {replyTarget && (
        <div
          className="seller-review-reply-modal"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeReplyModal();
          }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="seller-reply-title">
            <header>
              <div>
                <span>Đánh giá của {replyTarget.customerName}</span>
                <h2 id="seller-reply-title">
                  {replyTarget.sellerReply ? 'Chỉnh sửa phản hồi' : 'Phản hồi khách hàng'}
                </h2>
              </div>
              <button type="button" onClick={closeReplyModal} disabled={isReplySubmitting} aria-label="Đóng">×</button>
            </header>
            <div className="seller-review-reply-modal__context">
              <strong>{replyTarget.productName}</strong>
              <p>{replyTarget.comment || 'Khách hàng không để lại nhận xét.'}</p>
            </div>
            <form onSubmit={(event) => void handleReplySubmit(event)}>
              <label htmlFor="seller-review-reply">
                <span>Phản hồi của cửa hàng</span>
                <textarea
                  id="seller-review-reply"
                  value={replyDraft}
                  onChange={(event) => setReplyDraft(event.target.value)}
                  maxLength={1000}
                  rows={5}
                  autoFocus
                  disabled={isReplySubmitting}
                  placeholder="Cảm ơn bạn đã tin tưởng và ủng hộ gian hàng..."
                />
              </label>
              <div className="seller-review-reply-modal__counter">{replyDraft.length}/1000</div>
              {replyError && <p role="alert">{replyError}</p>}
              <footer>
                <button type="button" onClick={closeReplyModal} disabled={isReplySubmitting}>Hủy</button>
                <button type="submit" disabled={isReplySubmitting || !replyDraft.trim()}>
                  {isReplySubmitting ? 'Đang gửi...' : 'Gửi phản hồi'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

function ReviewSummaryCard({ label, value, suffix, helper, tone, icon }: {
  label: string;
  value: string;
  suffix?: string;
  helper: string;
  tone: 'red' | 'neutral' | 'green' | 'amber';
  icon: 'star' | 'reviews' | 'positive' | 'attention';
}) {
  return (
    <article className={`seller-review-summary-card is-${tone}`}>
      <div><span>{label}</span><i aria-hidden="true"><ReviewSummaryIcon type={icon} /></i></div>
      <strong>{value}{suffix && <small>{suffix}</small>}</strong>
      <p>{helper}</p>
    </article>
  );
}

function SellerReviewRow({
  review,
  onReply,
}: {
  review: SellerReviewItem;
  onReply: (review: SellerReviewItem) => void;
}) {
  return (
    <article className="seller-review-row">
      <div className="seller-review-product" data-label="Sản phẩm">
        <span className="seller-review-product__image">
          {review.productImageUrl ? (
            <img src={review.productImageUrl} alt={review.productName} loading="lazy" />
          ) : (
            <span aria-hidden="true">{review.productName.charAt(0)}</span>
          )}
        </span>
        <div><strong>{review.productName}</strong><small>ID: #{review.productId}</small></div>
      </div>
      <div className="seller-review-customer" data-label="Khách hàng">
        <strong>{review.customerName}</strong>
        <small>Khách đã mua hàng</small>
      </div>
      <div className="seller-review-rating" data-label="Đánh giá">
        <span aria-label={`${review.rating} sao`}>
          {'★'.repeat(review.rating)}<i>{'★'.repeat(5 - review.rating)}</i>
        </span>
        <strong>{review.rating}.0 / 5</strong>
      </div>
      <div className="seller-review-feedback" data-label="Nội dung & phản hồi">
        <p className="seller-review-comment">
          {review.comment || 'Khách hàng không để lại nhận xét.'}
        </p>
        {review.sellerReply && (
          <div className="seller-review-shop-reply">
            <strong>Phản hồi của cửa hàng</strong>
            <p>{review.sellerReply}</p>
            {review.sellerRepliedAt && (
              <time dateTime={review.sellerRepliedAt}>{formatOrderDate(review.sellerRepliedAt)}</time>
            )}
          </div>
        )}
        <button type="button" onClick={() => onReply(review)}>
          {review.sellerReply ? 'Chỉnh sửa phản hồi' : 'Phản hồi'}
        </button>
      </div>
      <div className="seller-review-meta" data-label="Đơn hàng / Ngày">
        <strong>Đơn hàng #{review.orderId}</strong>
        <time dateTime={review.createdAt}>{formatOrderDate(review.createdAt)}</time>
      </div>
    </article>
  );
}

function SellerReviewSkeleton() {
  return (
    <div className="seller-review-page-skeleton" aria-label="Đang tải đánh giá" aria-busy="true">
      <section>{Array.from({ length: 4 }, (_, index) => <span key={index} />)}</section>
      <div>{Array.from({ length: 5 }, (_, index) => <i key={index} />)}</div>
    </div>
  );
}

function SellerReviewRowsSkeleton() {
  return (
    <section className="seller-review-loading" aria-label="Đang tải danh sách đánh giá" aria-busy="true">
      {Array.from({ length: 5 }, (_, index) => <span key={index} />)}
    </section>
  );
}

function ReviewSummaryIcon({ type }: { type: 'star' | 'reviews' | 'positive' | 'attention' }) {
  if (type === 'reviews') return <svg viewBox="0 0 24 24"><path d="M5 5h14v10H9l-4 4V5Z" /><path d="M8 9h8M8 12h5" /></svg>;
  if (type === 'positive') return <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></svg>;
  if (type === 'attention') return <svg viewBox="0 0 24 24"><path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 9v4M12 17h.01" /></svg>;
  return <svg viewBox="0 0 24 24"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" /></svg>;
}

function ReviewEmptyIcon() {
  return <svg viewBox="0 0 24 24"><path d="M5 5h14v10H9l-4 4V5Z" /><path d="m12 8 .8 1.7 1.9.3-1.4 1.3.3 1.9-1.6-.9-1.6.9.3-1.9L9.3 10l1.9-.3L12 8Z" /></svg>;
}
