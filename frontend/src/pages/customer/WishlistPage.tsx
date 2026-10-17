import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getWishlist, removeFromWishlist } from '../../api/wishlist.api';
import type { WishlistItem } from '../../types/wishlist';
import { getApiErrorMessage } from '../../utils/auth';
import { formatCurrency } from '../../utils/format-currency';
import './wishlist.css';

export function WishlistPage() {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [removingProductId, setRemovingProductId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const loadWishlist = useCallback(async () => {
    try {
      const response = await getWishlist();
      setItems(response.items);
      setErrorMessage('');
    } catch (error: unknown) {
      setErrorMessage(
        getApiErrorMessage(error, 'Không thể tải danh sách yêu thích.'),
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isCurrent = true;

    getWishlist()
      .then((response) => {
        if (!isCurrent) return;
        setItems(response.items);
        setErrorMessage('');
      })
      .catch((error: unknown) => {
        if (!isCurrent) return;
        setErrorMessage(
          getApiErrorMessage(error, 'Không thể tải danh sách yêu thích.'),
        );
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  const handleRetry = () => {
    setIsLoading(true);
    setErrorMessage('');
    void loadWishlist();
  };

  const handleRemove = async (productId: string) => {
    if (removingProductId) return;

    setRemovingProductId(productId);
    setErrorMessage('');

    try {
      await removeFromWishlist(productId);
      setItems((currentItems) =>
        currentItems.filter((item) => item.productId !== productId),
      );
    } catch (error: unknown) {
      setErrorMessage(
        getApiErrorMessage(
          error,
          'Không thể xóa sản phẩm khỏi danh sách yêu thích.',
        ),
      );
    } finally {
      setRemovingProductId(null);
    }
  };

  return (
    <main className="wishlist-page">
      <header className="wishlist-heading">
        <div>
          <span>Danh sách của bạn</span>
          <h1>Yêu thích</h1>
          <p>Lưu lại những sản phẩm bạn muốn xem và mua sau.</p>
        </div>
        {!isLoading && items.length > 0 && (
          <strong>{items.length} sản phẩm</strong>
        )}
      </header>

      {errorMessage && (
        <div className="wishlist-alert" role="alert">
          <div>
            <strong>Không thể hoàn tất yêu cầu</strong>
            <p>{errorMessage}</p>
          </div>
          {items.length === 0 && (
            <button type="button" onClick={handleRetry}>
              Thử lại
            </button>
          )}
        </div>
      )}

      {isLoading ? (
        <section className="wishlist-loading" aria-label="Đang tải danh sách yêu thích">
          {Array.from({ length: 4 }, (_, index) => (
            <div className="wishlist-skeleton" key={index} aria-hidden="true">
              <span />
              <div><i /><i /><i /></div>
            </div>
          ))}
        </section>
      ) : items.length === 0 && !errorMessage ? (
        <section className="wishlist-empty">
          <span aria-hidden="true">♡</span>
          <h2>Bạn chưa có sản phẩm yêu thích</h2>
          <p>Khám phá các sản phẩm và nhấn biểu tượng trái tim để lưu lại tại đây.</p>
          <Link to="/">Khám phá sản phẩm</Link>
        </section>
      ) : items.length > 0 ? (
        <section className="wishlist-grid" aria-label="Sản phẩm yêu thích">
          {items.map((item) => {
            const isRemoving = removingProductId === item.productId;

            return (
              <article className="wishlist-card" key={item.wishlistItemId}>
                <Link
                  className="wishlist-card__media"
                  to={`/products/${item.productId}`}
                  aria-label={`Xem ${item.name}`}
                >
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name} loading="lazy" />
                  ) : (
                    <div className="wishlist-card__fallback">
                      <span>{item.name.charAt(0)}</span>
                      <small>Chưa có hình ảnh</small>
                    </div>
                  )}
                </Link>
                <div className="wishlist-card__body">
                  <small>Gian hàng #{item.shopId}</small>
                  <h2><Link to={`/products/${item.productId}`}>{item.name}</Link></h2>
                  <strong>{formatCurrency(item.price)}</strong>
                  <div className="wishlist-card__actions">
                    <Link to={`/products/${item.productId}`}>Xem chi tiết</Link>
                    <button
                      type="button"
                      onClick={() => void handleRemove(item.productId)}
                      disabled={Boolean(removingProductId)}
                      aria-label={`Xóa ${item.name} khỏi danh sách yêu thích`}
                    >
                      {isRemoving ? 'Đang xóa...' : 'Xóa'}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      ) : null}
    </main>
  );
}
