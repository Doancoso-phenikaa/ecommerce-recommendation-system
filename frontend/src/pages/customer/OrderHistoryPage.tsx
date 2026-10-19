import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
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
import './order-history.css';

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
  const [searchDraft, setSearchDraft] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
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

  const statusCounts = useMemo(() => {
    const counts: Record<OrderFilter, number> = {
      ALL: 0,
      PENDING: 0,
      CONFIRMED: 0,
      SHIPPING: 0,
      COMPLETED: 0,
      CANCELLED: 0,
    };

    orderGroups.forEach((group) => {
      group.orders.forEach((order) => {
        counts.ALL += 1;
        counts[order.status] += 1;
      });
    });

    return counts;
  }, [orderGroups]);

  const filteredGroups = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLocaleLowerCase('vi');

    return orderGroups
      .map((group) => {
        const isGroupMatch = normalizedSearch
          ? group.orderGroupId.toLocaleLowerCase('vi').includes(normalizedSearch)
          : true;
        const orders = group.orders.filter((order) => {
          const matchesStatus = selectedStatus === 'ALL' || order.status === selectedStatus;
          if (!matchesStatus) return false;
          if (!normalizedSearch || isGroupMatch) return true;

          return order.orderId.toLocaleLowerCase('vi').includes(normalizedSearch)
            || order.shopName.toLocaleLowerCase('vi').includes(normalizedSearch)
            || order.items.some((item) => item.productName.toLocaleLowerCase('vi').includes(normalizedSearch));
        });

        return { ...group, orders };
      })
      .filter((group) => group.orders.length > 0);
  }, [orderGroups, searchTerm, selectedStatus]);

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearchTerm(searchDraft.trim());
  };

  const clearFilters = () => {
    setSelectedStatus('ALL');
    setSearchDraft('');
    setSearchTerm('');
  };

  const hasFilters = selectedStatus !== 'ALL' || Boolean(searchTerm);

  return (
    <main className="order-page order-history-page">
      <header className="order-heading order-history-heading">
        <div>
          <span>Tài khoản của bạn</span>
          <div className="order-history-heading__title">
            <h1>Đơn hàng của tôi</h1>
            {!isLoading && orderGroups.length > 0 && <em>{orderGroups.length} nhóm đơn hàng</em>}
          </div>
          <p>Theo dõi, tra cứu trạng thái và quản lý lịch sử các đơn hàng đã đặt.</p>
        </div>
        <div className="order-history-heading__trust">
          <span aria-hidden="true">✓</span>
          <strong>{isRefreshing ? 'Đang cập nhật trạng thái...' : 'Trạng thái được cập nhật từ hệ thống'}</strong>
        </div>
      </header>

      {!isLoading && orderGroups.length > 0 && (
        <section className="order-history-controls" aria-label="Tìm kiếm và lọc đơn hàng">
          <nav className="order-history-tabs" aria-label="Lọc đơn hàng theo trạng thái">
            {statusFilters.map((filter) => (
              <button
                className={selectedStatus === filter.value ? 'is-active' : ''}
                key={filter.value}
                type="button"
                onClick={() => setSelectedStatus(filter.value)}
              >
                {filter.label}
                <span>{statusCounts[filter.value]}</span>
              </button>
            ))}
          </nav>
          <form className="order-history-search" onSubmit={handleSearch}>
            <label htmlFor="order-history-search">
              <span aria-hidden="true">⌕</span>
              <input
                id="order-history-search"
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="Tìm theo tên Shop, mã nhóm hoặc mã đơn hàng..."
              />
            </label>
            <button type="submit">Tìm kiếm</button>
          </form>
        </section>
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
          <h2>Không tìm thấy đơn hàng phù hợp</h2>
          <p>Hãy thử trạng thái hoặc từ khóa tìm kiếm khác.</p>
          <button type="button" onClick={clearFilters}>Đặt lại bộ lọc</button>
        </section>
      ) : (
        <section className="order-groups order-history-groups" aria-label="Lịch sử đơn hàng">
          {filteredGroups.map((group) => <OrderGroupCard group={group} key={group.orderGroupId} />)}
        </section>
      )}

      {hasFilters && filteredGroups.length > 0 && (
        <button className="order-history-reset" type="button" onClick={clearFilters}>Đặt lại bộ lọc</button>
      )}
    </main>
  );
}

