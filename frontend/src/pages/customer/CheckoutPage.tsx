import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { confirmCheckout, getCheckoutPreview } from '../../api/checkout.api';
import { createPayment } from '../../api/payment.api';
import type { CheckoutPreviewResponse } from '../../types/checkout';
import type { PaymentMethod, PaymentResultState } from '../../types/payment';
import { getApiErrorMessage } from '../../utils/auth';
import { formatCurrency } from '../../utils/format-currency';
import './checkout.css';
import './payment.css';

interface CreatedOrder {
  orderGroupId: string;
  totalAmount: string;
  orderCount: number;
}

type SubmissionPhase = 'idle' | 'order' | 'payment';

const paymentMethodLabels: Record<PaymentMethod, string> = {
  COD: 'Thanh toán khi nhận hàng (COD)',
  ONLINE: 'Thanh toán trực tuyến (mô phỏng)',
};

function getPreviewError(error: unknown): string {
  const message = getApiErrorMessage(error, 'Không thể tải thông tin đặt hàng.');
  return message.toLowerCase().includes('cart is empty')
    ? 'Giỏ hàng không có sản phẩm để đặt hàng.'
    : message;
}

export function CheckoutPage() {
  const navigate = useNavigate();
  const [preview, setPreview] = useState<CheckoutPreviewResponse | null>(null);
  const [shippingAddress, setShippingAddress] = useState('');
  const [productDiscountInput, setProductDiscountInput] = useState('');
  const [shippingDiscountInput, setShippingDiscountInput] = useState('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>('COD');
  const [createdOrder, setCreatedOrder] = useState<CreatedOrder | null>(null);
  const [submissionPhase, setSubmissionPhase] = useState<SubmissionPhase>('idle');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [checkoutError, setCheckoutError] = useState('');
  const [paymentError, setPaymentError] = useState('');

  const isSubmitting = submissionPhase !== 'idle';
  const isOrderLocked = createdOrder !== null;

  useEffect(() => {
    let isCurrent = true;

    void getCheckoutPreview()
      .then((response) => {
        if (isCurrent) setPreview(response);
      })
      .catch((error: unknown) => {
        if (isCurrent) setPreviewError(getPreviewError(error));
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  const totalQuantity = useMemo(
    () => preview?.shopGroups.reduce(
      (total, group) => total + group.items.reduce(
        (groupTotal, item) => groupTotal + item.quantity,
        0,
      ),
      0,
    ) ?? 0,
    [preview],
  );

  const reloadPreview = async (
    productDiscountCode = preview?.productDiscount?.code ?? '',
    shippingDiscountCode = preview?.shippingDiscount?.code ?? '',
  ) => {
    if (isRefreshing || isSubmitting || isOrderLocked) return;
    setIsRefreshing(true);
    setPreviewError('');
    setCheckoutError('');

    try {
      const response = await getCheckoutPreview({
        productDiscountCode: productDiscountCode || undefined,
        shippingDiscountCode: shippingDiscountCode || undefined,
      });
      setPreview(response);
      setProductDiscountInput(response.productDiscount?.code ?? '');
      setShippingDiscountInput(response.shippingDiscount?.code ?? '');
    } catch (error: unknown) {
      setPreviewError(getPreviewError(error));
    } finally {
      setIsRefreshing(false);
    }
  };

  const createPaymentForOrder = async (order: CreatedOrder) => {
    if (submissionPhase === 'payment') return;
    setSubmissionPhase('payment');
    setPaymentError('');

    try {
      const payment = await createPayment({
        orderGroupId: order.orderGroupId,
        paymentMethod: selectedPaymentMethod,
      });
      const resultState: PaymentResultState = {
        payment,
        orderCount: order.orderCount,
      };
      navigate('/checkout/payment/result', { replace: true, state: resultState });
    } catch (error: unknown) {
      setPaymentError(getApiErrorMessage(error, 'Không thể tạo thanh toán.'));
      setSubmissionPhase('idle');
    }
  };

  const handleApplyProductDiscount = () => {
    void reloadPreview(
      productDiscountInput.trim().toUpperCase(),
      preview?.shippingDiscount?.code ?? '',
    );
  };

  const handleApplyShippingDiscount = () => {
    void reloadPreview(
      preview?.productDiscount?.code ?? '',
      shippingDiscountInput.trim().toUpperCase(),
    );
  };

  const handleConfirm = async () => {
    if (!preview || isSubmitting || previewError || createdOrder) return;
    const normalizedAddress = shippingAddress.trim();

    if (!normalizedAddress) {
      setCheckoutError('Vui lòng nhập địa chỉ giao hàng.');
      return;
    }

    setSubmissionPhase('order');
    setCheckoutError('');
    setPaymentError('');

    try {
      const response = await confirmCheckout({
        shippingAddress: normalizedAddress,
        productDiscountCode: preview.productDiscount?.code,
        shippingDiscountCode: preview.shippingDiscount?.code,
      });
      const order: CreatedOrder = {
        orderGroupId: response.orderGroupId,
        totalAmount: response.totalAmount,
        orderCount: response.orders.length,
      };

      // Keep the successful order before starting payment. Payment retries must
      // never execute confirmCheckout() and create a duplicate OrderGroup.
      setCreatedOrder(order);
      await createPaymentForOrder(order);
    } catch (error: unknown) {
      setCheckoutError(getApiErrorMessage(error, 'Không thể tạo đơn hàng.'));
      setSubmissionPhase('idle');
    }
  };

  const handlePrimaryAction = () => {
    if (createdOrder) {
      void createPaymentForOrder(createdOrder);
      return;
    }
    void handleConfirm();
  };

  if (isLoading) {
    return (
      <main className="checkout-page">
        <CheckoutHeading isOrderLocked={false} />
        <CheckoutSkeleton />
      </main>
    );
  }

  if (!preview) {
    return (
      <main className="checkout-page">
        <CheckoutHeading isOrderLocked={false} />
        <section className="checkout-failure" role="alert">
          <span aria-hidden="true">!</span>
          <h2>Chưa thể chuẩn bị đơn hàng</h2>
          <p>{previewError || 'Không thể tải thông tin đặt hàng.'}</p>
          <div>
            <button type="button" onClick={() => void reloadPreview()} disabled={isRefreshing}>
              {isRefreshing ? 'Đang tải lại...' : 'Thử tải lại'}
            </button>
            <Link to="/cart">Quay lại giỏ hàng</Link>
          </div>
        </section>
      </main>
    );
  }

  const primaryButtonLabel = submissionPhase === 'order'
    ? 'Đang tạo đơn hàng...'
    : submissionPhase === 'payment'
      ? 'Đang tạo thanh toán...'
      : createdOrder
        ? 'Thử lại thanh toán'
        : 'Xác nhận đặt hàng';

  return (
    <main className="checkout-page">
      <CheckoutHeading isOrderLocked={isOrderLocked} />

      {(previewError || checkoutError) && !createdOrder && (
        <div className="checkout-alert" role="alert">
          <div>
            <strong>{checkoutError ? 'Không thể tạo đơn hàng' : 'Thông tin đơn hàng cần được kiểm tra lại'}</strong>
            <p>{checkoutError || previewError}</p>
          </div>
          <button type="button" onClick={() => void reloadPreview()} disabled={isRefreshing || isSubmitting}>
            {isRefreshing ? 'Đang cập nhật...' : 'Cập nhật lại đơn hàng'}
          </button>
        </div>
      )}

      {createdOrder && paymentError && (
        <div className="checkout-payment-error" role="alert">
          <span className="checkout-payment-error__mark" aria-hidden="true">!</span>
          <div>
            <strong>Đơn hàng đã được tạo nhưng chưa thể tạo thanh toán</strong>
            <p>{paymentError}</p>
            <small>Mã nhóm đơn hàng: #{createdOrder.orderGroupId}. Hệ thống sẽ không tạo lại đơn hàng khi thử lại.</small>
          </div>
          <button type="button" onClick={() => void createPaymentForOrder(createdOrder)} disabled={isSubmitting}>
            {submissionPhase === 'payment' ? 'Đang thử lại...' : 'Thử lại thanh toán'}
          </button>
        </div>
      )}

      <div className="checkout-layout">
        <div className="checkout-content">
          <section className="checkout-address" aria-labelledby="checkout-address-title">
            <div className="checkout-section-heading">
              <span>01</span>
              <div><h2 id="checkout-address-title">Địa chỉ giao hàng</h2><p>Địa chỉ này sẽ được lưu vào các đơn hàng vừa tạo.</p></div>
              {isOrderLocked && <em>Đã khóa sau khi tạo đơn</em>}
            </div>
            <label htmlFor="checkout-shipping-address">Địa chỉ nhận hàng</label>
            <textarea
              id="checkout-shipping-address"
              value={shippingAddress}
              onChange={(event) => setShippingAddress(event.target.value)}
              placeholder="Nhập số nhà, đường, phường/xã, quận/huyện, tỉnh/thành phố"
              autoComplete="street-address"
              rows={3}
              disabled={isSubmitting || isOrderLocked}
            />
          </section>

          <section className="checkout-order" aria-labelledby="checkout-products-title">
            <div className="checkout-section-heading">
              <span>02</span>
              <div><h2 id="checkout-products-title">Sản phẩm đặt mua</h2><p>{totalQuantity} sản phẩm từ {preview.shopGroups.length} gian hàng.</p></div>
              {isOrderLocked ? <em>Đơn hàng #{createdOrder.orderGroupId} đã được tạo</em> : <Link to="/cart">Quay lại giỏ hàng</Link>}
            </div>

            <div className="checkout-shops">
              {preview.shopGroups.map((group) => (
                <article className="checkout-shop" key={group.shopId}>
                  <header><strong>{group.shopName}</strong><span>{group.items.length} mặt hàng</span></header>
                  <div>
                    {group.items.map((item) => (
                      <div className="checkout-item" key={item.productId}>
                        <Link className="checkout-item__media" to={`/products/${item.productId}`}>
                          {item.imageUrl
                            ? <img src={item.imageUrl} alt={item.name} />
                            : <span aria-label="Sản phẩm chưa có hình ảnh">{item.name.charAt(0)}</span>}
                        </Link>
                        <div className="checkout-item__info">
                          <Link to={`/products/${item.productId}`}>{item.name}</Link>
                          <small>Đơn giá {formatCurrency(item.price)}</small>
                        </div>
                        <span className="checkout-item__quantity">× {item.quantity}</span>
                        <strong>{formatCurrency(item.subtotal)}</strong>
                      </div>
                    ))}
                  </div>
                  <footer className="checkout-shop__totals">
                    <div><span>Tiền hàng</span><strong>{formatCurrency(group.subtotal)}</strong></div>
                    {Number(group.productDiscountAmount) > 0 && <div className="is-discount"><span>Giảm giá sản phẩm</span><strong>− {formatCurrency(group.productDiscountAmount)}</strong></div>}
                    <div className="is-total"><span>Tổng tiền hàng</span><strong>{formatCurrency(group.totalAmount)}</strong></div>
                  </footer>
                </article>
              ))}
            </div>
          </section>

          <section className="checkout-payment" aria-labelledby="checkout-payment-title">
            <div className="checkout-section-heading">
              <span>03</span>
              <div><h2 id="checkout-payment-title">Phương thức thanh toán</h2><p>Chọn phương thức trước khi xác nhận đặt hàng.</p></div>
              {isOrderLocked && <em>Đã khóa</em>}
            </div>

            <label className={`payment-method${selectedPaymentMethod === 'COD' ? ' payment-method--selected' : ''}`}>
              <input type="radio" name="paymentMethod" value="COD" checked={selectedPaymentMethod === 'COD'} onChange={() => setSelectedPaymentMethod('COD')} disabled={isSubmitting || isOrderLocked} />
              <span className="payment-method__icon" aria-hidden="true">₫</span>
              <span className="payment-method__copy"><strong>Thanh toán khi nhận hàng (COD)</strong><small>Thanh toán trực tiếp khi đơn hàng được giao tới bạn.</small></span>
              <span className="payment-method__check" aria-hidden="true">✓</span>
            </label>

            <label className={`payment-method${selectedPaymentMethod === 'ONLINE' ? ' payment-method--selected' : ''}`}>
              <input type="radio" name="paymentMethod" value="ONLINE" checked={selectedPaymentMethod === 'ONLINE'} onChange={() => setSelectedPaymentMethod('ONLINE')} disabled={isSubmitting || isOrderLocked} />
              <span className="payment-method__icon" aria-hidden="true">↗</span>
              <span className="payment-method__copy"><strong>Thanh toán trực tuyến</strong><small>Backend mô phỏng kết quả thanh toán thành công trong phiên bản hiện tại.</small><em>Mô phỏng — không kết nối ngân hàng hoặc cổng thanh toán</em></span>
              <span className="payment-method__check" aria-hidden="true">✓</span>
            </label>
          </section>
        </div>

        <aside className="checkout-summary" aria-labelledby="checkout-summary-title">
          <h2 id="checkout-summary-title">Tóm tắt đơn hàng</h2>

          <div className="checkout-discount">
            <label htmlFor="checkout-product-discount-code">Mã giảm giá sản phẩm</label>
            <div>
              <input id="checkout-product-discount-code" value={productDiscountInput} onChange={(event) => setProductDiscountInput(event.target.value)} placeholder="Ví dụ: SALE20" maxLength={50} disabled={isRefreshing || isSubmitting || isOrderLocked} />
              <button type="button" onClick={handleApplyProductDiscount} disabled={isRefreshing || isSubmitting || isOrderLocked}>{isRefreshing ? 'Đang xử lý...' : 'Áp dụng'}</button>
            </div>
            {preview.productDiscount && <p>Đã áp dụng <strong>{preview.productDiscount.code}</strong><button type="button" disabled={isRefreshing || isSubmitting || isOrderLocked} onClick={() => { setProductDiscountInput(''); void reloadPreview('', preview.shippingDiscount?.code ?? ''); }}>Gỡ mã</button></p>}
          </div>

          <div className="checkout-discount">
            <label htmlFor="checkout-shipping-discount-code">Mã giảm phí vận chuyển</label>
            <div>
              <input id="checkout-shipping-discount-code" value={shippingDiscountInput} onChange={(event) => setShippingDiscountInput(event.target.value)} placeholder="Ví dụ: FREESHIP30" maxLength={50} disabled={isRefreshing || isSubmitting || isOrderLocked} />
              <button type="button" onClick={handleApplyShippingDiscount} disabled={isRefreshing || isSubmitting || isOrderLocked}>{isRefreshing ? 'Đang xử lý...' : 'Áp dụng'}</button>
            </div>
            {preview.shippingDiscount && <p>Đã áp dụng <strong>{preview.shippingDiscount.code}</strong><button type="button" disabled={isRefreshing || isSubmitting || isOrderLocked} onClick={() => { setShippingDiscountInput(''); void reloadPreview(preview.productDiscount?.code ?? '', ''); }}>Gỡ mã</button></p>}
          </div>

          <dl>
            <div><dt>Số lượng sản phẩm</dt><dd>{totalQuantity}</dd></div>
            <div><dt>Tạm tính</dt><dd>{formatCurrency(preview.subtotal)}</dd></div>
            <div className="checkout-summary__discount"><dt>Giảm giá sản phẩm</dt><dd>− {formatCurrency(preview.productDiscountAmount)}</dd></div>
            <div><dt>Phí vận chuyển</dt><dd>{formatCurrency(preview.shippingFee)}</dd></div>
            <div className="checkout-summary__discount"><dt>Giảm phí vận chuyển</dt><dd>− {formatCurrency(preview.shippingDiscountAmount)}</dd></div>
            <div><dt>Thanh toán</dt><dd>{paymentMethodLabels[selectedPaymentMethod]}</dd></div>
            {createdOrder && <div><dt>Mã nhóm đơn</dt><dd>#{createdOrder.orderGroupId}</dd></div>}
            <div className="checkout-summary__total"><dt>Tổng thanh toán</dt><dd>{formatCurrency(createdOrder?.totalAmount ?? preview.totalAmount)}</dd></div>
          </dl>

          <button className="checkout-summary__confirm" type="button" onClick={handlePrimaryAction} disabled={isSubmitting || isRefreshing || Boolean(previewError)}>{primaryButtonLabel}</button>
          <p>{createdOrder ? 'Đơn hàng đã được tạo. Thử lại chỉ tạo Payment cho nhóm đơn hiện tại.' : 'Sau khi backend tạo đơn hàng thành công, hệ thống sẽ tạo Payment theo phương thức đã chọn.'}</p>
        </aside>
      </div>
    </main>
  );
}

function CheckoutHeading({ isOrderLocked }: { isOrderLocked: boolean }) {
  return (
    <header className="checkout-heading">
      <div><span>Hoàn tất đơn mua</span><h1>Xác nhận đơn hàng</h1><p>Kiểm tra giao hàng, sản phẩm và phương thức thanh toán trước khi xác nhận.</p></div>
      {isOrderLocked ? <strong className="checkout-heading__locked">Đơn hàng đã được tạo</strong> : <Link to="/cart">Quay lại giỏ hàng</Link>}
    </header>
  );
}

function CheckoutSkeleton() {
  return (
    <div className="checkout-skeleton" aria-label="Đang tải thông tin đặt hàng" aria-busy="true">
      <div>{Array.from({ length: 4 }, (_, index) => <span key={index} />)}</div>
      <aside>{Array.from({ length: 4 }, (_, index) => <span key={index} />)}</aside>
    </div>
  );
}
