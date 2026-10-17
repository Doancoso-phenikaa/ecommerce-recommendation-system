import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSellerOrders } from '../../api/seller-order.api';
import type { OrderStatus, SellerOrderListItem } from '../../types/order';
import { getApiErrorMessage } from '../../utils/auth';
import { formatCurrency } from '../../utils/format-currency';
import { formatOrderDate, ORDER_STATUS_LABELS } from '../../utils/order';
import './seller-order.css';

type SellerOrderFilter = 'ALL' | OrderStatus;

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

  const filteredOrders = useMemo(
    () => selectedStatus === 'ALL'
      ? orders
      : orders.filter((order) => order.status === selectedStatus),
    [orders, selectedStatus],
  );

  const pendingCount = orders.filter((order) => order.status === 'PENDING').length;

  return (
    <main className="seller-order-page">
      <header className="seller-order-heading">
        <div><span>Vận hành gian hàng</span><h1>Quản lý đơn hàng</h1><p>Theo dõi và xử lý các đơn hàng của gian hàng.</p></div>
        {!isLoading && <div><small>{isRefreshing ? 'Đang cập nhật...' : 'Cần xử lý'}</small><strong>{pendingCount}</strong></div>}
      </header>

      {!isLoading && orders.length > 0 && (
        <nav className="seller-order-tabs" aria-label="Lọc đơn hàng theo trạng thái">
          {orderFilters.map((filter) => (
            <button className={selectedStatus === filter.value ? 'is-active' : ''} key={filter.value} type="button" onClick={() => setSelectedStatus(filter.value)}>{filter.label}</button>
          ))}
        </nav>
      )}

      {errorMessage && (
        <div className="seller-order-alert" role="alert">
          <div><strong>Không thể tải danh sách đơn hàng</strong><p>{errorMessage}</p></div>
          <button type="button" onClick={() => void loadOrders()}>Thử lại</button>
        </div>
      )}

      {isLoading ? (
        <SellerOrderListSkeleton />
      ) : orders.length === 0 && !errorMessage ? (
        <section className="seller-order-empty"><span aria-hidden="true">▤</span><h2>Chưa có đơn hàng nào</h2><p>Đơn hàng mới từ khách sẽ xuất hiện tại đây để bạn theo dõi và xử lý.</p></section>
      ) : filteredOrders.length === 0 ? (
        <section className="seller-order-empty is-compact"><span aria-hidden="true">⌕</span><h2>Không có đơn hàng ở trạng thái này</h2><button type="button" onClick={() => setSelectedStatus('ALL')}>Xem tất cả đơn hàng</button></section>
      ) : (
        <section className="seller-order-table-wrap" aria-label="Danh sách đơn hàng">
          <table className="seller-order-table">
            <thead><tr><th>Đơn hàng</th><th>Ngày đặt</th><th>Giao hàng</th><th>Tổng tiền</th><th>Trạng thái</th><th aria-label="Thao tác" /></tr></thead>
            <tbody>{filteredOrders.map((order) => <SellerOrderRow key={order.orderId} order={order} />)}</tbody>
          </table>
        </section>
      )}
    </main>
  );
}

function SellerOrderRow({ order }: { order: SellerOrderListItem }) {
  return (
    <tr>
      <td data-label="Đơn hàng"><strong>#{order.orderId}</strong><small>Nhóm đơn #{order.orderGroupId}</small></td>
      <td data-label="Ngày đặt"><time dateTime={order.createdAt}>{formatOrderDate(order.createdAt)}</time></td>
      <td data-label="Giao hàng"><span className="seller-order-address">{order.shippingAddress}</span><small>{order.shippingMethod || 'Tiêu chuẩn'}</small></td>
      <td data-label="Tổng tiền"><strong className="seller-order-amount">{formatCurrency(order.totalAmount)}</strong></td>
      <td data-label="Trạng thái"><span className={`seller-order-status is-${order.status.toLowerCase()}`}>{ORDER_STATUS_LABELS[order.status]}</span></td>
      <td><Link className="seller-order-detail-link" to={`/seller/orders/${order.orderId}`}>Xem chi tiết</Link></td>
    </tr>
  );
}

function SellerOrderListSkeleton() {
  return (
    <section className="seller-order-list-loading" aria-label="Đang tải danh sách đơn hàng" aria-busy="true">
      {Array.from({ length: 5 }, (_, index) => <div key={index} aria-hidden="true"><span /><i /><i /><i /></div>)}
    </section>
  );
}
