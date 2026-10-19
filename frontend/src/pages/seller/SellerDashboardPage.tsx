import axios from 'axios';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { getSellerReviews } from '../../api/seller-review.api';
import { getSellerStatistics } from '../../api/seller-statistics.api';
import { getMyShop } from '../../api/shop.api';
import type { ProductReviewSummary } from '../../types/review';
import type { Shop, ShopStatus } from '../../types/shop';
import type {
  SellerRevenuePoint,
  SellerStatisticsRange,
  SellerStatisticsResponse,
} from '../../types/statistics';
import { getApiErrorMessage } from '../../utils/auth';
import './seller-overview.css';

const emptyReviewSummary: ProductReviewSummary = {
  averageRating: 0,
  totalReviews: 0,
};

const statusLabels: Record<ShopStatus, string> = {
  PENDING: 'Chờ duyệt',
  ACTIVE: 'Đang hoạt động',
  REJECTED: 'Bị từ chối',
  SUSPENDED: 'Đã đình chỉ',
};

const statusNotices: Record<Exclude<ShopStatus, 'ACTIVE'>, string> = {
  PENDING: 'Gian hàng đang chờ Admin xét duyệt. Dữ liệu lịch sử vẫn được giữ nguyên.',
  REJECTED: 'Gian hàng cần được cập nhật theo phản hồi của Admin trước khi gửi duyệt lại.',
  SUSPENDED: 'Gian hàng đang bị đình chỉ. Bạn vẫn có thể theo dõi đơn hàng và dữ liệu trước đó.',
};

interface NestErrorResponse {
  message?: string | string[];
}

function isShopNotFoundError(error: unknown): boolean {
  if (!axios.isAxiosError<NestErrorResponse>(error) || error.response?.status !== 404) {
    return false;
  }

  const message = error.response.data?.message;
  return message === 'Shop not found' ||
    (Array.isArray(message) && message.includes('Shop not found'));
}

function formatCurrency(value: string): string {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return '0 ₫';
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(numericValue);
}

function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' }).format(date);
}

