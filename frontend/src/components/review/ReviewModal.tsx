import { useEffect, useState, type FormEvent } from 'react';
import type { OrderItemReview } from '../../types/review';
import './review-modal.css';

interface ReviewModalProduct {
  productName: string;
  imageUrl: string | null;
}

interface ReviewFormValue {
  rating: number;
  comment: string;
}

interface ReviewModalProps {
  product: ReviewModalProduct;
  orderId: string;
  review: OrderItemReview | null;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (value: ReviewFormValue) => void;
}

export function ReviewModal({
  product,
  orderId,
  review,
  isSubmitting,
  onClose,
  onSubmit,
}: ReviewModalProps) {
  const [rating, setRating] = useState(review?.rating ?? 5);
  const [comment, setComment] = useState(review?.comment ?? '');
  const isEditing = review !== null;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSubmitting, onClose]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting || rating < 1 || rating > 5) return;
    onSubmit({ rating, comment: comment.trim() });
  };

  return (
    <div
      className="review-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) onClose();
      }}
    >
      <section
        className="review-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-modal-title"
      >
        <header>
          <div className="review-modal__product-image">
            {product.imageUrl ? (
              <img src={product.imageUrl} alt={product.productName} />
            ) : (
              <span aria-hidden="true">{product.productName.charAt(0)}</span>
            )}
          </div>
          <div>
            <span>Đơn hàng #{orderId}</span>
            <h2 id="review-modal-title">
              {isEditing ? 'Chỉnh sửa đánh giá' : 'Đánh giá sản phẩm'}
            </h2>
            <p>{product.productName}</p>
          </div>
        </header>

        <form onSubmit={handleSubmit}>
          <fieldset disabled={isSubmitting}>
            <legend>Mức độ hài lòng</legend>
            <div className="review-star-selector" role="radiogroup" aria-label="Chọn số sao">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={rating === value}
                  aria-label={`${value} sao`}
                  className={value <= rating ? 'is-selected' : ''}
                  onClick={() => setRating(value)}
                >
                  ★
                </button>
              ))}
            </div>
            <output>{rating}/5 sao</output>
          </fieldset>

          <label htmlFor="review-comment">
            Nhận xét <span>(không bắt buộc)</span>
          </label>
          <textarea
            id="review-comment"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Chia sẻ trải nghiệm của bạn về sản phẩm..."
            rows={5}
            disabled={isSubmitting}
          />

          <div className="review-modal__actions">
            <button type="button" onClick={onClose} disabled={isSubmitting}>
              Hủy
            </button>
            <button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? isEditing ? 'Đang cập nhật...' : 'Đang gửi...'
                : isEditing ? 'Cập nhật đánh giá' : 'Gửi đánh giá'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
