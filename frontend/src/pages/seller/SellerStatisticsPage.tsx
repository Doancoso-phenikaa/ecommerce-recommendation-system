import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSellerStatistics } from '../../api/seller-statistics.api';
import type {
  SellerStatisticsRange,
  SellerStatisticsResponse,
} from '../../types/statistics';
import { getApiErrorMessage } from '../../utils/auth';
import { formatCurrency } from '../../utils/format-currency';
import './seller-statistics.css';

const RANGE_OPTIONS: { value: SellerStatisticsRange; label: string }[] = [
  { value: '7d', label: '7 ngày' },
  { value: '30d', label: '30 ngày' },
];

const STATUS_META = [
  { key: 'pending', label: 'Chờ xác nhận', color: '#f59e0b' },
  { key: 'confirmed', label: 'Đã xác nhận', color: '#3b82f6' },
  { key: 'shipping', label: 'Đang giao', color: '#dc2626' },
  { key: 'completed', label: 'Hoàn thành', color: '#16a34a' },
  { key: 'cancelled', label: 'Đã hủy', color: '#64748b' },
] as const;

export function SellerStatisticsPage() {
  const [range, setRange] = useState<SellerStatisticsRange>('7d');
  const [statistics, setStatistics] = useState<SellerStatisticsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const requestIdRef = useRef(0);

  const loadStatistics = useCallback(async (showLoading = true) => {
    const requestId = ++requestIdRef.current;
    if (showLoading) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      const response = await getSellerStatistics(range);
      if (requestId !== requestIdRef.current) return;
      setStatistics(response);
      setErrorMessage('');
    } catch (error: unknown) {
      if (requestId !== requestIdRef.current) return;
      setErrorMessage(getApiErrorMessage(error, 'Không thể tải thống kê gian hàng.'));
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
    () => Math.max(
      1,
      ...STATUS_META.map(({ key }) => statistics?.orderStatusCounts[key] ?? 0),
    ),
    [statistics],
  );

  return (
    <main className="seller-statistics-page">
      <header className="seller-statistics-heading">
        <div>
          <span>KÊNH NGƯỜI BÁN</span>
          <h1>Thống kê gian hàng</h1>
          <p>Theo dõi doanh thu và hiệu quả bán hàng của gian hàng.</p>
        </div>
        <div className="seller-statistics-range" aria-label="Khoảng thời gian thống kê">
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
        <div className="seller-statistics-alert" role="alert">
          <div><strong>Không thể tải thống kê</strong><p>{errorMessage}</p></div>
          <button type="button" onClick={() => void loadStatistics()}>Thử lại</button>
        </div>
      )}

      {isLoading ? (
        <SellerStatisticsSkeleton />
      ) : statistics ? (
        <>
          <section className="seller-statistics-cards" aria-label="Số liệu tổng quan">
            <MetricCard label="Tổng doanh thu" value={formatCurrency(statistics.overview.totalRevenue)} note="Từ đơn đã hoàn thành" accent="revenue" />
            <MetricCard label="Tổng đơn hàng" value={String(statistics.overview.totalOrders)} note="Tất cả trạng thái" accent="orders" />
            <MetricCard label="Đơn hoàn thành" value={String(statistics.overview.completedOrders)} note="Đã ghi nhận doanh thu" accent="completed" />
            <MetricCard label="Đang xử lý" value={String(statistics.overview.processingOrders)} note="Chờ xác nhận, xác nhận, giao" accent="processing" />
          </section>

          {statistics.overview.totalOrders === 0 ? (
            <section className="seller-statistics-empty">
              <span aria-hidden="true">↗</span>
              <h2>Chưa có dữ liệu bán hàng</h2>
              <p>Số liệu doanh thu và hiệu suất sản phẩm sẽ xuất hiện sau khi gian hàng có đơn hàng.</p>
            </section>
          ) : (
            <div className="seller-statistics-grid">
              <section className="seller-statistics-panel seller-statistics-panel--chart">
                <header><div><span>Doanh thu</span><h2>{range === '7d' ? '7 ngày gần nhất' : '30 ngày gần nhất'}</h2></div>{isRefreshing && <small>Đang cập nhật...</small>}</header>
                {statistics.revenueByDay.length === 0 ? (
                  <PanelEmpty message="Chưa có doanh thu trong khoảng thời gian này." />
                ) : (
                  <div className="seller-revenue-chart" role="img" aria-label="Biểu đồ doanh thu theo ngày">
                    {statistics.revenueByDay.map((point) => {
                      const percentage = maximumRevenue > 0
                        ? Math.max((Number(point.revenue) / maximumRevenue) * 100, 4)
                        : 4;
                      return (
                        <div className="seller-revenue-bar" key={point.date}>
                          <div className="seller-revenue-bar__track">
                            <span style={{ height: `${percentage}%` }} title={`${formatCurrency(point.revenue)} · ${point.orders} đơn`} />
                          </div>
                          <strong>{formatShortDate(point.date)}</strong>
                          <small>{point.orders} đơn</small>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="seller-statistics-panel seller-statistics-panel--status">
                <header><div><span>Đơn hàng</span><h2>Phân bổ trạng thái</h2></div></header>
                <div className="seller-status-list">
                  {STATUS_META.map(({ key, label, color }) => {
                    const count = statistics.orderStatusCounts[key];
                    return (
                      <div key={key}>
                        <p><span><i style={{ background: color }} />{label}</span><strong>{count}</strong></p>
                        <div><span style={{ background: color, width: `${(count / maximumStatusCount) * 100}%` }} /></div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="seller-statistics-panel seller-statistics-panel--products">
                <header><div><span>Hiệu suất sản phẩm</span><h2>Top 5 sản phẩm bán chạy</h2></div></header>
                {statistics.topProducts.length === 0 ? (
                  <PanelEmpty message="Chưa có sản phẩm phát sinh doanh thu." />
                ) : (
                  <div className="seller-top-products">
                    {statistics.topProducts.map((product, index) => (
                      <article key={product.productId}>
                        <strong className="seller-top-products__rank">{String(index + 1).padStart(2, '0')}</strong>
                        <div className="seller-top-products__image">
                          {product.imageUrl ? <img src={product.imageUrl} alt={product.productName} /> : <span aria-hidden="true">{product.productName.charAt(0).toLocaleUpperCase('vi')}</span>}
                        </div>
                        <div className="seller-top-products__identity"><h3>{product.productName}</h3><p>Đã bán {product.quantitySold} sản phẩm</p></div>
                        <strong className="seller-top-products__revenue">{formatCurrency(product.revenue)}</strong>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </>
      ) : null}
    </main>
  );
}

function MetricCard({ label, value, note, accent }: { label: string; value: string; note: string; accent: string }) {
  return <article className={`seller-statistics-card is-${accent}`}><div><span>{label}</span><i aria-hidden="true"><StatisticsMetricIcon type={accent} /></i></div><strong>{value}</strong><small>{note}</small></article>;
}

function PanelEmpty({ message }: { message: string }) {
  return <div className="seller-statistics-panel-empty"><span aria-hidden="true">—</span><p>{message}</p></div>;
}

function SellerStatisticsSkeleton() {
  return (
    <div className="seller-statistics-loading" aria-label="Đang tải thống kê" aria-busy="true">
      <section>{Array.from({ length: 4 }, (_, index) => <div key={index}><i /><i /><i /></div>)}</section>
      <div><article /><aside /></div>
    </div>
  );
}

function StatisticsMetricIcon({ type }: { type: string }) {
  if (type === 'orders') return <svg viewBox="0 0 24 24"><path d="M6 3h12l1 18H5L6 3Z" /><path d="M9 8a3 3 0 0 0 6 0" /></svg>;
  if (type === 'completed') return <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></svg>;
  if (type === 'processing') return <svg viewBox="0 0 24 24"><path d="M3 7h11v10H3zM14 10h4l3 3v4h-7z" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></svg>;
  return <svg viewBox="0 0 24 24"><path d="M5 18V9M10 18V5M15 18v-6M20 18V3" /></svg>;
}

function formatShortDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}` : value;
}
