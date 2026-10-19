import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSellerOrders } from '../../api/seller-order.api';
import type { OrderStatus, SellerOrderListItem } from '../../types/order';
import { getApiErrorMessage } from '../../utils/auth';
import { formatCurrency } from '../../utils/format-currency';
import { formatOrderDate, ORDER_STATUS_LABELS } from '../../utils/order';
import './seller-order.css';

type SellerOrderFilter = 'ALL' | OrderStatus;

const PAGE_SIZE = 10;

const orderFilters: { value: SellerOrderFilter; label: string }[] = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'PENDING', label: 'Chờ xác nhận' },
  { value: 'CONFIRMED', label: 'Đã xác nhận' },
  { value: 'SHIPPING', label: 'Đang giao' },
  { value: 'COMPLETED', label: 'Hoàn thành' },
  { value: 'CANCELLED', label: 'Đã hủy' },
];

export function SellerOrderPage() {
  const [orders, setOrders] = useState<SellerOrderListItem[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<SellerOrderFilter>('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const requestIdRef = useRef(0);

  const loadOrders = useCallback(async (showLoading = true) => {
    const requestId = ++requestIdRef.current;
    if (showLoading) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      const response = await getSellerOrders();
      if (requestId !== requestIdRef.current) return;
      setOrders(response.data);
      setErrorMessage('');
    } catch (error: unknown) {
      if (requestId !== requestIdRef.current) return;
      setErrorMessage(getApiErrorMessage(error, 'Không thể tải danh sách đơn hàng.'));
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    const initialLoadTimer = window.setTimeout(() => void loadOrders(), 0);
    const handleFocus = () => void loadOrders(false);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.clearTimeout(initialLoadTimer);
      requestIdRef.current += 1;
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadOrders]);

  const statusCounts = useMemo(() => orders.reduce<Record<SellerOrderFilter, number>>(
    (counts, order) => {
      counts.ALL += 1;
      counts[order.status] += 1;
      return counts;
    },
    { ALL: 0, PENDING: 0, CONFIRMED: 0, SHIPPING: 0, COMPLETED: 0, CANCELLED: 0 },
  ), [orders]);

  const filteredOrders = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('vi-VN');

    return orders.filter((order) => {
      if (selectedStatus !== 'ALL' && order.status !== selectedStatus) return false;
      if (!normalizedSearch) return true;

      return order.orderId.toLocaleLowerCase('vi-VN').includes(normalizedSearch)
        || order.orderGroupId.toLocaleLowerCase('vi-VN').includes(normalizedSearch)
        || order.shippingAddress.toLocaleLowerCase('vi-VN').includes(normalizedSearch);
    });
  }, [orders, search, selectedStatus]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleOrders = filteredOrders.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const changeStatus = (status: SellerOrderFilter) => {
    setSelectedStatus(status);
    setPage(1);
  };

  const changeSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const clearFilters = () => {
    setSearch('');
    setSelectedStatus('ALL');
    setPage(1);
  };

  return (
    <main className="seller-order-page">
      <header className="seller-order-heading">
        <span>KÊNH NGƯỜI BÁN</span>
        <h1>Quản lý đơn hàng</h1>
        <p>Theo dõi và xử lý các đơn hàng của gian hàng.</p>
      </header>

      {isLoading ? (
        <SellerOrderListSkeleton />
      ) : (
        <>
          <section className="seller-order-summary" aria-label="Tổng quan đơn hàng">
            <SummaryCard label="Tổng đơn hàng" value={statusCounts.ALL} tone="neutral" icon="orders" helper="Toàn bộ đơn của gian hàng" />
            <SummaryCard label="Chờ xác nhận" value={statusCounts.PENDING} tone="amber" icon="pending" helper="Đơn cần xử lý ngay" />
            <SummaryCard label="Đang xử lý" value={statusCounts.CONFIRMED + statusCounts.SHIPPING} tone="blue" icon="processing" helper="Đã xác nhận và đang giao" />
            <SummaryCard label="Hoàn thành" value={statusCounts.COMPLETED} tone="green" icon="completed" helper="Khách đã nhận hàng" />
          </section>

          {errorMessage && (
            <div className="seller-order-alert" role="alert">
              <div><strong>Không thể tải danh sách đơn hàng</strong><p>{errorMessage}</p></div>
              <button type="button" onClick={() => void loadOrders()}>Thử lại</button>
            </div>
          )}

          {orders.length === 0 && !errorMessage ? (
            <section className="seller-order-empty">
              <span aria-hidden="true"><EmptyOrderIcon /></span>
              <h2>Chưa có đơn hàng nào.</h2>
              <p>Đơn hàng mới từ khách sẽ xuất hiện tại đây để bạn theo dõi và xử lý.</p>
            </section>
          ) : (
            <>
              <nav className="seller-order-tabs" aria-label="Lọc đơn hàng theo trạng thái">
                {orderFilters.map((filter) => (
                  <button
                    className={selectedStatus === filter.value ? 'is-active' : ''}
                    key={filter.value}
                    type="button"
                    onClick={() => changeStatus(filter.value)}
                  >
                    {filter.label}<span>{statusCounts[filter.value]}</span>
                  </button>
                ))}
              </nav>

              <section className="seller-order-panel" aria-label="Danh sách đơn hàng">
                <div className="seller-order-toolbar">
                  <label className="seller-order-search">
                    <SearchIcon />
                    <input
                      type="search"
                      value={search}
                      onChange={(event) => changeSearch(event.target.value)}
                      placeholder="Tìm theo mã đơn hàng hoặc mã nhóm đơn..."
                      aria-label="Tìm kiếm đơn hàng"
                    />
                    {search && <button type="button" onClick={() => changeSearch('')} aria-label="Xóa từ khóa">×</button>}
                  </label>
                  <span>{isRefreshing ? 'Đang cập nhật dữ liệu mới nhất...' : `${filteredOrders.length} đơn hàng phù hợp`}</span>
                  {(search || selectedStatus !== 'ALL') && <button className="seller-order-reset" type="button" onClick={clearFilters}>Đặt lại bộ lọc</button>}
                </div>

                {filteredOrders.length === 0 ? (
                  <section className="seller-order-empty is-compact">
                    <span aria-hidden="true"><SearchIcon /></span>
                    <h2>Không có đơn hàng phù hợp với bộ lọc.</h2>
                    <button type="button" onClick={clearFilters}>Xem tất cả đơn hàng</button>
                  </section>
                ) : (
                  <>
                    <div className="seller-order-table-wrap">
                      <table className="seller-order-table">
                        <thead><tr><th>Đơn hàng</th><th>Ngày đặt</th><th>Giao hàng</th><th>Tổng tiền</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
                        <tbody>{visibleOrders.map((order) => <SellerOrderRow key={order.orderId} order={order} />)}</tbody>
                      </table>
                    </div>
                    <SellerOrderPagination
                      page={currentPage}
                      totalPages={totalPages}
                      totalItems={filteredOrders.length}
                      onChange={setPage}
                    />
                  </>
                )}
              </section>
            </>
          )}
        </>
      )}
    </main>
  );
}

function SummaryCard({ label, value, tone, icon, helper }: {
  label: string;
  value: number;
  tone: 'neutral' | 'amber' | 'blue' | 'green';
  icon: 'orders' | 'pending' | 'processing' | 'completed';
  helper: string;
}) {
  return (
    <article className={`seller-order-summary-card is-${tone}`}>
      <div><span>{label}</span><i aria-hidden="true"><SummaryIcon type={icon} /></i></div>
      <strong>{value.toLocaleString('vi-VN')}</strong>
      <small>{helper}</small>
    </article>
  );
}

function SellerOrderRow({ order }: { order: SellerOrderListItem }) {
  return (
    <tr className={order.status === 'PENDING' ? 'is-pending' : undefined}>
      <td data-label="Đơn hàng">
        <div className="seller-order-identity">
          <strong>Đơn hàng #{order.orderId}</strong>
          <small>Nhóm đơn #{order.orderGroupId}</small>
          {order.status === 'PENDING' && <em>Cần xử lý</em>}
        </div>
      </td>
      <td data-label="Ngày đặt"><time dateTime={order.createdAt}>{formatOrderDate(order.createdAt)}</time></td>
      <td data-label="Giao hàng"><span className="seller-order-address">{order.shippingAddress}</span><small>{order.shippingMethod || 'Tiêu chuẩn'}</small></td>
      <td data-label="Tổng tiền"><strong className="seller-order-amount">{formatCurrency(order.totalAmount)}</strong></td>
      <td data-label="Trạng thái"><span className={`seller-order-status is-${order.status.toLowerCase()}`}>{ORDER_STATUS_LABELS[order.status]}</span></td>
      <td data-label="Thao tác"><Link className="seller-order-detail-link" to={`/seller/orders/${order.orderId}`}>Xem / Xử lý</Link></td>
    </tr>
  );
}

function SellerOrderPagination({ page, totalPages, totalItems, onChange }: {
  page: number;
  totalPages: number;
  totalItems: number;
  onChange: (page: number) => void;
}) {
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1)
    .filter((candidate) => candidate === 1 || candidate === totalPages || Math.abs(candidate - page) <= 1);

  return (
    <footer className="seller-order-pagination">
      <span>Hiển thị {Math.min((page - 1) * PAGE_SIZE + 1, totalItems)}–{Math.min(page * PAGE_SIZE, totalItems)} trong số {totalItems} đơn hàng</span>
      <div>
        <button type="button" onClick={() => onChange(page - 1)} disabled={page === 1} aria-label="Trang trước">‹</button>
        {pages.map((candidate, index) => (
          <span key={candidate}>
            {index > 0 && candidate - pages[index - 1] > 1 && <i>…</i>}
            <button className={candidate === page ? 'is-active' : ''} type="button" onClick={() => onChange(candidate)} aria-current={candidate === page ? 'page' : undefined}>{candidate}</button>
          </span>
        ))}
        <button type="button" onClick={() => onChange(page + 1)} disabled={page === totalPages} aria-label="Trang sau">›</button>
      </div>
    </footer>
  );
}

function SellerOrderListSkeleton() {
  return (
    <div className="seller-order-skeleton" aria-label="Đang tải danh sách đơn hàng" aria-busy="true">
      <section>{Array.from({ length: 4 }, (_, index) => <span key={index} />)}</section>
      <div>{Array.from({ length: 7 }, (_, index) => <i key={index} />)}</div>
    </div>
  );
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>;
}

function EmptyOrderIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12l1 18H5L6 3Z" /><path d="M9 8a3 3 0 0 0 6 0" /></svg>;
}

function SummaryIcon({ type }: { type: 'orders' | 'pending' | 'processing' | 'completed' }) {
  if (type === 'pending') return <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
  if (type === 'processing') return <svg viewBox="0 0 24 24"><path d="M3 7h11v10H3zM14 10h4l3 3v4h-7z" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></svg>;
  if (type === 'completed') return <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></svg>;
  return <svg viewBox="0 0 24 24"><path d="M6 3h12l1 18H5L6 3Z" /><path d="M9 8a3 3 0 0 0 6 0" /></svg>;
}
