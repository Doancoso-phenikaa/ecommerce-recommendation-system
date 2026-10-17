import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  cancelSellerOrder,
  confirmSellerOrder,
  getSellerOrderDetail,
  markSellerOrderShipping,
} from '../../api/seller-order.api';
import type { SellerOrderDetailResponse } from '../../types/order';
import { getApiErrorMessage } from '../../utils/auth';
import { formatCurrency } from '../../utils/format-currency';
import {
  formatOrderDate,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
} from '../../utils/order';
import './seller-order.css';
import './seller-order-detail.css';

type SellerOrderAction = 'confirm' | 'shipping' | 'cancel';

const actionCopy: Record<SellerOrderAction, {
  title: string;
  description: string;
  confirmLabel: string;
  loadingLabel: string;
  successLabel: string;
  destructive?: boolean;
}> = {
  confirm: {
    title: 'Xác nhận đơn hàng?',
    description: 'Đơn hàng sẽ chuyển sang trạng thái đã xác nhận và sẵn sàng để chuẩn bị giao.',
    confirmLabel: 'Xác nhận đơn',
    loadingLabel: 'Đang xác nhận...',
    successLabel: 'Đã xác nhận đơn hàng',
  },
  shipping: {
    title: 'Bắt đầu giao hàng?',
    description: 'Chỉ xác nhận khi đơn hàng đã được chuẩn bị và bàn giao cho quá trình vận chuyển.',
    confirmLabel: 'Bắt đầu giao hàng',
    loadingLabel: 'Đang cập nhật...',
    successLabel: 'Đơn hàng đã chuyển sang đang giao',
  },
  cancel: {
    title: 'Hủy đơn hàng?',
    description: 'Đơn hàng sẽ bị hủy và lượng tồn kho đang giữ chỗ sẽ được hoàn lại. Thao tác này không thể đảo ngược.',
    confirmLabel: 'Xác nhận hủy',
    loadingLabel: 'Đang hủy...',
    successLabel: 'Đã hủy đơn hàng',
    destructive: true,
  },
};