function OrderGroupCard({ group }: { group: CustomerOrderGroupListItem }) {
  const productCount = group.orders.reduce(
    (total, order) => total + order.items.reduce((quantity, item) => quantity + item.quantity, 0),
    0,
  );

  return (
    <article className="order-group-card order-history-group">
      <header>
        <div className="order-history-group__identity">
          <span aria-hidden="true">▣</span>
          <div>
            <strong>Nhóm đơn #{group.orderGroupId}</strong>
            <p><time dateTime={group.createdAt}>{formatOrderDate(group.createdAt)}</time><i aria-hidden="true">•</i>{group.orders.length} đơn theo gian hàng</p>
          </div>
        </div>
        <div className="order-group-card__payment">
          {group.payment ? (
            <>
              <strong>{PAYMENT_METHOD_LABELS[group.payment.paymentMethod]}</strong>
              <span className={`payment-state is-${group.payment.status.toLowerCase()}`}>{PAYMENT_STATUS_LABELS[group.payment.status]}</span>
            </>
          ) : <span className="payment-state is-missing">Chưa có thanh toán</span>}
        </div>
      </header>

      <div className="order-group-card__orders order-history-group__orders">
        {group.orders.map((order) => (
          <section className="order-history-shop" key={order.orderId}>
            <header className="order-history-shop__header">
              <div className="order-history-shop__identity">
                <OrderMedia
                  imageUrl={order.shopLogoUrl}
                  name={order.shopName}
                  className="order-history-shop__logo"
                />
                <div>
                  <strong>{order.shopName}</strong>
                  <small>Gian hàng #{order.shopId}</small>
                </div>
              </div>
              <div className="order-history-shop__meta">
                <div>
                  <span>Đơn hàng #{order.orderId}</span>
                  <time dateTime={order.createdAt}>{formatOrderDate(order.createdAt)}</time>
                </div>
                <span className={`order-status is-${order.status.toLowerCase()}`}>{ORDER_STATUS_LABELS[order.status]}</span>
              </div>
            </header>

            <div className="order-history-products">
              {order.items.length > 0 ? order.items.map((item) => (
                <article className="order-history-product" key={item.orderItemId}>
                  <Link
                    className="order-history-product__media"
                    to={`/products/${item.productId}`}
                    aria-label={`Xem ${item.productName}`}
                  >
                    <OrderMedia imageUrl={item.imageUrl} name={item.productName} />
                  </Link>
                  <div className="order-history-product__copy">
                    <Link to={`/products/${item.productId}`}>{item.productName}</Link>
                    <span>Đơn giá {formatCurrency(item.unitPrice)} <i aria-hidden="true">×</i> {item.quantity}</span>
                  </div>
                  <div className="order-history-product__price">
                    <small>Thành tiền</small>
                    <strong>{formatCurrency(item.subtotal)}</strong>
                  </div>
                </article>
              )) : (
                <p className="order-history-products__empty">Chưa có thông tin sản phẩm cho đơn hàng này.</p>
              )}
            </div>

            <footer className="order-history-shop__total">
              <span>{order.items.length} mặt hàng</span>
              <div><small>Tổng tiền gian hàng</small><strong>{formatCurrency(order.totalAmount)}</strong></div>
            </footer>
          </section>
        ))}
      </div>

      <footer>
        <span>{productCount} sản phẩm từ {group.orders.length} gian hàng</span>
        <div className="order-history-group__total">
          <small>Tổng nhóm đơn</small>
          <strong>{formatCurrency(group.totalAmount)}</strong>
          <Link to={`/orders/${group.orderGroupId}`}>Xem chi tiết</Link>
        </div>
      </footer>
    </article>
  );
}

function OrderMedia({
  imageUrl,
  name,
  className = '',
}: {
  imageUrl: string | null;
  name: string;
  className?: string;
}) {
  const [hasImageError, setHasImageError] = useState(false);
  const fallback = name.trim().charAt(0).toLocaleUpperCase('vi') || 'M';

  return (
    <span className={`order-history-media ${className}`.trim()}>
      {imageUrl && !hasImageError ? (
        <img src={imageUrl} alt="" onError={() => setHasImageError(true)} />
      ) : (
        <span aria-hidden="true">{fallback}</span>
      )}
    </span>
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
