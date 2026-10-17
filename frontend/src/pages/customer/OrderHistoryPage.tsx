import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getCustomerOrders } from '../../api/order.api';
import type {
  CustomerOrderGroupListItem,
  OrderStatus,
} from '../../types/order';
import { getApiErrorMessage } from '../../utils/auth';
import { formatCurrency } from '../../utils/format-currency';
import {
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  formatOrderDate,
} from '../../utils/order';
import './order.css';

type OrderFilter = 'ALL' | OrderStatus;

const statusFilters: { value: OrderFilter; label: string }[] = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'PENDING', label: 'Chờ xác nhận' },
  { value: 'CONFIRMED', label: 'Đã xác nhận' },
  { value: 'SHIPPING', label: 'Đang giao' },
  { value: 'COMPLETED', label: 'Hoàn thành' },
  { value: 'CANCELLED', label: 'Đã hủy' },
];

export function OrderHistoryPage() {
  const [orderGroups, setOrderGroups] = useState<CustomerOrderGroupListItem[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<OrderFilter>('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const requestIdRef = useRef(0);

  const loadOrders = useCallback(async (showLoading = true) => {
    const requestId = ++requestIdRef.current;
    if (showLoading) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      const response = await getCustomerOrders();
      if (requestId !== requestIdRef.current) return;
      setOrderGroups(response.data);
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

  const filteredGroups = useMemo(() => {
    if (selectedStatus === 'ALL') return orderGroups;

    return orderGroups
      .map((group) => ({
        ...group,
        orders: group.orders.filter((order) => order.status === selectedStatus),
      }))
      .filter((group) => group.orders.length > 0);
  }, [orderGroups, selectedStatus]);

  const orderCount = orderGroups.reduce((total, group) => total + group.orders.length, 0);

  return (
    <main className="order-page">
      <header className="order-heading">
        <div>
          <span>Tài khoản của bạn</span>
          <h1>Đơn hàng của tôi</h1>
          <p>Theo dõi và xem lại các đơn hàng đã đặt.</p>
        </div>
        {!isLoading && orderCount > 0 && (
          <strong>{isRefreshing ? 'Đang cập nhật...' : `${orderCount} đơn hàng`}</strong>
        )}
      </header>

      {!isLoading && orderGroups.length > 0 && (
        <nav className="order-tabs" aria-label="Lọc đơn hàng theo trạng thái">
          {statusFilters.map((filter) => (
            <button
              className={selectedStatus === filter.value ? 'is-active' : ''}
              key={filter.value}
              type="button"
              onClick={() => setSelectedStatus(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </nav>
      )}

      {errorMessage && (
        <div className="order-alert" role="alert">
          <div><strong>Không thể tải danh sách đơn hàng</strong><p>{errorMessage}</p></div>
          <button type="button" onClick={() => void loadOrders()}>Thử lại</button>
        </div>
      )}

      {isLoading ? (
        <OrderHistorySkeleton />
      ) : orderGroups.length === 0 && !errorMessage ? (
        <section className="order-empty">
          <span aria-hidden="true">□</span>
          <h2>Bạn chưa có đơn hàng nào</h2>
          <p>Các đơn hàng sau khi đặt sẽ xuất hiện tại đây để bạn theo dõi.</p>
          <Link to="/">Khám phá sản phẩm</Link>
        </section>
      ) : filteredGroups.length === 0 ? (
        <section className="order-empty order-empty--compact">
          <span aria-hidden="true">⌕</span>
          <h2>Không có đơn hàng ở trạng thái này</h2>
          <button type="button" onClick={() => setSelectedStatus('ALL')}>Xem tất cả đơn hàng</button>
        </section>
      ) : (
        <section className="order-groups" aria-label="Lịch sử đơn hàng">
          {filteredGroups.map((group) => <OrderGroupCard group={group} key={group.orderGroupId} />)}
        </section>
      )}
    </main>
  );
}

function OrderGroupCard({ group }: { group: CustomerOrderGroupListItem }) {
  return (
    <article className="order-group-card">
      <header>
        <div>
          <span>Nhóm đơn #{group.orderGroupId}</span>
          <time dateTime={group.createdAt}>{formatOrderDate(group.createdAt)}</time>
        </div>
        <div className="order-group-card__payment">
          {group.payment ? (
            <><strong>{PAYMENT_METHOD_LABELS[group.payment.paymentMethod]}</strong><span className={`payment-state is-${group.payment.status.toLowerCase()}`}>{PAYMENT_STATUS_LABELS[group.payment.status]}</span></>
          ) : <span className="payment-state is-missing">Chưa có thanh toán</span>}
        </div>
      </header>

      <div className="order-group-card__orders">
        {group.orders.map((order) => (
          <section className="order-history-item" key={order.orderId}>
            <div className="order-history-item__shop">
              <span aria-hidden="true">M</span>
              <div><strong>{order.shopName}</strong><small>Đơn hàng #{order.orderId}</small></div>
            </div>
            <time dateTime={order.createdAt}>{formatOrderDate(order.createdAt)}</time>
            <span className={`order-status is-${order.status.toLowerCase()}`}>{ORDER_STATUS_LABELS[order.status]}</span>
            <strong className="order-history-item__amount">{formatCurrency(order.totalAmount)}</strong>
            <Link to={`/orders/${group.orderGroupId}`} state={{ focusOrderId: order.orderId }}>Xem chi tiết</Link>
          </section>
        ))}
      </div>

      <footer>
        <span>{group.orders.length} đơn theo gian hàng</span>
        <div><small>Tổng nhóm đơn</small><strong>{formatCurrency(group.totalAmount)}</strong></div>
      </footer>
    </article>
  );
}

function OrderHistorySkeleton() {
  return (
    <section className="order-history-loading" aria-label="Đang tải danh sách đơn hàng" aria-busy="true">
      {Array.from({ length: 3 }, (_, index) => (
        <article key={index} aria-hidden="true">
          <span /><div><i /><i /><i /></div><span />
        </article>
      ))}
    </section>
  );
}
