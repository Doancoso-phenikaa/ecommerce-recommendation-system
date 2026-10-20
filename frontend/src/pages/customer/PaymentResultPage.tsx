import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getRecommendations } from '../../api/recommendation.api';
import { useAuth } from '../../hooks/useAuth';
import type {
  PaymentMethod,
  PaymentResultState,
  PaymentStatus,
} from '../../types/payment';
import type { PublicProduct } from '../../types/product';
import { formatCurrency } from '../../utils/format-currency';
import { getProductDiscountPercentage } from '../../utils/product-price';
import './payment.css';
import './payment-result.css';

const methodLabels: Record<PaymentMethod, string> = {
  COD: 'Thanh toán khi nhận hàng (COD)',
  ONLINE: 'Thanh toán trực tuyến',
};

const statusLabels: Record<PaymentStatus, string> = {
  PENDING: 'Chờ thanh toán',
  PAID: 'Đã thanh toán',
  FAILED: 'Thanh toán thất bại',
};

function isPaymentResultState(value: unknown): value is PaymentResultState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<PaymentResultState>;
  const payment = state.payment;
  return Boolean(payment)
    && typeof payment?.paymentId === 'string'
    && typeof payment.orderGroupId === 'string'
    && (payment.paymentMethod === 'COD' || payment.paymentMethod === 'ONLINE')
    && (payment.status === 'PENDING' || payment.status === 'PAID' || payment.status === 'FAILED')
    && typeof payment.amount === 'string'
    && typeof payment.createdAt === 'string'
    && typeof state.orderCount === 'number';
}

function getResultCopy(state: PaymentResultState) {
  const { payment } = state;

  if (payment.status === 'FAILED') {
    return {
      title: 'Thanh toán chưa thành công',
      message: 'Đơn hàng đã được tạo nhưng thanh toán chưa hoàn tất. Bạn có thể theo dõi đơn hàng để kiểm tra trạng thái mới nhất.',
      tone: 'failed',
    } as const;
  }

  if (payment.paymentMethod === 'COD' && payment.status === 'PENDING') {
    return {
      title: 'Đặt hàng thành công!',
      message: 'Đơn hàng của bạn đã được tiếp nhận và người bán sẽ sớm chuẩn bị để giao hàng.',
      tone: 'pending',
    } as const;
  }

  return {
    title: 'Thanh toán thành công!',
    message: 'Đơn hàng của bạn đã được tiếp nhận và khoản thanh toán trực tuyến đã hoàn tất.',
    tone: 'paid',
  } as const;
}

function formatOrderTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

