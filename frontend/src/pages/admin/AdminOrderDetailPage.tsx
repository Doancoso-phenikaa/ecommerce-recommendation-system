import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getAdminOrderDetail } from '../../api/admin-order.api';
import type { AdminOrderDetailResponse } from '../../types/admin-order';
import { getApiErrorMessage } from '../../utils/auth';
import { formatCurrency } from '../../utils/format-currency';
import {
  formatOrderDate,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
} from '../../utils/order';
import './admin-order.css';

export function AdminOrderDetailPage() {
  const { orderId = '' } = useParams();
  const [order, setOrder] = useState<AdminOrderDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const requestIdRef = useRef(0);

  const loadOrder = useCallback(async (showLoading = true) => {
    if (!/^[1-9]\d*$/.test(orderId)) {
      setErrorMessage('Không tìm thấy đơn hàng phù hợp.');
      setIsLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    if (showLoading) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      const response = await getAdminOrderDetail(orderId);
      if (requestId !== requestIdRef.current) return;
      setOrder(response);
      setErrorMessage('');
    } catch (error: unknown) {
      if (requestId !== requestIdRef.current) return;
      setErrorMessage(
        getApiErrorMessage(error, 'Không thể tải thông tin đơn hàng.'),
      );
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [orderId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadOrder(), 0);
    const handleFocus = () => void loadOrder(false);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.clearTimeout(timer);
      requestIdRef.current += 1;
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadOrder]);

  if (isLoading) {
    return <main className="admin-order-page"><AdminOrderDetailHeading orderId={orderId} /><AdminOrderDetailSkeleton /></main>;
  }

  if (!order) {
    return (
      <main className="admin-order-page">
        <AdminOrderDetailHeading orderId={orderId} />
        <section className="admin-order-state is-error">
          <span aria-hidden="true">!</span>
          <h2>Không thể tải thông tin đơn hàng.</h2>
          <p>{errorMessage || 'Không tìm thấy đơn hàng phù hợp.'}</p>
          <div><button type="button" onClick={() => void loadOrder()}>Thử lại</button><Link to="/admin/orders">Về danh sách đơn hàng</Link></div>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-order-page">
      <AdminOrderDetailHeading orderId={order.orderId} isRefreshing={isRefreshing} />

      {errorMessage && (
        <div className="admin-order-inline-error" role="alert">
          <span>{errorMessage}</span>
          <button type="button" onClick={() => void loadOrder(false)}>Thử lại</button>
        </div>
      )}

      <div className="admin-order-detail-layout">
        <div className="admin-order-detail-main">
          <section className="admin-order-card admin-order-overview">
            <header>
              <div><small>Đơn hàng</small><h2>#{order.orderId}</h2><time dateTime={order.createdAt}>{formatOrderDate(order.createdAt)}</time></div>
              <span className={`admin-order-status is-${order.status.toLowerCase()}`}>{ORDER_STATUS_LABELS[order.status]}</span>
            </header>
            <dl>
              <div><dt>Nhóm đơn hàng</dt><dd>#{order.orderGroupId}</dd></div>
              <div><dt>Cập nhật gần nhất</dt><dd>{formatOrderDate(order.updatedAt)}</dd></div>
              <div><dt>Gian hàng</dt><dd>{order.shop.name} <small>#{order.shop.shopId}</small></dd></div>
            </dl>
          </section>

          <section className="admin-order-card admin-order-products">
            <header><span>01</span><div><h2>Sản phẩm</h2><p>{order.items.length} mặt hàng trong đơn</p></div></header>
            <div>
              {order.items.map((item) => (
                <article key={item.orderItemId}>
                  <div className="admin-order-product-image">
                    {item.imageUrl ? <img src={item.imageUrl} alt={item.productName} loading="lazy" /> : <span aria-hidden="true">{item.productName.charAt(0)}</span>}
                  </div>
                  <div><strong>{item.productName}</strong><small>Sản phẩm #{item.productId} · {formatCurrency(item.unitPrice)} × {item.quantity}</small></div>
                  <strong>{formatCurrency(item.subtotal)}</strong>
                </article>
              ))}
            </div>
          </section>

          <section className="admin-order-card admin-order-delivery">
            <header><span>02</span><div><h2>Khách hàng và giao hàng</h2><p>Thông tin phục vụ việc giám sát đơn</p></div></header>
            <dl>
              <div><dt>Khách hàng</dt><dd>{order.customer.fullName}</dd></div>
              <div><dt>Email</dt><dd>{order.customer.email}</dd></div>
              <div><dt>Điện thoại</dt><dd>{order.customer.phone || 'Không cung cấp'}</dd></div>
              <div><dt>Địa chỉ giao</dt><dd>{order.shippingAddress}</dd></div>
              <div><dt>Phương thức giao</dt><dd>{order.shippingMethod || 'Tiêu chuẩn'}</dd></div>
            </dl>
          </section>
        </div>

        <aside className="admin-order-detail-side">
          <section className="admin-order-card admin-order-readonly">
            <span>Chế độ giám sát</span>
            <h2>{ORDER_STATUS_LABELS[order.status]}</h2>
            <p>Admin chỉ theo dõi trạng thái. Việc xử lý đơn thuộc Customer và Seller.</p>
          </section>

          <section className="admin-order-card admin-order-payment">
            <span>Thanh toán OrderGroup</span>
            <h2>Thông tin thanh toán</h2>
            {order.payment ? (
              <dl>
                <div><dt>Mã thanh toán</dt><dd>#{order.payment.paymentId}</dd></div>
                <div><dt>Phương thức</dt><dd>{PAYMENT_METHOD_LABELS[order.payment.paymentMethod]}</dd></div>
                <div><dt>Trạng thái</dt><dd><span className={`admin-payment-status is-${order.payment.status.toLowerCase()}`}>{PAYMENT_STATUS_LABELS[order.payment.status]}</span></dd></div>
                <div><dt>Số tiền nhóm đơn</dt><dd>{formatCurrency(order.payment.amount)}</dd></div>
                {order.payment.paidAt && <div><dt>Thanh toán lúc</dt><dd>{formatOrderDate(order.payment.paidAt)}</dd></div>}
              </dl>
            ) : <p>OrderGroup chưa có thông tin thanh toán.</p>}
          </section>

          <section className="admin-order-card admin-order-totals">
            <h2>Giá trị đơn hàng</h2>
            <dl>
              <div><dt>Tạm tính</dt><dd>{formatCurrency(order.subtotal)}</dd></div>
              <div><dt>Giảm giá sản phẩm</dt><dd>− {formatCurrency(order.discountAmount)}</dd></div>
              <div><dt>Tổng tiền sản phẩm</dt><dd>{formatCurrency(order.totalAmount)}</dd></div>
              <div><dt>Tạm tính nhóm đơn</dt><dd>{formatCurrency(order.orderGroupSummary.subtotal)}</dd></div>
              <div><dt>Giảm sản phẩm nhóm đơn</dt><dd>− {formatCurrency(order.orderGroupSummary.productDiscountAmount)}</dd></div>
              <div><dt>Phí vận chuyển nền tảng</dt><dd>{formatCurrency(order.orderGroupSummary.shippingFee)}</dd></div>
              <div><dt>Giảm phí vận chuyển</dt><dd>− {formatCurrency(order.orderGroupSummary.shippingDiscountAmount)}</dd></div>
              <div><dt>Tổng nhóm đơn</dt><dd>{formatCurrency(order.orderGroupSummary.totalAmount)}</dd></div>
            </dl>
          </section>
        </aside>
      </div>
    </main>
  );
}

function AdminOrderDetailHeading({ orderId, isRefreshing = false }: { orderId: string; isRefreshing?: boolean }) {
  return (
    <header className="admin-order-heading admin-order-detail-heading">
      <div><span>Đơn hàng #{orderId || '—'}</span><h1>Chi tiết đơn hàng</h1><p>{isRefreshing ? 'Đang cập nhật trạng thái mới nhất...' : 'Theo dõi đầy đủ thông tin xử lý đơn hàng trên toàn sàn.'}</p></div>
      <Link to="/admin/orders">Quay lại danh sách</Link>
    </header>
  );
}

function AdminOrderDetailSkeleton() {
  return <div className="admin-order-detail-loading" aria-label="Đang tải thông tin đơn hàng" aria-busy="true"><section>{Array.from({ length: 5 }, (_, index) => <span key={index} />)}</section><aside>{Array.from({ length: 4 }, (_, index) => <span key={index} />)}</aside></div>;
}
