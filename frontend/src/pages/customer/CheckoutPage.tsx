import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { confirmCheckout, getCheckoutPreview } from '../../api/checkout.api';
import { getCustomerProfile } from '../../api/customer-profile.api';
import { createPayment } from '../../api/payment.api';
import { useAuth } from '../../hooks/useAuth';
import type { CheckoutPreviewResponse } from '../../types/checkout';
import type { PaymentMethod, PaymentResultState } from '../../types/payment';
import { getApiErrorMessage } from '../../utils/auth';
import { formatCurrency } from '../../utils/format-currency';
import './checkout.css';

interface CreatedOrder {
  orderGroupId: string;
  totalAmount: string;
  orderCount: number;
}

type SubmissionPhase = 'idle' | 'order' | 'payment';
type CheckoutPaymentOption = 'COD' | 'EWALLET' | 'CREDIT_CARD' | 'ATM';

const paymentOptions: Array<{
  value: CheckoutPaymentOption;
  title: string;
  description: string;
  icon: string;
  badges: string[];
}> = [
  {
    value: 'COD',
    title: 'Thanh toán khi nhận hàng (COD)',
    description: 'Thanh toán bằng tiền mặt khi nhận được đơn hàng.',
    icon: '₫',
    badges: ['Phí thu hộ 0đ'],
  },
  {
    value: 'EWALLET',
    title: 'Ví điện tử VNPay / MoMo / ZaloPay',
    description: 'Quét mã QR qua ứng dụng ngân hàng hoặc ví điện tử.',
    icon: '▦',
    badges: ['VNPAY', 'MoMo', 'ZaloPay'],
  },
  {
    value: 'CREDIT_CARD',
    title: 'Thẻ tín dụng / Ghi nợ quốc tế',
    description: 'Hỗ trợ Visa, MasterCard và JCB với xác thực bảo mật.',
    icon: '▭',
    badges: ['VISA', 'MC', 'JCB'],
  },
  {
    value: 'ATM',
    title: 'Thẻ ATM nội địa / Internet Banking',
    description: 'Thanh toán qua hệ thống ngân hàng nội địa liên kết Napas.',
    icon: '⌂',
    badges: ['NAPAS'],
  },
];

const paymentOptionLabels: Record<CheckoutPaymentOption, string> = {
  COD: 'Thanh toán khi nhận hàng (COD)',
  EWALLET: 'Ví điện tử',
  CREDIT_CARD: 'Thẻ tín dụng / Ghi nợ quốc tế',
  ATM: 'Thẻ ATM nội địa / Internet Banking',
};

function getPreviewError(error: unknown): string {
  const message = getApiErrorMessage(error, 'Không thể tải thông tin đặt hàng.');
  return message.toLowerCase().includes('cart is empty')
    ? 'Giỏ hàng không có sản phẩm để đặt hàng.'
    : message;
}

