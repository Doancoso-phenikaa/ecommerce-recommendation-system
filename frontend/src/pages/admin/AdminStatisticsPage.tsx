import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAdminStatistics } from '../../api/admin-statistics.api';
import type {
  AdminStatisticsRange,
  AdminStatisticsResponse,
} from '../../types/statistics';
import { getApiErrorMessage } from '../../utils/auth';
import { formatCurrency } from '../../utils/format-currency';
import './admin-statistics.css';

const RANGE_OPTIONS: { value: AdminStatisticsRange; label: string }[] = [
  { value: '7d', label: '7 ngày' },
  { value: '30d', label: '30 ngày' },
];

const STATUS_META = [
  { key: 'pending', label: 'Chờ xác nhận', color: '#f59e0b' },
  { key: 'confirmed', label: 'Đã xác nhận', color: '#2563eb' },
  { key: 'shipping', label: 'Đang giao', color: '#dc2626' },
  { key: 'completed', label: 'Hoàn thành', color: '#16a34a' },
  { key: 'cancelled', label: 'Đã hủy', color: '#64748b' },
] as const;

export function AdminStatisticsPage() {
  const [range, setRange] = useState<AdminStatisticsRange>('7d');
  const [statistics, setStatistics] = useState<AdminStatisticsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const requestIdRef = useRef(0);

  const loadStatistics = useCallback(async (showLoading = true) => {
    const requestId = ++requestIdRef.current;
    if (showLoading) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      const response = await getAdminStatistics(range);
      if (requestId !== requestIdRef.current) return;
      setStatistics(response);
      setErrorMessage('');
    } catch (error: unknown) {
      if (requestId !== requestIdRef.current) return;
      setErrorMessage(getApiErrorMessage(error, 'Không thể tải thống kê toàn sàn.'));
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [range]);

  useEffect(() => {
    const initialLoadTimer = window.setTimeout(() => void loadStatistics(), 0);
    const handleFocus = () => void loadStatistics(false);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.clearTimeout(initialLoadTimer);
      requestIdRef.current += 1;
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadStatistics]);

  const maximumRevenue = useMemo(
    () => Math.max(0, ...(statistics?.revenueByDay.map((point) => Number(point.revenue)) ?? [])),
    [statistics],
  );
  const maximumStatusCount = useMemo(
    () => Math.max(1, ...STATUS_META.map(({ key }) => statistics?.orderStatusCounts[key] ?? 0)),
    [statistics],
  );

  return (
    <main className="admin-statistics-page">
      <header className="admin-statistics-heading">
        <div><span>TRUNG TÂM QUẢN TRỊ</span><h1>Thống kê toàn sàn</h1><p>Theo dõi doanh thu và hoạt động tổng thể của hệ thống.</p></div>
        <div className="admin-statistics-range" aria-label="Khoảng thời gian thống kê">
          {RANGE_OPTIONS.map((option) => (
            <button className={range === option.value ? 'is-active' : ''} disabled={isLoading || isRefreshing} key={option.value} type="button" onClick={() => setRange(option.value)}>{option.label}</button>
          ))}
        </div>
      </header>

      {errorMessage && (
        <div className="admin-statistics-alert" role="alert">
          <div><strong>Không thể tải thống kê toàn sàn</strong><p>{errorMessage}</p></div>
          <button type="button" onClick={() => void loadStatistics()}>Thử lại</button>
        </div>
      )}

      {isLoading ? <AdminStatisticsSkeleton /> : statistics ? (
        <>
          <section className="admin-statistics-cards" aria-label="Số liệu toàn sàn">
            <MetricCard label="Tổng doanh thu" value={formatCurrency(statistics.overview.totalRevenue)} accent="revenue" />
            <MetricCard label="Tổng đơn hàng" value={statistics.overview.totalOrders.toLocaleString('vi-VN')} accent="orders" />
            <MetricCard label="Đơn hoàn thành" value={statistics.overview.completedOrders.toLocaleString('vi-VN')} accent="completed" />
            <MetricCard label="Đơn đang xử lý" value={statistics.overview.processingOrders.toLocaleString('vi-VN')} accent="processing" />
            <MetricCard label="Người dùng" value={statistics.overview.totalUsers.toLocaleString('vi-VN')} accent="users" />
            <MetricCard label="Người bán" value={statistics.overview.totalSellers.toLocaleString('vi-VN')} accent="sellers" />
            <MetricCard label="Gian hàng" value={statistics.overview.totalShops.toLocaleString('vi-VN')} accent="shops" />
            <MetricCard label="Sản phẩm" value={statistics.overview.totalProducts.toLocaleString('vi-VN')} accent="products" />
          </section>

          {statistics.overview.totalOrders === 0 && (
            <section className="admin-statistics-empty"><span aria-hidden="true">↗</span><div><h2>Chưa có dữ liệu bán hàng</h2><p>Các chỉ số đơn hàng và doanh thu sẽ xuất hiện khi marketplace bắt đầu phát sinh giao dịch.</p></div></section>
          )}

          <div className="admin-statistics-grid">
            <section className="admin-statistics-panel admin-statistics-panel--chart">
              <header><div><span>Doanh thu theo thời gian</span><h2>{range === '7d' ? '7 ngày gần nhất' : '30 ngày gần nhất'}</h2></div>{isRefreshing && <small>Đang cập nhật...</small>}</header>
              {statistics.revenueByDay.length === 0 ? <PanelEmpty message="Chưa có doanh thu trong khoảng thời gian này." /> : (
                <div className="admin-revenue-chart" role="img" aria-label="Biểu đồ doanh thu toàn sàn theo ngày">
                  {statistics.revenueByDay.map((point) => {
                    const percentage = maximumRevenue > 0 ? Math.max((Number(point.revenue) / maximumRevenue) * 100, 4) : 4;
                    return <div className="admin-revenue-bar" key={point.date}><div><span style={{ height: `${percentage}%` }} title={`${formatCurrency(point.revenue)} · ${point.orders} đơn`} /></div><strong>{formatShortDate(point.date)}</strong><small>{point.orders} đơn</small></div>;
                  })}
                </div>
              )}
            </section>

            <section className="admin-statistics-panel admin-statistics-panel--status">
              <header><div><span>Đơn hàng</span><h2>Phân bổ trạng thái</h2></div></header>
              <div className="admin-statistics-statuses">
                {STATUS_META.map(({ key, label, color }) => {
                  const count = statistics.orderStatusCounts[key];
                  return <div key={key}><p><span><i style={{ background: color }} />{label}</span><strong>{count}</strong></p><div><span style={{ background: color, width: `${(count / maximumStatusCount) * 100}%` }} /></div></div>;
                })}
              </div>
            </section>

            <section className="admin-statistics-panel admin-statistics-panel--ranking">
              <header><div><span>Xếp hạng doanh thu</span><h2>Gian hàng nổi bật</h2></div></header>
              {statistics.topShops.length === 0 ? <PanelEmpty message="Chưa có gian hàng phát sinh doanh thu." /> : (
                <div className="admin-top-shops">
                  {statistics.topShops.map((shop, index) => <article key={shop.shopId}><strong>{String(index + 1).padStart(2, '0')}</strong><div><h3>{shop.shopName}</h3><p>{shop.completedOrders} đơn hoàn thành</p></div><span>{formatCurrency(shop.revenue)}</span></article>)}
                </div>
              )}
            </section>

            <section className="admin-statistics-panel admin-statistics-panel--ranking">
              <header><div><span>Hiệu suất sản phẩm</span><h2>Sản phẩm bán chạy</h2></div></header>
              {statistics.topProducts.length === 0 ? <PanelEmpty message="Chưa có sản phẩm phát sinh doanh thu." /> : (
                <div className="admin-top-products">
                  {statistics.topProducts.map((product, index) => <article key={product.productId}><strong>{String(index + 1).padStart(2, '0')}</strong><div className="admin-top-products__image">{product.imageUrl ? <img src={product.imageUrl} alt={product.productName} /> : <span aria-hidden="true">{product.productName.charAt(0).toLocaleUpperCase('vi')}</span>}</div><div><h3>{product.productName}</h3><p>{product.shopName} · Đã bán {product.quantitySold}</p></div><span>{formatCurrency(product.revenue)}</span></article>)}
                </div>
              )}
            </section>
          </div>
        </>
      ) : null}
    </main>
  );
}

function MetricCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return <article className={`admin-statistics-card is-${accent}`}><div><span>{label}</span><i aria-hidden="true"><AdminMetricIcon type={accent} /></i></div><strong>{value}</strong></article>;
}

