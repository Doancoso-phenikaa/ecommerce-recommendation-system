import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router-dom';
import { getAdminProducts } from '../../api/admin-product.api';
import { getAdminShops } from '../../api/admin-shop.api';
import { getAdminStatistics } from '../../api/admin-statistics.api';
import type {
  AdminRevenuePoint,
  AdminStatisticsRange,
  AdminStatisticsResponse,
} from '../../types/statistics';
import { getApiErrorMessage } from '../../utils/auth';
import { formatCurrency } from '../../utils/format-currency';
import './admin-dashboard.css';

const RANGE_OPTIONS: Array<{ value: AdminStatisticsRange; label: string }> = [
  { value: '7d', label: '7 ngày' },
  { value: '30d', label: '30 ngày' },
];

const ORDER_STATUS_META = [
  { key: 'pending', label: 'Chờ xác nhận', color: '#d97706' },
  { key: 'confirmed', label: 'Đã xác nhận', color: '#2563eb' },
  { key: 'shipping', label: 'Đang giao', color: '#dc2626' },
  { key: 'completed', label: 'Hoàn thành', color: '#16a34a' },
  { key: 'cancelled', label: 'Đã hủy', color: '#64748b' },
] as const;

interface AttentionCounts {
  pendingShops: number;
  pendingProducts: number;
}

