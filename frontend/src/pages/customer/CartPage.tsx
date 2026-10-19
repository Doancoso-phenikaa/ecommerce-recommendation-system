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

type CartDisplayItem = CartItem & {
  categoryName?: string | null;
  variation?: string | null;
};

interface CartShopGroup {
  key: string;
  shopName: string;
  shopLogoUrl: string | null;
  items: CartDisplayItem[];
}

function getUnavailableMessage(item: CartItem): string | null {
  if (!item.unavailableReason) return null;
  if (item.unavailableReason === 'INSUFFICIENT_STOCK') {
    return `Chỉ còn ${item.availableQuantity} sản phẩm`;
  }
  return unavailableMessages[item.unavailableReason];
}

function groupCartItems(items: CartItem[]): CartShopGroup[] {
  const groups = new Map<string, CartShopGroup>();

  for (const cartItem of items) {
    const item = cartItem as CartDisplayItem;
    const key = item.shopId ?? 'current-cart';
    const existingGroup = groups.get(key);

    if (existingGroup) {
      existingGroup.items.push(item);
      continue;
    }

    groups.set(key, {
      key,
      shopName: item.shopName?.trim() || 'Sản phẩm trong giỏ hàng',
      shopLogoUrl: item.shopLogoUrl ?? null,
      items: [item],
    });
  }

  return [...groups.values()];
}

function sumCartItems(items: CartDisplayItem[]): string {
  const totalCents = items.reduce((total, item) => {
    if (!item.subtotal) return total;
    const [wholePart, fractionPart = ''] = item.subtotal.split('.');
    return total + BigInt(wholePart) * 100n + BigInt(fractionPart.padEnd(2, '0').slice(0, 2));
  }, 0n);

  return `${totalCents / 100n}.${(totalCents % 100n).toString().padStart(2, '0')}`;
}

function ShopLogo({ logoUrl, shopName }: { logoUrl: string | null; shopName: string }) {
  const [hasImageError, setHasImageError] = useState(false);

  if (!logoUrl || hasImageError) {
    return <span className="cart-shop-group__mark" aria-hidden="true">{shopName.trim().charAt(0).toLocaleUpperCase('vi') || 'S'}</span>;
  }

  return <img className="cart-shop-group__logo" src={logoUrl} alt={`Logo ${shopName}`} onError={() => setHasImageError(true)} />;
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5" />
    </svg>
  );
}