export function SellerDashboardPage() {
  const [shop, setShop] = useState<Shop | null>(null);
  const [statistics, setStatistics] = useState<SellerStatisticsResponse | null>(null);
  const [reviewSummary, setReviewSummary] = useState<ProductReviewSummary>(emptyReviewSummary);
  const [range, setRange] = useState<SellerStatisticsRange>('7d');
  const rangeRef = useRef<SellerStatisticsRange>('7d');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRangeLoading, setIsRangeLoading] = useState(false);
  const [pageError, setPageError] = useState('');
  const [secondaryError, setSecondaryError] = useState('');

  const loadDashboard = useCallback(async (showSkeleton: boolean) => {
    if (showSkeleton) setIsLoading(true);
    else setIsRefreshing(true);
    setPageError('');

    try {
      const currentShop = await getMyShop();
      setShop(currentShop);

      const [statisticsResult, reviewsResult] = await Promise.allSettled([
        getSellerStatistics(rangeRef.current),
        getSellerReviews(),
      ]);

      const failedWidgets: string[] = [];
      if (statisticsResult.status === 'fulfilled') {
        setStatistics(statisticsResult.value);
      } else {
        failedWidgets.push('thống kê');
      }

      if (reviewsResult.status === 'fulfilled') {
        setReviewSummary(reviewsResult.value.summary);
      } else {
        failedWidgets.push('đánh giá');
      }

      setSecondaryError(
        failedWidgets.length > 0
          ? `Chưa thể cập nhật dữ liệu ${failedWidgets.join(' và ')}. Các phần còn lại vẫn hoạt động bình thường.`
          : '',
      );
    } catch (error: unknown) {
      if (isShopNotFoundError(error)) {
        setShop(null);
        setStatistics(null);
        setReviewSummary(emptyReviewSummary);
        setSecondaryError('');
      } else {
        setPageError(getApiErrorMessage(error, 'Không thể tải tổng quan gian hàng.'));
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let isCurrent = true;
    queueMicrotask(() => {
      if (isCurrent) void loadDashboard(true);
    });

    const handleFocus = () => {
      if (isCurrent) void loadDashboard(false);
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      isCurrent = false;
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadDashboard]);

  const handleRangeChange = async (nextRange: SellerStatisticsRange) => {
    if (nextRange === range || isRangeLoading || !shop) return;
    setRange(nextRange);
    rangeRef.current = nextRange;
    setIsRangeLoading(true);
    setSecondaryError('');

    try {
      setStatistics(await getSellerStatistics(nextRange));
    } catch (error: unknown) {
      setSecondaryError(getApiErrorMessage(error, 'Không thể cập nhật thống kê theo khoảng thời gian này.'));
    } finally {
      setIsRangeLoading(false);
    }
  };

  if (isLoading) {
    return <SellerDashboardSkeleton />;
  }

  if (pageError && !shop) {
    return (
      <main className="seller-overview-page">
        <section className="seller-overview-error" role="alert">
          <span aria-hidden="true"><OverviewIcon name="notice" /></span>
          <h1>Không thể tải tổng quan</h1>
          <p>{pageError}</p>
          <button type="button" onClick={() => void loadDashboard(true)}>Thử lại</button>
        </section>
      </main>
    );
  }

  if (!shop) {
    return (
      <main className="seller-overview-page">
        <section className="seller-overview-empty">
          <span aria-hidden="true"><OverviewIcon name="store" /></span>
          <small>Trung tâm người bán</small>
          <h1>Bạn chưa có gian hàng</h1>
          <p>Tạo gian hàng và gửi Admin xét duyệt trước khi bắt đầu quản lý sản phẩm, đơn hàng và doanh thu.</p>
          <Link to="/seller/shop">Tạo gian hàng <b aria-hidden="true">→</b></Link>
        </section>
      </main>
    );
  }

  return (
    <main className="seller-overview-page">
      <section className="seller-overview-shop" aria-label="Thông tin gian hàng">
        <div className="seller-overview-shop__identity">
          <ShopLogo key={`${shop.logoUrl}-${shop.name}`} shop={shop} />
          <div>
            <div className="seller-overview-shop__name">
              <h1>{shop.name}</h1>
              <span className={`seller-overview-status seller-overview-status--${shop.status.toLowerCase()}`}>
                <i aria-hidden="true" />{statusLabels[shop.status]}
              </span>
            </div>
            <p>Gian hàng #{shop.shopId}</p>
          </div>
        </div>

        <div className="seller-overview-shop__actions">
          <div className="seller-overview-range" aria-label="Khoảng thời gian thống kê">
            <button
              type="button"
              className={range === '7d' ? 'is-active' : ''}
              disabled={isRangeLoading}
              onClick={() => void handleRangeChange('7d')}
            >7 ngày</button>
            <button
              type="button"
              className={range === '30d' ? 'is-active' : ''}
              disabled={isRangeLoading}
              onClick={() => void handleRangeChange('30d')}
            >30 ngày</button>
          </div>
          <Link to="/seller/shop"><OverviewIcon name="settings" /> Quản lý gian hàng</Link>
        </div>
      </section>

      {shop.status !== 'ACTIVE' && (
        <aside className={`seller-overview-notice seller-overview-notice--${shop.status.toLowerCase()}`}>
          <OverviewIcon name="notice" />
          <div><strong>{statusLabels[shop.status]}</strong><p>{statusNotices[shop.status]}</p></div>
          <Link to="/seller/shop">Xem gian hàng</Link>
        </aside>
      )}

      {secondaryError && <p className="seller-overview-widget-error" role="status">{secondaryError}</p>}
      {isRefreshing && <span className="seller-overview-refreshing" role="status">Đang cập nhật dữ liệu...</span>}

      <section className="seller-overview-metrics" aria-label="Chỉ số tổng quan">
        <MetricCard icon="revenue" label="Doanh thu" value={formatCurrency(statistics?.overview.totalRevenue ?? '0')} note="Từ đơn đã hoàn thành" />
        <MetricCard icon="order" label="Đơn hàng" value={String(statistics?.overview.totalOrders ?? 0)} note="Tất cả trạng thái" />
        <MetricCard icon="completed" label="Đơn hoàn thành" value={String(statistics?.overview.completedOrders ?? 0)} note="Đã ghi nhận doanh thu" />
        <MetricCard icon="rating" label="Đánh giá gian hàng" value={reviewSummary.averageRating.toFixed(1)} note={`${reviewSummary.totalReviews} đánh giá`} suffix="/5" />
      </section>

      <section className="seller-overview-attention" aria-labelledby="attention-title">
        <header>
          <h2 id="attention-title">Cần xử lý ngay</h2>
          <Link to="/seller/orders">Xem chi tiết <span aria-hidden="true">›</span></Link>
        </header>
        <div>
          <AttentionItem label="Chờ xác nhận" value={statistics?.orderStatusCounts.pending ?? 0} tone="red" />
          <AttentionItem label="Đã xác nhận" value={statistics?.orderStatusCounts.confirmed ?? 0} tone="amber" />
          <AttentionItem label="Đang giao" value={statistics?.orderStatusCounts.shipping ?? 0} tone="blue" />
          <AttentionItem label="Đã hủy" value={statistics?.orderStatusCounts.cancelled ?? 0} tone="muted" />
        </div>
      </section>

      <div className="seller-overview-insights">
        <section className="seller-overview-panel seller-overview-panel--chart">
          <header>
            <div><h2>Xu hướng doanh thu</h2><p>{range === '7d' ? '7 ngày gần nhất' : '30 ngày gần nhất'}</p></div>
            <span>{formatCurrency(statistics?.overview.totalRevenue ?? '0')}</span>
          </header>
          <RevenueChart data={statistics?.revenueByDay ?? []} />
        </section>

        <section className="seller-overview-panel seller-overview-panel--rating">
          <header><div><h2>Đánh giá gian hàng</h2><p>Phản hồi từ khách hàng</p></div><Link to="/seller/reviews">Xem tất cả</Link></header>
          <div className="seller-overview-rating">
            <strong>{reviewSummary.averageRating.toFixed(1)}</strong>
            <span aria-label={`${reviewSummary.averageRating.toFixed(1)} trên 5 sao`}>
              {'★'.repeat(Math.round(reviewSummary.averageRating))}<i>{'★'.repeat(5 - Math.round(reviewSummary.averageRating))}</i>
            </span>
            <p>{reviewSummary.totalReviews > 0 ? `${reviewSummary.totalReviews} đánh giá đang hiển thị` : 'Chưa có đánh giá cho gian hàng.'}</p>
          </div>
          <Link className="seller-overview-panel__footer" to="/seller/reviews">Quản lý đánh giá <span aria-hidden="true">→</span></Link>
        </section>
      </div>

      <section className="seller-overview-panel seller-overview-panel--products">
        <header>
          <div><h2>Sản phẩm bán chạy</h2><p>Xếp hạng theo số lượng đã bán từ đơn hoàn thành</p></div>
          <Link to="/seller/products">Xem sản phẩm <span aria-hidden="true">→</span></Link>
        </header>
        {!statistics?.topProducts.length ? (
          <div className="seller-overview-products-empty"><OverviewIcon name="product" /><p>Chưa có dữ liệu bán hàng.</p></div>
        ) : (
          <div className="seller-overview-products">
            {statistics.topProducts.map((product, index) => (
              <article key={product.productId}>
                <strong className="seller-overview-products__rank">{String(index + 1).padStart(2, '0')}</strong>
                <ProductImage imageUrl={product.imageUrl} name={product.productName} />
                <div><h3>{product.productName}</h3><p>Đã bán {product.quantitySold.toLocaleString('vi-VN')} sản phẩm</p></div>
                <strong className="seller-overview-products__revenue">{formatCurrency(product.revenue)}</strong>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function ShopLogo({ shop }: { shop: Shop }) {
  const [hasError, setHasError] = useState(false);
  return (
    <span className="seller-overview-shop__logo">
      {shop.logoUrl && !hasError
        ? <img src={shop.logoUrl} alt={`Logo ${shop.name}`} onError={() => setHasError(true)} />
        : <b aria-hidden="true">{shop.name.charAt(0).toLocaleUpperCase('vi')}</b>}
    </span>
  );
}

function MetricCard({ icon, label, value, note, suffix }: { icon: OverviewIconName; label: string; value: string; note: string; suffix?: string }) {
  return (
    <article className="seller-overview-metric">
      <div><span>{label}</span><i aria-hidden="true"><OverviewIcon name={icon} /></i></div>
      <strong>{value}{suffix && <small>{suffix}</small>}</strong>
      <p>{note}</p>
    </article>
  );
}

function AttentionItem({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <article className={`seller-overview-attention__item is-${tone}`}><span>{label}</span><strong>{String(value).padStart(2, '0')}</strong></article>;
}

function RevenueChart({ data }: { data: SellerRevenuePoint[] }) {
  if (data.length === 0) {
    return <div className="seller-overview-chart-empty"><OverviewIcon name="trend" /><p>Chưa có doanh thu trong khoảng thời gian này.</p></div>;
  }

  const values = data.map((point) => Number(point.revenue) || 0);
  const maxValue = Math.max(...values, 1);
  const points = values.map((value, index) => {
    const x = data.length === 1 ? 360 : (index / (data.length - 1)) * 720;
    const y = 155 - (value / maxValue) * 125;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
  const areaPoints = `0,180 ${points} 720,180`;
  const middleIndex = Math.floor((data.length - 1) / 2);

  return (
    <div className="seller-overview-chart">
      <svg viewBox="0 0 720 180" preserveAspectRatio="none" role="img" aria-label="Biểu đồ doanh thu theo ngày">
        <defs>
          <linearGradient id="sellerRevenueFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#dc2626" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#dc2626" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g className="seller-overview-chart__grid"><path d="M0 30H720M0 72H720M0 114H720M0 156H720" /></g>
        <polygon points={areaPoints} fill="url(#sellerRevenueFill)" />
        <polyline points={points} />
      </svg>
      <div className="seller-overview-chart__labels">
        <span>{formatShortDate(data[0].date)}</span>
        <span>{formatShortDate(data[middleIndex].date)}</span>
        <span>{formatShortDate(data[data.length - 1].date)}</span>
      </div>
    </div>
  );
}

function ProductImage({ imageUrl, name }: { imageUrl: string | null; name: string }) {
  const [hasError, setHasError] = useState(false);
  return (
    <span className="seller-overview-products__image">
      {imageUrl && !hasError
        ? <img src={imageUrl} alt={name} loading="lazy" onError={() => setHasError(true)} />
        : <b aria-hidden="true">{name.charAt(0).toLocaleUpperCase('vi')}</b>}
    </span>
  );
}

function SellerDashboardSkeleton() {
  return (
    <main className="seller-overview-page" aria-label="Đang tải tổng quan gian hàng" aria-busy="true">
      <div className="seller-overview-skeleton seller-overview-skeleton--header"><i /><span /><span /></div>
      <div className="seller-overview-skeleton-grid">{Array.from({ length: 4 }, (_, index) => <div className="seller-overview-skeleton" key={index}><span /><i /><i /></div>)}</div>
      <div className="seller-overview-skeleton seller-overview-skeleton--attention"><span /><i /></div>
      <div className="seller-overview-skeleton-panels"><div className="seller-overview-skeleton" /><div className="seller-overview-skeleton" /></div>
    </main>
  );
}

type OverviewIconName = 'notice' | 'store' | 'settings' | 'revenue' | 'order' | 'completed' | 'rating' | 'trend' | 'product';

function OverviewIcon({ name }: { name: OverviewIconName }): ReactNode {
  const paths: Record<OverviewIconName, ReactNode> = {
    notice: <><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></>,
    store: <><path d="M4 10v10h16V10M3 4h18l-2 6H5L3 4Z" /><path d="M9 20v-6h6v6" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6V3h4v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>,
    revenue: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 15h4M7 11h10M16 15h1" /></>,
    order: <><path d="M6 8h12l1 13H5L6 8Z" /><path d="M9 9V6a3 3 0 0 1 6 0v3" /></>,
    completed: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>,
    rating: <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />,
    trend: <><path d="M3 17 9 11l4 4 8-9" /><path d="M15 6h6v6" /></>,
    product: <><path d="m4 7 8-4 8 4-8 4-8-4Z" /><path d="m4 7 8 4v10l-8-4V7ZM20 7l-8 4v10l8-4V7Z" /></>,
  };

  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