export function CheckoutPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const selectedCartItemIds = useMemo(() => {
    const value = (location.state as { selectedCartItemIds?: unknown } | null)?.selectedCartItemIds;
    if (!Array.isArray(value)) return [];
    const validIds = value.filter(
      (cartItemId): cartItemId is string =>
        typeof cartItemId === 'string' && /^[1-9]\d*$/.test(cartItemId),
    );
    return validIds.length === value.length && new Set(validIds).size === validIds.length
      ? validIds
      : [];
  }, [location.state]);
  const [preview, setPreview] = useState<CheckoutPreviewResponse | null>(null);
  const [customerName, setCustomerName] = useState(user?.fullName ?? 'Khách hàng MarketNest');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [shippingAddress, setShippingAddress] = useState('');
  const [defaultContact, setDefaultContact] = useState({ phone: user?.phone ?? '', shippingAddress: '' });
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [addressDraft, setAddressDraft] = useState({ phone: '', shippingAddress: '' });
  const [addressError, setAddressError] = useState('');
  const [productDiscountInput, setProductDiscountInput] = useState('');
  const [shippingDiscountInput, setShippingDiscountInput] = useState('');
  const [selectedPaymentOption, setSelectedPaymentOption] = useState<CheckoutPaymentOption>('COD');
  const [createdOrder, setCreatedOrder] = useState<CreatedOrder | null>(null);
  const [submissionPhase, setSubmissionPhase] = useState<SubmissionPhase>('idle');
  const [isLoading, setIsLoading] = useState(selectedCartItemIds.length > 0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [previewError, setPreviewError] = useState(
    selectedCartItemIds.length > 0
      ? ''
      : 'Vui lòng chọn ít nhất một sản phẩm từ giỏ hàng.',
  );
  const [checkoutError, setCheckoutError] = useState('');
  const [paymentError, setPaymentError] = useState('');

  const isSubmitting = submissionPhase !== 'idle';
  const isOrderLocked = createdOrder !== null;
  const selectedPaymentMethod: PaymentMethod = selectedPaymentOption === 'COD' ? 'COD' : 'ONLINE';
  const isDefaultAddress = phone === defaultContact.phone && shippingAddress === defaultContact.shippingAddress;

  useEffect(() => {
    let isCurrent = true;

    if (selectedCartItemIds.length === 0) {
      return () => {
        isCurrent = false;
      };
    }

    void getCheckoutPreview({ selectedCartItemIds })
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
  }, [selectedCartItemIds]);

  useEffect(() => {
    let isCurrent = true;

    void getCustomerProfile()
      .then((profile) => {
        if (!isCurrent) return;
        const profilePhone = profile.phone?.trim() ?? '';
        const profileAddress = profile.shippingAddress?.trim() ?? '';
        setCustomerName(profile.fullName);
        setPhone(profilePhone);
        setShippingAddress(profileAddress);
        setDefaultContact({
          phone: profilePhone,
          shippingAddress: profileAddress,
        });
      })
      .catch(() => {
        // Authentication data remains a safe fallback when profile loading fails.
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
        selectedCartItemIds,
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

  const openAddressModal = () => {
    setAddressDraft({ phone, shippingAddress });
    setAddressError('');
    setIsAddressModalOpen(true);
  };

  const closeAddressModal = () => {
    if (isSubmitting || isOrderLocked) return;
    setIsAddressModalOpen(false);
    setAddressError('');
  };

  const handleAddressSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedPhone = addressDraft.phone.trim();
    const normalizedAddress = addressDraft.shippingAddress.trim();

    if (!normalizedPhone) {
      setAddressError('Vui lòng nhập số điện thoại nhận hàng.');
      return;
    }
    if (normalizedPhone.length > 20) {
      setAddressError('Số điện thoại tối đa 20 ký tự.');
      return;
    }
    if (!normalizedAddress) {
      setAddressError('Vui lòng nhập địa chỉ nhận hàng.');
      return;
    }

    setPhone(normalizedPhone);
    setShippingAddress(normalizedAddress);
    setIsAddressModalOpen(false);
    setAddressError('');
    setCheckoutError('');
  };

  const handleConfirm = async () => {
    if (!preview || isSubmitting || previewError || createdOrder) return;
    const normalizedAddress = shippingAddress.trim();

    if (!normalizedAddress) {
      setCheckoutError('Vui lòng nhập địa chỉ giao hàng.');
      return;
    }

    if (!phone.trim()) {
      setCheckoutError('Vui lòng nhập số điện thoại nhận hàng.');
      return;
    }

    setSubmissionPhase('order');
    setCheckoutError('');
    setPaymentError('');

    try {
      const response = await confirmCheckout({
        selectedCartItemIds,
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
              <span aria-hidden="true">⌖</span>
              <div><h2 id="checkout-address-title">Địa chỉ nhận hàng</h2><p>Kiểm tra thông tin giao nhận để đơn hàng được giao đúng hẹn.</p></div>
              {isOrderLocked ? <em>Đã khóa sau khi tạo đơn</em> : (
                <button className="checkout-address__change" type="button" onClick={openAddressModal}>⇄ Thay đổi địa chỉ</button>
              )}
            </div>
            <div className="checkout-address__card">
              <div className="checkout-address__contact">
                <strong>{customerName}</strong>
                <span>{phone || 'Chưa có số điện thoại'}</span>
                {isDefaultAddress && shippingAddress && <em>Mặc định</em>}
              </div>
              <p><span aria-hidden="true">⌖</span>{shippingAddress || 'Chưa có địa chỉ mặc định. Hãy chọn “Thay đổi địa chỉ” để bổ sung.'}</p>
            </div>
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
                      <div className="checkout-item" key={item.cartItemId}>
                        <Link className="checkout-item__media" to={`/products/${item.productId}`}>
                          {item.imageUrl
                            ? <img src={item.imageUrl} alt={item.name} />
                            : <span aria-label="Sản phẩm chưa có hình ảnh">{item.name.charAt(0)}</span>}
                        </Link>
                        <div className="checkout-item__info">
                          <div className="checkout-item__badges">
                            <span>{item.categoryName}</span>
                            <em>Còn {item.availableQuantity} sản phẩm</em>
                          </div>
                          <Link to={`/products/${item.productId}`}>{item.name}</Link>
                          <small>Đơn giá {formatCurrency(item.price)}</small>
                        </div>
                        <div className="checkout-item__price">
                          {item.originalPrice && <del>{formatCurrency(item.originalPrice)}</del>}
                          <strong>{formatCurrency(item.subtotal)}</strong>
                          <span>Số lượng: {item.quantity}</span>
                        </div>
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
              <span aria-hidden="true">▤</span>
              <div><h2 id="checkout-payment-title">Phương thức thanh toán</h2><p>Chọn phương thức thuận tiện và an toàn nhất.</p></div>
              {isOrderLocked ? <em>Đã khóa</em> : <small className="checkout-payment__secure">▣ Bảo mật SSL 256-bit</small>}
            </div>

            <div className="checkout-payment__options">
              {paymentOptions.map((option) => (
                <label className={`payment-method${selectedPaymentOption === option.value ? ' payment-method--selected' : ''}`} key={option.value}>
                  <input type="radio" name="paymentOption" value={option.value} checked={selectedPaymentOption === option.value} onChange={() => setSelectedPaymentOption(option.value)} disabled={isSubmitting || isOrderLocked} />
                  <span className="payment-method__radio" aria-hidden="true" />
                  <span className="payment-method__icon" aria-hidden="true">{option.icon}</span>
                  <span className="payment-method__copy"><strong>{option.title}</strong><small>{option.description}</small></span>
                  <span className="payment-method__badges" aria-hidden="true">{option.badges.map((badge) => <i key={badge}>{badge}</i>)}</span>
                </label>
              ))}
            </div>

            <div className="checkout-payment__note">
              <span className="checkout-payment__info-icon" aria-hidden="true">i</span>
              <div><strong>{selectedPaymentOption === 'COD' ? 'Thanh toán khi nhận hàng (COD)' : 'Thanh toán trực tuyến mô phỏng'}</strong><p>{selectedPaymentOption === 'COD' ? `Bạn sẽ thanh toán ${formatCurrency(preview.totalAmount)} cho nhân viên giao hàng khi nhận đơn.` : 'Ví điện tử, thẻ quốc tế và ATM đều được gửi lên backend với phương thức ONLINE trong phiên bản hiện tại.'}</p></div>
            </div>
          </section>
        </div>

        <aside className="checkout-sidebar">
        <section className="checkout-summary" aria-labelledby="checkout-summary-title">
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
            <div><dt>Thanh toán</dt><dd>{paymentOptionLabels[selectedPaymentOption]}</dd></div>
            {createdOrder && <div><dt>Mã nhóm đơn</dt><dd>#{createdOrder.orderGroupId}</dd></div>}
            <div className="checkout-summary__total"><dt>Tổng thanh toán</dt><dd>{formatCurrency(createdOrder?.totalAmount ?? preview.totalAmount)}</dd></div>
          </dl>

          <button className="checkout-summary__confirm" type="button" onClick={handlePrimaryAction} disabled={isSubmitting || isRefreshing || Boolean(previewError)}>{primaryButtonLabel}</button>
          <p>{createdOrder ? 'Đơn hàng đã được tạo. Thử lại chỉ tạo Payment cho nhóm đơn hiện tại.' : 'Sau khi backend tạo đơn hàng thành công, hệ thống sẽ tạo Payment theo phương thức đã chọn.'}</p>
        </section>
          <section className="checkout-commitment" aria-labelledby="checkout-commitment-title">
            <span className="checkout-commitment__eyebrow">Cam kết độc quyền từ MarketNest</span>
            <h2 id="checkout-commitment-title">Mua sắm an tâm</h2>
            <ul>
              <li><span>↺</span><div><strong>Đổi trả miễn phí 15 ngày</strong><small>Hỗ trợ nhanh khi sản phẩm phát sinh lỗi.</small></div></li>
              <li><span>♢</span><div><strong>Hoàn tiền nếu phát hiện hàng giả</strong><small>Quy trình đối soát và bảo vệ người mua rõ ràng.</small></div></li>
              <li><span>▣</span><div><strong>Bảo mật chuẩn quốc tế</strong><small>Dữ liệu thanh toán được mã hóa an toàn.</small></div></li>
            </ul>
            <p>Cần trợ giúp? Gọi ngay <strong>1900 8888 (24/7)</strong></p>
          </section>
        </aside>
      </div>

      {isAddressModalOpen && (
        <div className="checkout-address-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeAddressModal(); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="checkout-address-modal-title">
            <header><div><span>Thông tin giao nhận</span><h2 id="checkout-address-modal-title">Thay đổi địa chỉ</h2></div><button type="button" onClick={closeAddressModal} aria-label="Đóng">×</button></header>
            <form onSubmit={handleAddressSubmit}>
              <label htmlFor="checkout-phone"><span>Số điện thoại</span><input id="checkout-phone" type="tel" value={addressDraft.phone} maxLength={20} autoComplete="tel" onChange={(event) => setAddressDraft((current) => ({ ...current, phone: event.target.value }))} placeholder="Nhập số điện thoại nhận hàng" autoFocus /></label>
              <label htmlFor="checkout-address-draft"><span>Địa chỉ nhận hàng</span><textarea id="checkout-address-draft" value={addressDraft.shippingAddress} rows={4} autoComplete="street-address" onChange={(event) => setAddressDraft((current) => ({ ...current, shippingAddress: event.target.value }))} placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành phố" /></label>
              {addressError && <p role="alert">{addressError}</p>}
              <footer><button type="button" onClick={closeAddressModal}>Hủy</button><button type="submit">Sử dụng địa chỉ này</button></footer>
            </form>
          </section>
        </div>
      )}
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