export function CartPage() {
  const navigate = useNavigate();
  const [cart, setCart] = useState({ items: [] as CartItem[], totalAmount: '0.00' });
  const [isLoading, setIsLoading] = useState(true);
  const [busyProductId, setBusyProductId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedCartItemIds, setSelectedCartItemIds] = useState<Set<string>>(new Set());

  const loadCart = useCallback(async () => {
    try {
      const response = await getCart();
      setCart(response);
      setSelectedCartItemIds(new Set(response.items.filter((item) => item.isAvailable).map((item) => item.cartItemId)));
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
        setSelectedCartItemIds(new Set(response.items.filter((item) => item.isAvailable).map((item) => item.cartItemId)));
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
  const cartGroups = useMemo(() => groupCartItems(cart.items), [cart.items]);
  const selectedItems = useMemo(
    () => (cart.items as CartDisplayItem[]).filter((item) => selectedCartItemIds.has(item.cartItemId)),
    [cart.items, selectedCartItemIds],
  );
  const selectedQuantity = useMemo(
    () => selectedItems.reduce((total, item) => total + item.quantity, 0),
    [selectedItems],
  );
  const selectedTotalAmount = useMemo(() => sumCartItems(selectedItems), [selectedItems]);
  const hasUnavailableItems = selectedItems.some((item) => !item.isAvailable);
  const handleProductSelection = (item: CartDisplayItem) => {
    if (!item.isAvailable) return;
    setSelectedCartItemIds((currentSelection) => {
      const nextSelection = new Set(currentSelection);
      if (nextSelection.has(item.cartItemId)) nextSelection.delete(item.cartItemId);
      else nextSelection.add(item.cartItemId);
      return nextSelection;
    });
  };

  const handleGroupSelection = (group: CartShopGroup) => {
    const selectableCartItemIds = group.items.filter((item) => item.isAvailable).map((item) => item.cartItemId);
    const isGroupSelected = selectableCartItemIds.length > 0 && selectableCartItemIds.every((cartItemId) => selectedCartItemIds.has(cartItemId));

    setSelectedCartItemIds((currentSelection) => {
      const nextSelection = new Set(currentSelection);
      for (const cartItemId of selectableCartItemIds) {
        if (isGroupSelected) nextSelection.delete(cartItemId);
        else nextSelection.add(cartItemId);
      }
      return nextSelection;
    });
  };

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
      setErrorMessage(getApiErrorMessage(error, 'Không thể cập nhật số lượng.'));
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

  const handleRemove = async (productId: string, cartItemId: string) => {
    if (busyProductId) return;
    setBusyProductId(productId);
    setErrorMessage('');

    try {
      await removeCartItem(productId);
      const refreshedCart = await getCart();
      setCart(refreshedCart);
      setSelectedCartItemIds((currentSelection) => {
        const nextSelection = new Set(currentSelection);
        nextSelection.delete(cartItemId);
        return nextSelection;
      });
    } catch (error: unknown) {
      setErrorMessage(getApiErrorMessage(error, 'Không thể xóa sản phẩm khỏi giỏ hàng.'));
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
        {!isLoading && cart.items.length > 0 && <strong>{totalQuantity} sản phẩm</strong>}
      </header>

      {errorMessage && (
        <div className="cart-alert" role="alert">
          <div><strong>Không thể hoàn tất yêu cầu</strong><p>{errorMessage}</p></div>
          {cart.items.length === 0 && <button type="button" onClick={handleRetry}>Thử lại</button>}
        </div>
      )}

      {isLoading ? (
        <section className="cart-loading" aria-label="Đang tải giỏ hàng">
          <div className="cart-loading__items">
            <div className="cart-shop-skeleton" aria-hidden="true"><i /></div>
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
            <div className="cart-column-head" aria-hidden="true">
              <span className="cart-column-head__product">Sản phẩm</span>
              <span>Đơn giá</span><span>Số lượng</span><span>Số tiền</span><span>Thao tác</span>
            </div>

            {cartGroups.map((group) => (
              <section className="cart-shop-group" key={group.key}>
                <header className="cart-shop-group__header">
                  <input
                    type="checkbox"
                    checked={group.items.some((item) => item.isAvailable) && group.items.filter((item) => item.isAvailable).every((item) => selectedCartItemIds.has(item.cartItemId))}
                    onChange={() => handleGroupSelection(group)}
                    aria-label={`Chọn toàn bộ sản phẩm của ${group.shopName}`}
                  />
                  <ShopLogo logoUrl={group.shopLogoUrl} shopName={group.shopName} />
                  <h2>{group.shopName}</h2>
                  <span className="cart-shop-group__verified" aria-label="Gian hàng trên MarketNest">✓</span>
                  <small>{group.items.length} mặt hàng</small>
                </header>

                <div className="cart-shop-group__items">
                  {group.items.map((item) => {
                    const isBusy = busyProductId === item.productId;
                    const warningMessage = getUnavailableMessage(item);
                    const canDecrease = item.quantity > 1 && item.availableQuantity > 0 && item.unavailableReason !== 'PRODUCT_NOT_AVAILABLE' && item.unavailableReason !== 'SHOP_NOT_ACTIVE';
                    const canIncrease = item.isAvailable && item.quantity < item.availableQuantity;
                    const secondaryText = item.variation?.trim() || item.categoryName?.trim() || `Mã sản phẩm: #${item.productId}`;

                    return (
                      <article className={`cart-item${item.isAvailable ? '' : ' cart-item--unavailable'}${selectedCartItemIds.has(item.cartItemId) ? '' : ' cart-item--unselected'}`} key={item.cartItemId}>
                        <input className="cart-item__checkbox" type="checkbox" checked={selectedCartItemIds.has(item.cartItemId)} onChange={() => handleProductSelection(item)} disabled={!item.isAvailable} aria-label={`Chọn sản phẩm ${item.name ?? item.productId}`} />
                        <Link className="cart-item__media" to={`/products/${item.productId}`}>
                          {item.imageUrl ? <img src={item.imageUrl} alt={item.name ?? 'Sản phẩm trong giỏ hàng'} /> : (
                            <div className="cart-item__fallback" aria-label="Sản phẩm chưa có hình ảnh"><span>{item.name?.charAt(0) ?? '?'}</span></div>
                          )}
                        </Link>

                        <div className="cart-item__details">
                          <h3><Link to={`/products/${item.productId}`}>{item.name ?? 'Sản phẩm không còn khả dụng'}</Link></h3>
                          <p>{secondaryText}</p>
                          {warningMessage && <span className="cart-item__warning">{warningMessage}</span>}
                        </div>

                        <div className="cart-item__price" data-label="Đơn giá">
                          <strong>{item.price ? formatCurrency(item.price) : 'Không còn giá bán'}</strong>
                          {item.originalPrice && <del>{formatCurrency(item.originalPrice)}</del>}
                        </div>

                        <div className="cart-item__quantity" data-label="Số lượng">
                          <div>
                            <button type="button" onClick={() => handleDecrease(item)} disabled={Boolean(busyProductId) || !canDecrease} aria-label={`Giảm số lượng ${item.name ?? 'sản phẩm'}`}>−</button>
                            <output aria-live="polite">{item.quantity}</output>
                            <button type="button" onClick={() => void handleQuantityChange(item, item.quantity + 1)} disabled={Boolean(busyProductId) || !canIncrease} aria-label={`Tăng số lượng ${item.name ?? 'sản phẩm'}`}>+</button>
                          </div>
                          <small>Còn {item.availableQuantity} sản phẩm</small>
                        </div>

                        <div className="cart-item__subtotal" data-label="Số tiền"><strong>{item.subtotal ? formatCurrency(item.subtotal) : '—'}</strong></div>
                        <button className="cart-item__remove" type="button" onClick={() => void handleRemove(item.productId, item.cartItemId)} disabled={Boolean(busyProductId)} aria-label={`Xóa ${item.name ?? 'sản phẩm'} khỏi giỏ hàng`} title="Xóa sản phẩm">
                          {isBusy ? <span className="cart-item__busy">•••</span> : <TrashIcon />}
                        </button>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </section>

          <aside className="cart-summary" aria-labelledby="cart-summary-title">
            <div className="cart-summary__heading"><span>Tóm tắt</span><h2 id="cart-summary-title">Thông tin đơn hàng</h2></div>
            <dl>
              <div><dt>Sản phẩm đã chọn</dt><dd>{selectedQuantity}</dd></div>
              <div><dt>Tạm tính</dt><dd>{formatCurrency(selectedTotalAmount)}</dd></div>
              <div className="cart-summary__total"><dt>Tổng cộng</dt><dd>{formatCurrency(selectedTotalAmount)}</dd></div>
            </dl>
            <button type="button" disabled={selectedItems.length === 0 || hasUnavailableItems || Boolean(busyProductId)} onClick={() => navigate('/checkout', { state: { selectedCartItemIds: [...selectedCartItemIds] } })}>Tiến hành đặt hàng <span aria-hidden="true">→</span></button>
            <p className={hasUnavailableItems ? 'cart-summary__notice cart-summary__notice--warning' : 'cart-summary__notice'}>
              {selectedItems.length === 0
                ? 'Hãy chọn sản phẩm để tiếp tục đặt hàng.'
                : hasUnavailableItems
                  ? 'Vui lòng xử lý các sản phẩm không khả dụng trước khi đặt hàng.'
                  : 'Chỉ những sản phẩm đã chọn sẽ được đưa vào đơn hàng.'}
            </p>
            <Link to="/">← Tiếp tục mua sắm</Link>
          </aside>
        </div>
      ) : null}
    </main>
  );
}