export function AdminDashboardPage() {
  const [range, setRange] = useState<AdminStatisticsRange>('7d');
  const [statistics, setStatistics] = useState<AdminStatisticsResponse | null>(null);
  const [attention, setAttention] = useState<AttentionCounts | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const requestIdRef = useRef(0);

  const loadDashboard = useCallback(async (showLoading = true) => {
    const requestId = ++requestIdRef.current;
    if (showLoading) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      const [statisticsResult, shopsResult, productsResult] =
        await Promise.all([
          getAdminStatistics(range),
          getAdminShops({ status: 'PENDING', page: 1, limit: 1 }),
          getAdminProducts({ status: 'PENDING', page: 1, limit: 1 }),
        ]);

      if (requestId !== requestIdRef.current) return;
      setStatistics(statisticsResult);
      setAttention({
        pendingShops: shopsResult.pagination.totalItems,
        pendingProducts: productsResult.pagination.totalItems,
      });
      setErrorMessage('');
    } catch (error: unknown) {
      if (requestId !== requestIdRef.current) return;
      setErrorMessage(
        getApiErrorMessage(error, 'Không thể tải dữ liệu tổng quan hệ thống.'),
      );
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [range]);

  useEffect(() => {
    const initialLoadTimer = window.setTimeout(
      () => void loadDashboard(true),
      0,
    );
    const handleFocus = () => void loadDashboard(false);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.clearTimeout(initialLoadTimer);
      requestIdRef.current += 1;
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadDashboard]);

  const maximumStatusCount = useMemo(
    () =>
      Math.max(
        1,
        ...ORDER_STATUS_META.map(
          ({ key }) => statistics?.orderStatusCounts[key] ?? 0,
        ),
      ),
    [statistics],
  );

  return (
    <main className="admin-dashboard-page">
      <header className="admin-dashboard-header">
        <div>
          <span>TRANG CHỦ QUẢN TRỊ</span>
          <h1>Tổng quan hệ thống MarketNest</h1>
          <p>
            Theo dõi hoạt động marketplace, các yêu cầu cần xử lý và hiệu suất
            bán hàng toàn hệ thống.
          </p>
        </div>
        <div className="admin-dashboard-range" aria-label="Khoảng thời gian thống kê">
          {RANGE_OPTIONS.map((option) => (
            <button
              className={range === option.value ? 'is-active' : ''}
              disabled={isLoading || isRefreshing}
              key={option.value}
              type="button"
              onClick={() => setRange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      {errorMessage && (
        <div className="admin-dashboard-alert" role="alert">
          <div>
            <strong>Không thể tải dữ liệu tổng quan</strong>
            <p>{errorMessage}</p>
          </div>
          <button type="button" onClick={() => void loadDashboard(true)}>
            Thử lại
          </button>
        </div>
      )}

      {isLoading ? (
        <AdminDashboardSkeleton />
      ) : statistics && attention ? (
        <>
          <section className="admin-dashboard-metrics" aria-label="Chỉ số tổng quan">
            <DashboardMetricCard
              icon="revenue"
              label="Doanh thu toàn sàn"
              value={formatCurrency(statistics.overview.totalRevenue)}
              note={`${statistics.overview.completedOrders.toLocaleString('vi-VN')} đơn hoàn thành`}
            />
            <DashboardMetricCard
              icon="orders"
              label="Tổng đơn hàng"
              value={statistics.overview.totalOrders.toLocaleString('vi-VN')}
              note={`${statistics.overview.processingOrders.toLocaleString('vi-VN')} đơn đang xử lý`}
            />
            <DashboardMetricCard
              icon="users"
              label="Người dùng"
              value={statistics.overview.totalUsers.toLocaleString('vi-VN')}
              note={`${statistics.overview.totalSellers.toLocaleString('vi-VN')} người bán`}
            />
            <DashboardMetricCard
              icon="shops"
              label="Gian hàng"
              value={statistics.overview.totalShops.toLocaleString('vi-VN')}
              note={`${attention.pendingShops.toLocaleString('vi-VN')} chờ duyệt`}
            />
            <DashboardMetricCard
              icon="products"
              label="Sản phẩm"
              value={statistics.overview.totalProducts.toLocaleString('vi-VN')}
              note={`${attention.pendingProducts.toLocaleString('vi-VN')} chờ duyệt`}
            />
          </section>

          <section className="admin-dashboard-attention">
            <header>
              <div>
                <span>CẦN XỬ LÝ</span>
                <h2>Công việc đang chờ quản trị viên</h2>
              </div>
              <small>Dữ liệu được cập nhật từ các phân hệ quản lý</small>
            </header>
            <div>
              <AttentionCard
                count={attention.pendingShops}
                description="Hồ sơ gian hàng đang chờ kiểm duyệt"
                label="Gian hàng chờ duyệt"
                to="/admin/shops"
              />
              <AttentionCard
                count={attention.pendingProducts}
                description="Sản phẩm cần kiểm tra trước khi hiển thị"
                label="Sản phẩm chờ duyệt"
                to="/admin/products"
              />
              <AttentionCard
                count={statistics.orderStatusCounts.pending}
                description="Đơn hàng đang chờ người bán xác nhận"
                label="Đơn hàng chờ xác nhận"
                to="/admin/orders"
              />
              <AttentionCard
                count={statistics.overview.processingOrders}
                description="Đơn chờ xác nhận, đã xác nhận hoặc đang giao"
                label="Đơn đang xử lý"
                to="/admin/orders"
              />
            </div>
          </section>

          <div className="admin-dashboard-analysis">
            <section className="admin-dashboard-panel admin-dashboard-revenue">
              <PanelHeader
                eyebrow="DOANH THU MARKETPLACE"
                title={range === '7d' ? 'Xu hướng 7 ngày gần nhất' : 'Xu hướng 30 ngày gần nhất'}
                aside={isRefreshing ? 'Đang cập nhật...' : undefined}
              />
              <RevenueTrendChart points={statistics.revenueByDay} />
              <footer>
                <span>Dựa trên các đơn hàng đã hoàn thành</span>
                <Link to="/admin/statistics">Xem thống kê chi tiết →</Link>
              </footer>
            </section>

            <section className="admin-dashboard-panel admin-dashboard-status">
              <PanelHeader eyebrow="ĐƠN HÀNG" title="Phân bổ trạng thái" />
              <div className="admin-dashboard-status-list">
                {ORDER_STATUS_META.map(({ key, label, color }) => {
                  const count = statistics.orderStatusCounts[key];
                  return (
                    <div key={key}>
                      <p>
                        <span><i style={{ background: color }} />{label}</span>
                        <strong>{count.toLocaleString('vi-VN')}</strong>
                      </p>
                      <div>
                        <span
                          style={{
                            background: color,
                            width: `${(count / maximumStatusCount) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <Link className="admin-dashboard-panel-link" to="/admin/orders">
                Giám sát đơn hàng →
              </Link>
            </section>
          </div>

          <div className="admin-dashboard-rankings">
            <section className="admin-dashboard-panel">
              <PanelHeader eyebrow="XẾP HẠNG DOANH THU" title="Gian hàng nổi bật" />
              {statistics.topShops.length ? (
                <div className="admin-dashboard-shop-list">
                  {statistics.topShops.map((shop, index) => (
                    <Link to={`/admin/shops/${shop.shopId}`} key={shop.shopId}>
                      <strong>{String(index + 1).padStart(2, '0')}</strong>
                      <div>
                        <h3>{shop.shopName}</h3>
                        <p>{shop.completedOrders.toLocaleString('vi-VN')} đơn hoàn thành</p>
                      </div>
                      <span>{formatCurrency(shop.revenue)}</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <DashboardEmpty message="Chưa có gian hàng phát sinh doanh thu." />
              )}
            </section>

            <section className="admin-dashboard-panel">
              <PanelHeader eyebrow="HIỆU SUẤT SẢN PHẨM" title="Sản phẩm bán chạy" />
              {statistics.topProducts.length ? (
                <div className="admin-dashboard-product-list">
                  {statistics.topProducts.map((product, index) => (
                    <Link to={`/admin/products/${product.productId}`} key={product.productId}>
                      <strong>{String(index + 1).padStart(2, '0')}</strong>
                      <DashboardProductImage
                        imageUrl={product.imageUrl}
                        name={product.productName}
                      />
                      <div>
                        <h3>{product.productName}</h3>
                        <p>{product.shopName} · Đã bán {product.quantitySold.toLocaleString('vi-VN')}</p>
                      </div>
                      <span>{formatCurrency(product.revenue)}</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <DashboardEmpty message="Chưa có sản phẩm phát sinh doanh thu." />
              )}
            </section>
          </div>
        </>
      ) : null}
    </main>
  );
}

function DashboardMetricCard({ icon, label, value, note }: { icon: string; label: string; value: string; note: string }) {
  return (
    <article className={`admin-dashboard-metric is-${icon}`}>
      <div><span>{label}</span><i aria-hidden="true"><DashboardIcon type={icon} /></i></div>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function AttentionCard({ label, description, count, to }: { label: string; description: string; count: number; to: string }) {
  return (
    <Link className="admin-dashboard-attention-card" to={to}>
      <span>{label}</span>
      <strong>{count.toLocaleString('vi-VN')}</strong>
      <p>{description}</p>
      <i aria-hidden="true">→</i>
    </Link>
  );
}

function PanelHeader({ eyebrow, title, aside }: { eyebrow: string; title: string; aside?: string }) {
  return (
    <header className="admin-dashboard-panel-header">
      <div><span>{eyebrow}</span><h2>{title}</h2></div>
      {aside && <small>{aside}</small>}
    </header>
  );
}

function RevenueTrendChart({ points }: { points: AdminRevenuePoint[] }) {
  if (!points.length) {
    return <DashboardEmpty message="Chưa có doanh thu trong khoảng thời gian này." />;
  }

  const width = 720;
  const baseline = 180;
  const chartTop = 20;
  const horizontalPadding = 22;
  const maximumRevenue = Math.max(1, ...points.map((point) => Number(point.revenue)));
  const coordinates = points.map((point, index) => {
    const x = points.length === 1
      ? width / 2
      : horizontalPadding + (index / (points.length - 1)) * (width - horizontalPadding * 2);
    const y = baseline - (Number(point.revenue) / maximumRevenue) * (baseline - chartTop);
    return { ...point, x, y };
  });
  const linePath = coordinates
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');
  const areaPath = `${linePath} L ${coordinates.at(-1)?.x ?? horizontalPadding} ${baseline} L ${coordinates[0]?.x ?? horizontalPadding} ${baseline} Z`;
  const labelIndexes = points.length <= 7
    ? points.map((_, index) => index)
    : [0, Math.floor((points.length - 1) / 4), Math.floor((points.length - 1) / 2), Math.floor(((points.length - 1) * 3) / 4), points.length - 1];

  return (
    <div className="admin-dashboard-chart" role="img" aria-label="Biểu đồ doanh thu marketplace theo ngày">
      <svg viewBox={`0 0 ${width} 200`}>
        {[40, 80, 120, 160].map((y) => <line key={y} x1="0" x2={width} y1={y} y2={y} />)}
        <path className="admin-dashboard-chart-area" d={areaPath} />
        <path className="admin-dashboard-chart-line" d={linePath} />
        {coordinates.map((point) => (
          <circle cx={point.x} cy={point.y} key={point.date} r="3.5">
            <title>{`${formatDashboardDate(point.date)}: ${formatCurrency(point.revenue)} · ${point.orders} đơn`}</title>
          </circle>
        ))}
      </svg>
      <div className="admin-dashboard-chart-labels">
        {labelIndexes.map((index) => <span key={points[index].date}>{formatDashboardDate(points[index].date)}</span>)}
      </div>
    </div>
  );
}

function DashboardProductImage({ imageUrl, name }: { imageUrl: string | null; name: string }) {
  const [hasError, setHasError] = useState(false);

  if (!imageUrl || hasError) {
    return <span className="admin-dashboard-product-image" aria-hidden="true">{name.charAt(0).toLocaleUpperCase('vi')}</span>;
  }

  return (
    <span className="admin-dashboard-product-image">
      <img src={imageUrl} alt={name} onError={() => setHasError(true)} />
    </span>
  );
}

function DashboardEmpty({ message }: { message: string }) {
  return <div className="admin-dashboard-empty"><span aria-hidden="true">—</span><p>{message}</p></div>;
}

function AdminDashboardSkeleton() {
  return (
    <div className="admin-dashboard-loading" aria-label="Đang tải tổng quan" aria-busy="true">
      <section>{Array.from({ length: 5 }, (_, index) => <i key={index} />)}</section>
      <article />
      <div><article /><aside /></div>
    </div>
  );
}

function DashboardIcon({ type }: { type: string }) {
  if (type === 'orders') return <svg viewBox="0 0 24 24"><path d="M6 3h12l1 18H5L6 3Z" /><path d="M9 8a3 3 0 0 0 6 0" /></svg>;
  if (type === 'users') return <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>;
  if (type === 'shops') return <svg viewBox="0 0 24 24"><path d="M4 10h16M5 10l1-6h12l1 6v10H5V10Z" /><path d="M9 20v-6h6v6" /></svg>;
  if (type === 'products') return <svg viewBox="0 0 24 24"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /></svg>;
  return <svg viewBox="0 0 24 24"><path d="M5 18V9M10 18V5M15 18v-6M20 18V3" /></svg>;
}

function formatDashboardDate(value: string): string {
  const [, month, day] = value.slice(0, 10).split('-');
  return month && day ? `${day}/${month}` : value;
}
