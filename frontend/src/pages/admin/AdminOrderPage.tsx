import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { getAdminOrders } from '../../api/admin-order.api';
import type { AdminOrderListResponse } from '../../types/admin-order';
import type { OrderStatus } from '../../types/order';
import { getApiErrorMessage } from '../../utils/auth';
import { formatCurrency } from '../../utils/format-currency';
import {
  formatOrderDate,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
} from '../../utils/order';
import './admin-order.css';

const PAGE_SIZE = 20;
type AdminOrderStatusFilter = '' | OrderStatus;

const statusFilters: { value: AdminOrderStatusFilter; label: string }[] = [
  { value: '', label: 'Tất cả' },
  { value: 'PENDING', label: 'Chờ xác nhận' },
  { value: 'CONFIRMED', label: 'Đã xác nhận' },
  { value: 'SHIPPING', label: 'Đang giao' },
  { value: 'COMPLETED', label: 'Hoàn thành' },
  { value: 'CANCELLED', label: 'Đã hủy' },
];

export function AdminOrderPage() {
  const [result, setResult] = useState<AdminOrderListResponse | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<AdminOrderStatusFilter>('');
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
      const response = await getAdminOrders({
        search: search || undefined,
        status: status || undefined,
        page,
        limit: PAGE_SIZE,
      });
      if (requestId !== requestIdRef.current) return;
      setResult(response);
      setErrorMessage('');
    } catch (error: unknown) {
      if (requestId !== requestIdRef.current) return;
      setErrorMessage(
        getApiErrorMessage(error, 'Không thể tải danh sách đơn hàng.'),
      );
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [page, search, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadOrders(), 0);
    const handleFocus = () => void loadOrders(false);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.clearTimeout(timer);
      requestIdRef.current += 1;
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadOrders]);

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedSearch = searchInput.trim();
    if (normalizedSearch === search && page === 1) {
      void loadOrders(false);
      return;
    }
    setPage(1);
    setSearch(normalizedSearch);
  };

  const handleStatusChange = (nextStatus: AdminOrderStatusFilter) => {
    setPage(1);
    setStatus(nextStatus);
  };

  return (
    <main className="admin-order-page">
      <header className="admin-order-heading">
        <div>
          <span>Vận hành toàn sàn</span>
          <h1>Giám sát đơn hàng</h1>
          <p>Theo dõi trạng thái và thông tin đơn hàng trên toàn sàn.</p>
        </div>
        <div>
          <small>{isRefreshing ? 'Đang cập nhật...' : 'Tổng kết quả'}</small>
          <strong>{result?.pagination.totalItems ?? '—'}</strong>
        </div>
      </header>

      <section className="admin-order-toolbar">
        <form onSubmit={handleSearch}>
          <label htmlFor="admin-order-search">Tìm kiếm đơn hàng</label>
          <div>
            <input
              id="admin-order-search"
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Mã đơn, nhóm đơn, gian hàng hoặc khách hàng..."
            />
            <button type="submit">Tìm</button>
          </div>
        </form>
        <nav aria-label="Lọc đơn hàng theo trạng thái">
          {statusFilters.map((filter) => (
            <button
              type="button"
              className={status === filter.value ? 'is-active' : ''}
              onClick={() => handleStatusChange(filter.value)}
              key={filter.value || 'ALL'}
            >
              {filter.label}
            </button>
          ))}
        </nav>
      </section>

      {errorMessage && result && (
        <div className="admin-order-inline-error" role="alert">
          <span>{errorMessage}</span>
          <button type="button" onClick={() => void loadOrders(false)}>Thử lại</button>
        </div>
      )}

      {isLoading ? (
        <AdminOrderListSkeleton />
      ) : errorMessage && !result ? (
        <section className="admin-order-state is-error">
          <span aria-hidden="true">!</span>
          <h2>Không thể tải danh sách đơn hàng.</h2>
          <p>{errorMessage}</p>
          <button type="button" onClick={() => void loadOrders()}>Thử lại</button>
        </section>
      ) : !result?.data.length ? (
        <section className="admin-order-state">
          <span aria-hidden="true">▤</span>
          <h2>Chưa có đơn hàng nào.</h2>
          <p>Không có đơn hàng phù hợp với từ khóa hoặc trạng thái đã chọn.</p>
        </section>
      ) : (
        <>
          <section className="admin-order-table-wrap" aria-label="Danh sách đơn hàng">
            <table className="admin-order-table">
              <thead><tr><th>Đơn hàng</th><th>Gian hàng</th><th>Khách hàng</th><th>Ngày đặt</th><th>Tổng tiền</th><th>Thanh toán</th><th>Trạng thái</th><th aria-label="Thao tác" /></tr></thead>
              <tbody>
                {result.data.map((order) => (
                  <tr key={order.orderId}>
                    <td data-label="Đơn hàng"><strong>#{order.orderId}</strong><small>Nhóm #{order.orderGroupId}</small></td>
                    <td data-label="Gian hàng"><strong>{order.shop.name}</strong><small>#{order.shop.shopId}</small></td>
                    <td data-label="Khách hàng"><strong>{order.customer.fullName}</strong><small>{order.customer.email}</small></td>
                    <td data-label="Ngày đặt"><time dateTime={order.createdAt}>{formatOrderDate(order.createdAt)}</time></td>
                    <td data-label="Tổng tiền"><strong className="admin-order-amount">{formatCurrency(order.totalAmount)}</strong></td>
                    <td data-label="Thanh toán">{order.payment ? <span className={`admin-payment-status is-${order.payment.status.toLowerCase()}`}>{PAYMENT_STATUS_LABELS[order.payment.status]}</span> : <span className="admin-order-muted">Chưa có</span>}</td>
                    <td data-label="Trạng thái"><span className={`admin-order-status is-${order.status.toLowerCase()}`}>{ORDER_STATUS_LABELS[order.status]}</span></td>
                    <td><Link to={`/admin/orders/${order.orderId}`}>Xem chi tiết</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <footer className="admin-order-pagination">
            <span>Trang {result.pagination.page} / {Math.max(result.pagination.totalPages, 1)}</span>
            <div>
              <button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Trước</button>
              <button type="button" disabled={page >= result.pagination.totalPages} onClick={() => setPage((current) => current + 1)}>Sau</button>
            </div>
          </footer>
        </>
      )}
    </main>
  );
}

function AdminOrderListSkeleton() {
  return (
    <section className="admin-order-loading" aria-label="Đang tải danh sách đơn hàng" aria-busy="true">
      {Array.from({ length: 6 }, (_, index) => <div key={index} aria-hidden="true"><span /><i /><i /><i /></div>)}
    </section>
  );
}