function PanelEmpty({ message }: { message: string }) {
  return <div className="admin-statistics-panel-empty"><span aria-hidden="true">—</span><p>{message}</p></div>;
}

function AdminStatisticsSkeleton() {
  return <div className="admin-statistics-loading" aria-label="Đang tải thống kê" aria-busy="true"><section>{Array.from({ length: 8 }, (_, index) => <div key={index}><i /><i /></div>)}</section><div><article /><aside /></div></div>;
}

function AdminMetricIcon({ type }: { type: string }) {
  if (type === 'orders') return <svg viewBox="0 0 24 24"><path d="M6 3h12l1 18H5L6 3Z" /><path d="M9 8a3 3 0 0 0 6 0" /></svg>;
  if (type === 'completed') return <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></svg>;
  if (type === 'processing') return <svg viewBox="0 0 24 24"><path d="M3 7h11v10H3zM14 10h4l3 3v4h-7z" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></svg>;
  if (type === 'users' || type === 'sellers') return <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>;
  if (type === 'shops') return <svg viewBox="0 0 24 24"><path d="M4 10h16M5 10l1-6h12l1 6v10H5V10Z" /><path d="M9 20v-6h6v6" /></svg>;
  if (type === 'products') return <svg viewBox="0 0 24 24"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /></svg>;
  return <svg viewBox="0 0 24 24"><path d="M5 18V9M10 18V5M15 18v-6M20 18V3" /></svg>;
}

function formatShortDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}` : value;
}
