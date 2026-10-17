import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import {
  cancelCustomerOrder,
  confirmCustomerOrderReceived,
  getCustomerOrderDetail,
} from '../../api/order.api';
import { createReview, updateReview } from '../../api/review.api';
import { ReviewModal } from '../../components/review/ReviewModal';
import type {
  CustomerOrderDetailItem,
  CustomerOrderDetailOrder,
  CustomerOrderDetailResponse,
  OrderStatus,
} from '../../types/order';
import { getApiErrorMessage } from '../../utils/auth';
import { formatCurrency } from '../../utils/format-currency';
import {
  ORDER_PROGRESS,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  formatOrderDate,
} from '../../utils/order';
import './order.css';

interface OrderDetailLocationState {
  focusOrderId?: string;
}

interface ReviewTarget {
  orderId: string;
  item: CustomerOrderDetailItem;
}

export function OrderDetailPage() {
  const { orderGroupId = '' } = useParams();
  const location = useLocation();
  const focusOrderId = (location.state as OrderDetailLocationState | null)?.focusOrderId;
  const [orderGroup, setOrderGroup] = useState<CustomerOrderDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [orderToCancel, setOrderToCancel] = useState<CustomerOrderDetailOrder | null>(null);
  const [orderToReceive, setOrderToReceive] = useState<CustomerOrderDetailOrder | null>(null);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [receivingOrderId, setReceivingOrderId] = useState<string | null>(null);
  const [reviewTarget, setReviewTarget] = useState<ReviewTarget | null>(null);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const requestIdRef = useRef(0);

  const loadOrderDetail = useCallback(async (showLoading = true) => {
    if (!/^[1-9]\d*$/.test(orderGroupId)) {
      setErrorMessage('Không tìm thấy đơn hàng phù hợp.');
      setIsLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    if (showLoading) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      const response = await getCustomerOrderDetail(orderGroupId);
      if (requestId !== requestIdRef.current) return;
      setOrderGroup(response);
      setErrorMessage('');
    } catch (error: unknown) {
      if (requestId !== requestIdRef.current) return;
      const message = getApiErrorMessage(error, 'Không thể tải thông tin đơn hàng.');
      setErrorMessage(message.toLowerCase().includes('not found')
        ? 'Không tìm thấy đơn hàng hoặc bạn không có quyền xem đơn hàng này.'
        : message);
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [orderGroupId]);

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

  const handleCancelOrder = async () => {
    if (!orderToCancel || cancellingOrderId) return;

    const targetOrder = orderToCancel;
    setCancellingOrderId(targetOrder.orderId);
    setActionError('');
    setActionSuccess('');

    try {
      await cancelCustomerOrder(targetOrder.orderId);
      setOrderToCancel(null);
      setActionSuccess(`Đã hủy đơn hàng #${targetOrder.orderId}.`);
      await loadOrderDetail(false);
    } catch (error: unknown) {
      setOrderToCancel(null);
      setActionError(getApiErrorMessage(error, 'Không thể hủy đơn hàng.'));
      // Refresh even after rejection: the seller may have changed the status
      // while this customer was viewing a stale PENDING order.
      await loadOrderDetail(false);
    } finally {
      setCancellingOrderId(null);
    }
  };

  const handleConfirmReceived = async () => {
    if (!orderToReceive || receivingOrderId) return;

    const targetOrder = orderToReceive;
    setReceivingOrderId(targetOrder.orderId);
    setActionError('');
    setActionSuccess('');

    try {
      await confirmCustomerOrderReceived(targetOrder.orderId);
      setOrderToReceive(null);
      setActionSuccess(`Đã xác nhận nhận đơn hàng #${targetOrder.orderId}.`);
      await loadOrderDetail(false);
    } catch (error: unknown) {
      setOrderToReceive(null);
      setActionError(getApiErrorMessage(error, 'Không thể xác nhận đã nhận hàng.'));
      await loadOrderDetail(false);
    } finally {
      setReceivingOrderId(null);
    }
  };

  const handleReviewSubmit = async ({
    rating,
    comment,
  }: {
    rating: number;
    comment: string;
  }) => {
    if (!reviewTarget || isSubmittingReview) return;

    const target = reviewTarget;
    const isEditing = target.item.review !== null;
    setIsSubmittingReview(true);
    setActionError('');
    setActionSuccess('');

    try {
      if (target.item.review) {
        await updateReview(target.item.review.reviewId, { rating, comment });
      } else {
        await createReview({
          orderId: target.orderId,
          productId: target.item.productId,
          rating,
          comment,
        });
      }

      setReviewTarget(null);
      setActionSuccess(
        isEditing
          ? 'Đã cập nhật đánh giá.'
          : 'Đánh giá sản phẩm thành công.',
      );
      await loadOrderDetail(false);
    } catch (error: unknown) {
      setReviewTarget(null);
      setActionError(
        getApiErrorMessage(
          error,
          isEditing
            ? 'Không thể cập nhật đánh giá.'
            : 'Không thể gửi đánh giá.',
        ),
      );
      // Refresh stale data so a duplicate review created in another tab is shown.
      await loadOrderDetail(false);
    } finally {
      setIsSubmittingReview(false);
    }
  };

  if (isLoading) {
    return (
      <main className="order-page">
        <OrderDetailHeading orderGroupId={orderGroupId} />
        <OrderDetailSkeleton />
      </main>
    );
  }

  if (!orderGroup) {
    return (
      <main className="order-page">
        <OrderDetailHeading orderGroupId={orderGroupId} />
        <section className="order-detail-error" role="alert">
          <span aria-hidden="true">!</span>
          <h2>Không thể tải thông tin đơn hàng</h2>
          <p>{errorMessage || 'Không tìm thấy đơn hàng hoặc bạn không có quyền xem.'}</p>
          <div><button type="button" onClick={() => void loadOrderDetail()}>Thử lại</button><Link to="/orders">Về lịch sử đơn hàng</Link></div>
        </section>
      </main>
    );
  }

  return (
    <main className="order-page">
      <OrderDetailHeading orderGroupId={orderGroup.orderGroupId} isRefreshing={isRefreshing} />

      {errorMessage && (
        <div className="order-alert" role="alert">
          <div><strong>Chưa thể cập nhật trạng thái mới nhất</strong><p>{errorMessage}</p></div>
          <button type="button" onClick={() => void loadOrderDetail(false)}>Thử lại</button>
        </div>
      )}

      {actionSuccess && (
        <div className="order-action-message is-success" role="status">
          <span aria-hidden="true">✓</span><p>{actionSuccess}</p>
          <button type="button" onClick={() => setActionSuccess('')} aria-label="Đóng thông báo">×</button>
        </div>
      )}

      {actionError && (
        <div className="order-action-message is-error" role="alert">
          <span aria-hidden="true">!</span><div><strong>Không thể xử lý đơn hàng</strong><p>{actionError}</p></div>
          <button type="button" onClick={() => setActionError('')} aria-label="Đóng thông báo">×</button>
        </div>
      )}

      <div className="order-detail-layout">
        <section className="order-detail-orders" aria-label="Các đơn hàng theo gian hàng">
          {orderGroup.orders.map((order) => (
            <OrderDetailCard
              order={order}
              isFocused={focusOrderId === order.orderId}
              isCancelling={cancellingOrderId === order.orderId}
              isReceiving={receivingOrderId === order.orderId}
              onRequestCancel={setOrderToCancel}
              onRequestReceived={setOrderToReceive}
              onRequestReview={(item) => setReviewTarget({
                orderId: order.orderId,
                item,
              })}
              key={order.orderId}
            />
          ))}
        </section>

        <aside className="order-detail-summary">
          <section>
            <span className="order-detail-summary__eyebrow">Thanh toán chung</span>
            <h2>Thông tin thanh toán</h2>
            {orderGroup.payment ? (
              <dl>
                <div><dt>Mã thanh toán</dt><dd>#{orderGroup.payment.paymentId}</dd></div>
                <div><dt>Phương thức</dt><dd>{PAYMENT_METHOD_LABELS[orderGroup.payment.paymentMethod]}</dd></div>
                <div><dt>Trạng thái</dt><dd><span className={`payment-state is-${orderGroup.payment.status.toLowerCase()}`}>{PAYMENT_STATUS_LABELS[orderGroup.payment.status]}</span></dd></div>
                <div><dt>Số tiền</dt><dd>{formatCurrency(orderGroup.payment.amount)}</dd></div>
                {orderGroup.payment.paidAt && <div><dt>Thanh toán lúc</dt><dd>{formatOrderDate(orderGroup.payment.paidAt)}</dd></div>}
              </dl>
            ) : <p className="order-detail-summary__missing">Nhóm đơn hàng chưa có thông tin thanh toán.</p>}
          </section>

          <section className="order-detail-summary__total">
            <div><span>Tổng nhóm đơn</span><strong>{formatCurrency(orderGroup.totalAmount)}</strong></div>
            <small>{orderGroup.orders.length} đơn hàng theo gian hàng</small>
          </section>
        </aside>
      </div>

      {orderToCancel && (
        <CancelOrderModal
          order={orderToCancel}
          isSubmitting={cancellingOrderId === orderToCancel.orderId}
          onClose={() => {
            if (!cancellingOrderId) setOrderToCancel(null);
          }}
          onConfirm={() => void handleCancelOrder()}
        />
      )}

      {orderToReceive && (
        <ReceiveOrderModal
          order={orderToReceive}
          isSubmitting={receivingOrderId === orderToReceive.orderId}
          onClose={() => {
            if (!receivingOrderId) setOrderToReceive(null);
          }}
          onConfirm={() => void handleConfirmReceived()}
        />
      )}

      {reviewTarget && (
        <ReviewModal
          product={{
            productName: reviewTarget.item.productName,
            imageUrl: reviewTarget.item.imageUrl,
          }}
          orderId={reviewTarget.orderId}
          review={reviewTarget.item.review}
          isSubmitting={isSubmittingReview}
          onClose={() => {
            if (!isSubmittingReview) setReviewTarget(null);
          }}
          onSubmit={(value) => void handleReviewSubmit(value)}
        />
      )}
    </main>
  );
}

function OrderDetailHeading({
  orderGroupId,
  isRefreshing = false,
}: {
  orderGroupId: string;
  isRefreshing?: boolean;
}) {
  return (
    <header className="order-heading order-detail-heading">
      <div>
        <span>Nhóm đơn hàng #{orderGroupId || '—'}</span>
        <h1>Chi tiết đơn hàng</h1>
        <p>{isRefreshing ? 'Đang cập nhật trạng thái mới nhất...' : 'Thông tin từng đơn theo gian hàng trong lần đặt hàng này.'}</p>
      </div>
      <Link to="/orders">Quay lại lịch sử</Link>
    </header>
  );
}

function OrderDetailCard({
  order,
  isFocused,
  isCancelling,
  isReceiving,
  onRequestCancel,
  onRequestReceived,
  onRequestReview,
}: {
  order: CustomerOrderDetailOrder;
  isFocused: boolean;
  isCancelling: boolean;
  isReceiving: boolean;
  onRequestCancel: (order: CustomerOrderDetailOrder) => void;
  onRequestReceived: (order: CustomerOrderDetailOrder) => void;
  onRequestReview: (item: CustomerOrderDetailItem) => void;
}) {
  return (
    <article className={`order-detail-card${isFocused ? ' is-focused' : ''}`} id={`order-${order.orderId}`}>
      <header>
        <div className="order-detail-card__shop">
          <span aria-hidden="true">M</span>
          <div><strong>{order.shopName}</strong><small>Gian hàng #{order.shopId}</small></div>
        </div>
        <div className="order-detail-card__meta">
          <span className={`order-status is-${order.status.toLowerCase()}`}>{ORDER_STATUS_LABELS[order.status]}</span>
          <strong>Đơn hàng #{order.orderId}</strong>
          <time dateTime={order.createdAt}>{formatOrderDate(order.createdAt)}</time>
          {order.status === 'PENDING' && (
            <button
              className="order-cancel-button"
              type="button"
              onClick={() => onRequestCancel(order)}
              disabled={isCancelling}
            >
              {isCancelling ? 'Đang hủy...' : 'Hủy đơn hàng'}
            </button>
          )}
          {order.status === 'SHIPPING' && (
            <button
              className="order-received-button"
              type="button"
              onClick={() => onRequestReceived(order)}
              disabled={isReceiving}
            >
              {isReceiving ? 'Đang xác nhận...' : 'Đã nhận được hàng'}
            </button>
          )}
        </div>
      </header>

      <OrderTimeline status={order.status} />

      <section className="order-detail-products" aria-label={`Sản phẩm trong đơn hàng ${order.orderId}`}>
        <h3>Sản phẩm</h3>
        {order.items.map((item) => (
          <div className="order-detail-product" key={item.orderItemId}>
            <Link className="order-detail-product__media" to={`/products/${item.productId}`} aria-label={`Xem ${item.productName}`}>
              {item.imageUrl
                ? <img src={item.imageUrl} alt={item.productName} loading="lazy" />
                : <span aria-hidden="true">{item.productName.charAt(0)}</span>}
            </Link>
            <div className="order-detail-product__content">
              <Link to={`/products/${item.productId}`}>{item.productName}</Link>
              <small>{formatCurrency(item.unitPrice)} × {item.quantity}</small>
              {order.status === 'COMPLETED' && item.review && (
                <div className="order-item-review">
                  <span className="order-item-review__stars" aria-label={`${item.review.rating} sao`}>
                    {'★'.repeat(item.review.rating)}{'☆'.repeat(5 - item.review.rating)}
                  </span>
                  {item.review.comment && <p>{item.review.comment}</p>}
                  {item.review.status === 'HIDDEN' && <small>Đánh giá này hiện đang bị ẩn.</small>}
                </div>
              )}
            </div>
            <div className="order-detail-product__actions">
              <strong>{formatCurrency(item.subtotal)}</strong>
              {order.status === 'COMPLETED' && (
                <button type="button" onClick={() => onRequestReview(item)}>
                  {item.review ? 'Chỉnh sửa đánh giá' : 'Đánh giá sản phẩm'}
                </button>
              )}
            </div>
          </div>
        ))}
      </section>

      <div className="order-detail-card__lower">
        <section className="order-shipping">
          <h3>Thông tin giao hàng</h3>
          <dl>
            <div><dt>Địa chỉ</dt><dd>{order.shippingAddress}</dd></div>
            <div><dt>Phương thức</dt><dd>{order.shippingMethod || 'Tiêu chuẩn'}</dd></div>
          </dl>
        </section>

        <section className="order-totals">
          <h3>Thành tiền</h3>
          <dl>
            <div><dt>Tạm tính</dt><dd>{formatCurrency(order.subtotal)}</dd></div>
            <div><dt>Giảm giá</dt><dd>− {formatCurrency(order.discountAmount)}</dd></div>
            <div><dt>Phí giao hàng</dt><dd>{formatCurrency(order.shippingFee)}</dd></div>
            <div><dt>Tổng cộng</dt><dd>{formatCurrency(order.totalAmount)}</dd></div>
          </dl>
        </section>
      </div>

      {order.status === 'PENDING' && <footer className="order-detail-card__notice">Bạn chỉ có thể hủy đơn hàng này khi gian hàng chưa xác nhận.</footer>}
      {order.status === 'SHIPPING' && <footer className="order-detail-card__notice is-received">Chỉ xác nhận khi bạn đã nhận và kiểm tra đúng đơn hàng từ gian hàng này.</footer>}
    </article>
  );
}

function CancelOrderModal({
  order,
  isSubmitting,
  onClose,
  onConfirm,
}: {
  order: CustomerOrderDetailOrder;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSubmitting, onClose]);

  return (
    <div className="order-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !isSubmitting) onClose();
    }}>
      <section className="order-cancel-modal" role="dialog" aria-modal="true" aria-labelledby="cancel-order-title">
        <span className="order-cancel-modal__mark" aria-hidden="true">!</span>
        <h2 id="cancel-order-title">Hủy đơn hàng?</h2>
        <p>Bạn chỉ đang hủy đơn hàng của gian hàng này. Các đơn hàng khác trong cùng lần đặt hàng vẫn tiếp tục xử lý.</p>
        <dl>
          <div><dt>Gian hàng</dt><dd>{order.shopName}</dd></div>
          <div><dt>Mã đơn hàng</dt><dd>#{order.orderId}</dd></div>
        </dl>
        <div className="order-cancel-modal__actions">
          <button type="button" onClick={onClose} disabled={isSubmitting}>Quay lại</button>
          <button type="button" onClick={onConfirm} disabled={isSubmitting}>{isSubmitting ? 'Đang hủy...' : 'Xác nhận hủy'}</button>
        </div>
      </section>
    </div>
  );
}