export function SellerOrderDetailPage() {
  const { orderId = '' } = useParams();
  const [order, setOrder] = useState<SellerOrderDetailResponse | null>(null);
  const [selectedAction, setSelectedAction] = useState<SellerOrderAction | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const requestIdRef = useRef(0);

  const loadOrderDetail = useCallback(async (showLoading = true) => {
    if (!/^[1-9]\d*$/.test(orderId)) {
      setErrorMessage('Không tìm thấy đơn hàng phù hợp.');
      setIsLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    if (showLoading) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      const response = await getSellerOrderDetail(orderId);
      if (requestId !== requestIdRef.current) return;
      setOrder(response);
      setErrorMessage('');
    } catch (error: unknown) {
      if (requestId !== requestIdRef.current) return;
      const message = getApiErrorMessage(error, 'Không thể tải thông tin đơn hàng.');
      setErrorMessage(message.toLowerCase().includes('not found')
        ? 'Không tìm thấy đơn hàng hoặc đơn hàng không thuộc gian hàng của bạn.'
        : message);
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [orderId]);

  useEffect(() => {
    const initialLoadTimer = window.setTimeout(() => void loadOrderDetail(), 0);
    const handleFocus = () => void loadOrderDetail(false);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.clearTimeout(initialLoadTimer);
      requestIdRef.current += 1;
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadOrderDetail]);

  const handleTransition = async () => {
    if (!selectedAction || !order || isTransitioning) return;
    const action = selectedAction;
    const currentOrderId = order.orderId;
    setIsTransitioning(true);
    setActionError('');
    setSuccessMessage('');

    try {
      if (action === 'confirm') await confirmSellerOrder(currentOrderId);
      else if (action === 'shipping') await markSellerOrderShipping(currentOrderId);
      else await cancelSellerOrder(currentOrderId);

      setSelectedAction(null);
      setSuccessMessage(`${actionCopy[action].successLabel} #${currentOrderId}.`);
      await loadOrderDetail(false);
    } catch (error: unknown) {
      setSelectedAction(null);
      setActionError(getApiErrorMessage(error, 'Không thể cập nhật trạng thái đơn hàng.'));
      // Refresh stale state after a rejected transition (for example, the
      // customer cancelled this order in another browser profile).
      await loadOrderDetail(false);
    } finally {
      setIsTransitioning(false);
    }
  };

  if (isLoading) {
    return <main className="seller-order-page"><SellerOrderDetailHeading orderId={orderId} /><SellerOrderDetailSkeleton /></main>;
  }

  if (!order) {
    return (
      <main className="seller-order-page">
        <SellerOrderDetailHeading orderId={orderId} />
        <section className="seller-order-detail-error"><span aria-hidden="true">!</span><h2>Không thể tải thông tin đơn hàng</h2><p>{errorMessage || 'Không tìm thấy đơn hàng phù hợp.'}</p><div><button type="button" onClick={() => void loadOrderDetail()}>Thử lại</button><Link to="/seller/orders">Về danh sách đơn hàng</Link></div></section>
      </main>
    );
  }

  return (
    <main className="seller-order-page">
      <SellerOrderDetailHeading orderId={order.orderId} isRefreshing={isRefreshing} />

      {errorMessage && <div className="seller-order-alert" role="alert"><div><strong>Chưa thể cập nhật dữ liệu mới nhất</strong><p>{errorMessage}</p></div><button type="button" onClick={() => void loadOrderDetail(false)}>Thử lại</button></div>}
      {successMessage && <div className="seller-order-feedback is-success" role="status"><span>✓</span><p>{successMessage}</p><button type="button" onClick={() => setSuccessMessage('')} aria-label="Đóng thông báo">×</button></div>}
      {actionError && <div className="seller-order-feedback is-error" role="alert"><span>!</span><div><strong>Không thể xử lý đơn hàng</strong><p>{actionError}</p></div><button type="button" onClick={() => setActionError('')} aria-label="Đóng thông báo">×</button></div>}

      <div className="seller-order-detail-layout">
        <div className="seller-order-detail-main">
          <section className="seller-order-detail-card seller-order-overview">
            <header><div><small>Đơn hàng</small><h2>#{order.orderId}</h2><time dateTime={order.createdAt}>{formatOrderDate(order.createdAt)}</time></div><span className={`seller-order-status is-${order.status.toLowerCase()}`}>{ORDER_STATUS_LABELS[order.status]}</span></header>
            <dl>
              <div><dt>Nhóm đơn hàng</dt><dd>#{order.orderGroupId}</dd></div>
              <div><dt>Cập nhật gần nhất</dt><dd>{formatOrderDate(order.updatedAt)}</dd></div>
            </dl>
          </section>

          <section className="seller-order-detail-card seller-order-products">
            <header><span>01</span><div><h2>Sản phẩm</h2><p>{order.items.length} mặt hàng trong đơn</p></div></header>
            <div>{order.items.map((item) => (
              <article key={item.orderItemId}>
                <span className="seller-order-product-media">
                  {item.imageUrl
                    ? <img src={item.imageUrl} alt={item.productName} loading="lazy" />
                    : <span aria-hidden="true">{item.productName.charAt(0)}</span>}
                </span>
                <div><strong>{item.productName}</strong><small>{formatCurrency(item.unitPrice)} × {item.quantity}</small></div>
                <strong>{formatCurrency(item.subtotal)}</strong>
              </article>
            ))}</div>
          </section>

          <section className="seller-order-detail-card seller-order-shipping">
            <header><span>02</span><div><h2>Thông tin giao hàng</h2><p>Địa chỉ nhận hàng của khách</p></div></header>
            <dl><div><dt>Địa chỉ</dt><dd>{order.shippingAddress}</dd></div><div><dt>Phương thức</dt><dd>{order.shippingMethod || 'Tiêu chuẩn'}</dd></div></dl>
          </section>
        </div>

        <aside className="seller-order-detail-side">
          <section className="seller-order-actions-card">
            <span className="seller-order-actions-card__eyebrow">Trạng thái hiện tại</span>
            <h2>{ORDER_STATUS_LABELS[order.status]}</h2>
            <p>Backend sẽ kiểm tra lại trạng thái và Payment trước khi cho phép chuyển bước.</p>
            <SellerOrderActions order={order} isBusy={isTransitioning} onSelect={setSelectedAction} />
          </section>

          <section className="seller-order-payment-card">
            <span className="seller-order-payment-card__eyebrow">Thanh toán chung</span>
            <h2>Thanh toán</h2>
            {order.payment ? (
              <dl>
                <div><dt>Phương thức</dt><dd>{PAYMENT_METHOD_LABELS[order.payment.paymentMethod]}</dd></div>
                <div><dt>Trạng thái</dt><dd><span className={`seller-payment-status is-${order.payment.status.toLowerCase()}`}>{PAYMENT_STATUS_LABELS[order.payment.status]}</span></dd></div>
                <div><dt>Số tiền</dt><dd>{formatCurrency(order.payment.amount)}</dd></div>
                {order.payment.paidAt && <div><dt>Thanh toán lúc</dt><dd>{formatOrderDate(order.payment.paidAt)}</dd></div>}
              </dl>
            ) : <p>Chưa có thông tin thanh toán</p>}
          </section>

          <section className="seller-order-totals-card">
            <h2>Giá trị đơn hàng</h2>
            <dl><div><dt>Tạm tính</dt><dd>{formatCurrency(order.subtotal)}</dd></div><div><dt>Giảm giá</dt><dd>− {formatCurrency(order.discountAmount)}</dd></div><div><dt>Phí giao hàng</dt><dd>{formatCurrency(order.shippingFee)}</dd></div><div><dt>Tổng cộng</dt><dd>{formatCurrency(order.totalAmount)}</dd></div></dl>
          </section>
        </aside>
      </div>

      {selectedAction && (
        <SellerOrderActionModal
          action={selectedAction}
          orderId={order.orderId}
          isSubmitting={isTransitioning}
          onClose={() => { if (!isTransitioning) setSelectedAction(null); }}
          onConfirm={() => void handleTransition()}
        />
      )}
    </main>
  );
}

function SellerOrderActions({ order, isBusy, onSelect }: { order: SellerOrderDetailResponse; isBusy: boolean; onSelect: (action: SellerOrderAction) => void }) {
  if (order.status === 'PENDING') return <div className="seller-order-actions"><button type="button" onClick={() => onSelect('confirm')} disabled={isBusy}>Xác nhận đơn</button><button className="is-danger" type="button" onClick={() => onSelect('cancel')} disabled={isBusy}>Hủy đơn</button></div>;
  if (order.status === 'CONFIRMED') return <div className="seller-order-actions"><button type="button" onClick={() => onSelect('shipping')} disabled={isBusy}>Bắt đầu giao hàng</button></div>;
  if (order.status === 'SHIPPING') return <p className="seller-order-actions-empty">Đơn hàng đang được giao. Chờ khách hàng xác nhận đã nhận hàng.</p>;
  if (order.status === 'COMPLETED') return <p className="seller-order-actions-empty">Khách hàng đã xác nhận nhận hàng.</p>;
  return <p className="seller-order-actions-empty">Đơn hàng đã bị hủy.</p>;
}

function SellerOrderActionModal({ action, orderId, isSubmitting, onClose, onConfirm }: { action: SellerOrderAction; orderId: string; isSubmitting: boolean; onClose: () => void; onConfirm: () => void }) {
  const copy = actionCopy[action];
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !isSubmitting) onClose(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSubmitting, onClose]);

  return (
    <div className="seller-order-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSubmitting) onClose(); }}>
      <section className={`seller-order-modal${copy.destructive ? ' is-danger' : ''}`} role="dialog" aria-modal="true" aria-labelledby="seller-order-modal-title">
        <span aria-hidden="true">{copy.destructive ? '!' : '→'}</span><h2 id="seller-order-modal-title">{copy.title}</h2><p>{copy.description}</p><dl><div><dt>Mã đơn hàng</dt><dd>#{orderId}</dd></div></dl>
        <div><button type="button" onClick={onClose} disabled={isSubmitting}>Quay lại</button><button type="button" onClick={onConfirm} disabled={isSubmitting}>{isSubmitting ? copy.loadingLabel : copy.confirmLabel}</button></div>
      </section>
    </div>
  );
}

function SellerOrderDetailHeading({ orderId, isRefreshing = false }: { orderId: string; isRefreshing?: boolean }) {
  return <header className="seller-order-heading seller-order-detail-heading"><div><span>Đơn hàng #{orderId || '—'}</span><h1>Chi tiết đơn hàng</h1><p>{isRefreshing ? 'Đang cập nhật trạng thái mới nhất...' : 'Kiểm tra thông tin và xử lý đơn theo đúng trạng thái.'}</p></div><Link to="/seller/orders">Quay lại danh sách</Link></header>;
}

function SellerOrderDetailSkeleton() {
  return <div className="seller-order-detail-loading" aria-label="Đang tải thông tin đơn hàng" aria-busy="true"><section>{Array.from({ length: 5 }, (_, index) => <span key={index} />)}</section><aside>{Array.from({ length: 4 }, (_, index) => <span key={index} />)}</aside></div>;
}
