import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getCart, removeCartItem, updateCartItem } from '../../api/cart.api';
import type { CartItem, CartUnavailableReason } from '../../types/cart';
import { getApiErrorMessage } from '../../utils/auth';
import { formatCurrency } from '../../utils/format-currency';
import './cart.css';

const unavailableMessages: Record<CartUnavailableReason, string> = {
  PRODUCT_NOT_AVAILABLE: 'Sản phẩm hiện không khả dụng',
  SHOP_NOT_ACTIVE: 'Gian hàng hiện không hoạt động',
  INSUFFICIENT_STOCK: 'Số lượng trong kho không còn đủ',
};

function getUnavailableMessage(item: CartItem): string | null {
  if (!item.unavailableReason) return null;

  if (item.unavailableReason === 'INSUFFICIENT_STOCK') {
    return `Chỉ còn ${item.availableQuantity} sản phẩm`;
  }

  return unavailableMessages[item.unavailableReason];
}

export function CartPage() {
  const navigate = useNavigate();
  const [cart, setCart] = useState({ items: [] as CartItem[], totalAmount: '0.00' });
  const [isLoading, setIsLoading] = useState(true);
  const [busyProductId, setBusyProductId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const loadCart = useCallback(async () => {
    try {
      const response = await getCart();
      setCart(response);
      setErrorMessage('');
    } catch (error: unknown) {
      setErrorMessage(getApiErrorMessage(error, 'Không thể tải giỏ hàng.'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isCurrent = true;

    getCart()
      .then((response) => {
        if (!isCurrent) return;
        setCart(response);
        setErrorMessage('');
      })
      .catch((error: unknown) => {
        if (!isCurrent) return;
        setErrorMessage(getApiErrorMessage(error, 'Không thể tải giỏ hàng.'));
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  const totalQuantity = useMemo(
    () => cart.items.reduce((total, item) => total + item.quantity, 0),
    [cart.items],
  );
  const hasUnavailableItems = cart.items.some((item) => !item.isAvailable);

  const handleRetry = () => {
    setIsLoading(true);
    setErrorMessage('');
    void loadCart();
  };

  const handleQuantityChange = async (item: CartItem, nextQuantity: number) => {
    if (busyProductId || nextQuantity < 1) return;

    setBusyProductId(item.productId);
    setErrorMessage('');

    try {
      await updateCartItem(item.productId, nextQuantity);
      const refreshedCart = await getCart();
      setCart(refreshedCart);
    } catch (error: unknown) {
      setErrorMessage(
        getApiErrorMessage(error, 'Không thể cập nhật số lượng.'),
      );
    } finally {
      setBusyProductId(null);
    }
  };

  const handleDecrease = (item: CartItem) => {
    const nextQuantity =
      item.unavailableReason === 'INSUFFICIENT_STOCK'
        ? Math.max(1, Math.min(item.quantity - 1, item.availableQuantity))
        : item.quantity - 1;

    void handleQuantityChange(item, nextQuantity);
  };

  const handleRemove = async (productId: string) => {
    if (busyProductId) return;

    setBusyProductId(productId);
    setErrorMessage('');

    try {
      await removeCartItem(productId);
      const refreshedCart = await getCart();
      setCart(refreshedCart);
    } catch (error: unknown) {
      setErrorMessage(
        getApiErrorMessage(error, 'Không thể xóa sản phẩm khỏi giỏ hàng.'),
      );
    } finally {
      setBusyProductId(null);
    }
  };

  return (
    <main className="cart-page">
      <header className="cart-heading">
        <div>
          <span>Đơn mua của bạn</span>
          <h1>Giỏ hàng</h1>
          <p>Kiểm tra sản phẩm và số lượng trước khi đặt hàng.</p>
        </div>
        {!isLoading && cart.items.length > 0 && (
          <strong>{totalQuantity} sản phẩm</strong>
        )}
      </header>

      {errorMessage && (
        <div className="cart-alert" role="alert">
          <div><strong>Không thể hoàn tất yêu cầu</strong><p>{errorMessage}</p></div>
          {cart.items.length === 0 && (
            <button type="button" onClick={handleRetry}>Thử lại</button>
          )}
        </div>
      )}

      {isLoading ? (
        <section className="cart-loading" aria-label="Đang tải giỏ hàng">
          <div className="cart-loading__items">
            {Array.from({ length: 3 }, (_, index) => (
              <div className="cart-item-skeleton" key={index} aria-hidden="true">
                <span /><div><i /><i /><i /></div>
              </div>
            ))}
          </div>
          <aside aria-hidden="true"><i /><i /><i /></aside>
        </section>
      ) : cart.items.length === 0 && !errorMessage ? (
        <section className="cart-empty">
          <span aria-hidden="true">▢</span>
          <h2>Giỏ hàng của bạn đang trống</h2>
          <p>Khám phá sản phẩm phù hợp và thêm vào giỏ hàng để tiếp tục.</p>
          <Link to="/">Tiếp tục mua sắm</Link>
        </section>
      ) : cart.items.length > 0 ? (
        <div className="cart-layout">
          <section className="cart-items" aria-label="Sản phẩm trong giỏ hàng">
            {cart.items.map((item) => {
              const isBusy = busyProductId === item.productId;
              const warningMessage = getUnavailableMessage(item);
              const canDecrease =
                item.quantity > 1 &&
                item.availableQuantity > 0 &&
                item.unavailableReason !== 'PRODUCT_NOT_AVAILABLE' &&
                item.unavailableReason !== 'SHOP_NOT_ACTIVE';
              const canIncrease =
                item.isAvailable && item.quantity < item.availableQuantity;

              return (
                <article
                  className={`cart-item${item.isAvailable ? '' : ' cart-item--unavailable'}`}
                  key={item.productId}
                >
                  <Link className="cart-item__media" to={`/products/${item.productId}`}>
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.name ?? 'Sản phẩm trong giỏ hàng'} />
                    ) : (
                      <div className="cart-item__fallback" aria-label="Sản phẩm chưa có hình ảnh">
                        <span>{item.name?.charAt(0) ?? '?'}</span>
                      </div>
                    )}
                  </Link>

                  <div className="cart-item__details">
                    <div>
                      <h2><Link to={`/products/${item.productId}`}>{item.name ?? 'Sản phẩm không còn khả dụng'}</Link></h2>
                      <strong>{item.price ? formatCurrency(item.price) : 'Không còn giá bán'}</strong>
                    </div>
                    {warningMessage && <p className="cart-item__warning">{warningMessage}</p>}
                    <button
                      className="cart-item__remove"
                      type="button"
                      onClick={() => void handleRemove(item.productId)}
                      disabled={Boolean(busyProductId)}
                    >
                      {isBusy ? 'Đang xử lý...' : 'Xóa sản phẩm'}
                    </button>
                  </div>

                  <div className="cart-item__quantity">
                    <span>Số lượng</span>
                    <div>
                      <button
                        type="button"
                        onClick={() => handleDecrease(item)}
                        disabled={Boolean(busyProductId) || !canDecrease}
                        aria-label={`Giảm số lượng ${item.name ?? 'sản phẩm'}`}
                      >−</button>
                      <output aria-live="polite">{item.quantity}</output>
                      <button
                        type="button"
                        onClick={() => void handleQuantityChange(item, item.quantity + 1)}
                        disabled={Boolean(busyProductId) || !canIncrease}
                        aria-label={`Tăng số lượng ${item.name ?? 'sản phẩm'}`}
                      >+</button>
                    </div>
                    <small>Còn {item.availableQuantity} sản phẩm</small>
                  </div>

                  <div className="cart-item__subtotal">
                    <span>Thành tiền</span>
                    <strong>{item.subtotal ? formatCurrency(item.subtotal) : '—'}</strong>
                  </div>
                </article>
              );
            })}
          </section>

          <aside className="cart-summary" aria-labelledby="cart-summary-title">
            <h2 id="cart-summary-title">Tóm tắt đơn hàng</h2>
            <dl>
              <div><dt>Số sản phẩm</dt><dd>{totalQuantity}</dd></div>
              <div className="cart-summary__total"><dt>Tổng cộng</dt><dd>{formatCurrency(cart.totalAmount)}</dd></div>
            </dl>
            <button
              type="button"
              disabled={hasUnavailableItems || Boolean(busyProductId)}
              onClick={() => navigate('/checkout')}
            >
              Tiến hành đặt hàng
            </button>
            <p className={hasUnavailableItems ? 'cart-summary__notice cart-summary__notice--warning' : 'cart-summary__notice'}>
              {hasUnavailableItems
                ? 'Vui lòng xử lý các sản phẩm không khả dụng trước khi đặt hàng.'
                : 'Sản phẩm và tồn kho sẽ được kiểm tra lại ở bước xác nhận.'}
            </p>
            <Link to="/">Tiếp tục mua sắm</Link>
          </aside>
        </div>
      ) : null}
    </main>
  );
}