function ReceiveOrderModal({
  order,
  isSubmitting,
  onClose,
  onConfirm,
}: {
  order: CustomerOrderDetailOrder;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSubmitting, onClose]);

  return (
    <div className="order-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !isSubmitting) onClose();
    }}>
      <section className="order-cancel-modal order-received-modal" role="dialog" aria-modal="true" aria-labelledby="receive-order-title">
        <span className="order-cancel-modal__mark" aria-hidden="true">✓</span>
        <h2 id="receive-order-title">Xác nhận đã nhận hàng?</h2>
        <p>Hãy chỉ xác nhận sau khi bạn đã nhận và kiểm tra đơn hàng. Sau bước này, đơn sẽ được đánh dấu hoàn thành.</p>
        <dl>
          <div><dt>Gian hàng</dt><dd>{order.shopName}</dd></div>
          <div><dt>Mã đơn hàng</dt><dd>#{order.orderId}</dd></div>
        </dl>
        <div className="order-cancel-modal__actions">
          <button type="button" onClick={onClose} disabled={isSubmitting}>Quay lại</button>
          <button type="button" onClick={onConfirm} disabled={isSubmitting}>{isSubmitting ? 'Đang xác nhận...' : 'Xác nhận đã nhận'}</button>
        </div>
      </section>
    </div>
  );
}

function OrderTimeline({ status }: { status: OrderStatus }) {
  if (status === 'CANCELLED') {
    return <div className="order-timeline order-timeline--cancelled"><span aria-hidden="true">×</span><div><strong>Đơn hàng đã hủy</strong><small>Quy trình giao hàng đã dừng.</small></div></div>;
  }

  const currentIndex = ORDER_PROGRESS.indexOf(status);

  return (
    <ol className="order-timeline" aria-label={`Trạng thái: ${ORDER_STATUS_LABELS[status]}`}>
      {ORDER_PROGRESS.map((step, index) => (
        <li className={index <= currentIndex ? 'is-reached' : ''} key={step}>
          <span aria-hidden="true">{index < currentIndex ? '✓' : index + 1}</span>
          <small>{ORDER_STATUS_LABELS[step]}</small>
        </li>
      ))}
    </ol>
  );
}

function OrderDetailSkeleton() {
  return (
    <div className="order-detail-loading" aria-label="Đang tải thông tin đơn hàng" aria-busy="true">
      <section>{Array.from({ length: 5 }, (_, index) => <span key={index} />)}</section>
      <aside>{Array.from({ length: 4 }, (_, index) => <span key={index} />)}</aside>
    </div>
  );
}