export function PaymentResultPage() {
  const location = useLocation();
  const { user } = useAuth();
  const state = isPaymentResultState(location.state) ? location.state : null;
  const [recommendations, setRecommendations] = useState<PublicProduct[]>([]);
  const [isRecommendationLoading, setIsRecommendationLoading] = useState(
    Boolean(state && state.payment.status !== 'FAILED'),
  );

  useEffect(() => {
    if (!state || state.payment.status === 'FAILED') {
      return;
    }

    let isCurrent = true;

    const loadRecommendations = async () => {
      try {
        const result = await getRecommendations(4);
        if (isCurrent) {
          setRecommendations(result.items.map(({ product }) => product));
        }
      } catch {
        if (isCurrent) setRecommendations([]);
      } finally {
        if (isCurrent) setIsRecommendationLoading(false);
      }
    };

    void loadRecommendations();
    return () => {
      isCurrent = false;
    };
  }, [state]);

  if (!state) {
    return (
      <main className="payment-page payment-page--centered">
        <section className="payment-safe-state">
          <span aria-hidden="true">?</span>
          <h1>Không có thông tin thanh toán</h1>
          <p>Trang này cần được mở sau khi bạn xác nhận phương thức thanh toán.</p>
          <Link to="/">Về trang chủ</Link>
        </section>
      </main>
    );
  }

  const copy = getResultCopy(state);
  const { payment } = state;
  const isSuccessful = copy.tone !== 'failed';

  return (
    <main className="order-result-page">
      <section className={`order-result-hero order-result-hero--${copy.tone}`} aria-labelledby="order-result-title">
        <span className="order-result-hero__mark" aria-hidden="true">
          {isSuccessful ? '✓' : '!'}
        </span>
        <h1 id="order-result-title">{copy.title}</h1>
        <p>
          {isSuccessful && user?.fullName ? <>Cảm ơn bạn <strong>{user.fullName}</strong> đã mua sắm tại MarketNest. </> : null}
          {copy.message}
        </p>

        <dl className="order-result-meta">
          <div>
            <span className="order-result-meta__icon" aria-hidden="true">#</span>
            <span><dt>Mã nhóm đơn hàng</dt><dd>MN-{payment.orderGroupId}</dd></span>
          </div>
          <div>
            <span className="order-result-meta__icon" aria-hidden="true">◷</span>
            <span><dt>Thời gian đặt</dt><dd>{formatOrderTime(payment.createdAt)}</dd></span>
          </div>
          <div>
            <span className="order-result-meta__icon" aria-hidden="true">₫</span>
            <span><dt>Phương thức thanh toán</dt><dd>{methodLabels[payment.paymentMethod]}</dd></span>
          </div>
        </dl>

        <div className="order-result-summary">
          <span>{state.orderCount} đơn hàng</span>
          <span aria-hidden="true">•</span>
          <strong>{formatCurrency(payment.amount)}</strong>
          <span aria-hidden="true">•</span>
          <em className={`payment-status payment-status--${payment.status.toLowerCase()}`}>{statusLabels[payment.status]}</em>
        </div>

        <div className="order-result-actions">
          <Link className="order-result-actions__primary" to={`/orders/${payment.orderGroupId}`}>
            <span aria-hidden="true">▣</span> Theo dõi đơn hàng
          </Link>
          <Link className="order-result-actions__secondary" to="/">
            Tiếp tục mua sắm <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      {isSuccessful && (
        <section className="order-result-recommendations" aria-labelledby="order-recommendation-title">
          <header>
            <div>
              <h2 id="order-recommendation-title">Gợi ý dành cho bạn</h2>
              <p>Khám phá thêm những sản phẩm phù hợp với nhu cầu của bạn.</p>
            </div>
            <Link to="/recommendations">Xem thêm sản phẩm <span aria-hidden="true">→</span></Link>
          </header>

          {isRecommendationLoading ? (
            <div className="order-result-products order-result-products--loading" aria-label="Đang tải sản phẩm gợi ý">
              {Array.from({ length: 4 }, (_, index) => <span key={index} />)}
            </div>
          ) : recommendations.length > 0 ? (
            <div className="order-result-products">
              {recommendations.map((product) => (
                <ResultProductCard key={product.productId} product={product} />
              ))}
            </div>
          ) : (
            <div className="order-result-recommendations__empty">
              <strong>Chưa có sản phẩm gợi ý phù hợp</strong>
              <p>Bạn vẫn có thể tiếp tục khám phá toàn bộ sản phẩm tại MarketNest.</p>
              <Link to="/">Khám phá sản phẩm</Link>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function ResultProductCard({ product }: { product: PublicProduct }) {
  const discountPercentage = getProductDiscountPercentage(product.price, product.originalPrice);

  return (
    <article className="order-result-product">
      <Link className="order-result-product__media" to={`/products/${product.productId}`} aria-label={`Xem ${product.name}`}>
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} loading="lazy" />
        ) : (
          <span>{product.name.charAt(0).toLocaleUpperCase('vi')}</span>
        )}
        {discountPercentage !== null && <small>-{discountPercentage}%</small>}
      </Link>
      <div className="order-result-product__body">
        <span>{product.shop?.name ?? `Gian hàng #${product.shopId}`}</span>
        <Link to={`/products/${product.productId}`}><h3>{product.name}</h3></Link>
        <div className="order-result-product__price">
          <strong>{formatCurrency(product.price)}</strong>
          {discountPercentage !== null && product.originalPrice && <del>{formatCurrency(product.originalPrice)}</del>}
        </div>
        <p>{product.inventory.availableQuantity > 0 ? `Còn ${product.inventory.availableQuantity} sản phẩm` : 'Tạm hết hàng'}</p>
        <Link className="order-result-product__action" to={`/products/${product.productId}`}>Xem sản phẩm <span aria-hidden="true">→</span></Link>
      </div>
    </article>
  );
}
