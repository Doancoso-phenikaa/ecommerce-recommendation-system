import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { addToCart } from '../../api/cart.api';
import { getRecommendations } from '../../api/recommendation.api';
import { getWishlist, removeFromWishlist } from '../../api/wishlist.api';
import { RecommendationSection } from '../../components/recommendation/RecommendationSection';
import type { PublicProduct } from '../../types/product';
import type { WishlistItem } from '../../types/wishlist';
import { getApiErrorMessage } from '../../utils/auth';
import { formatCurrency } from '../../utils/format-currency';
import './wishlist.css';

const WISHLIST_PAGE_SIZE = 8;

export function WishlistPage() {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [removingProductId, setRemovingProductId] = useState<string | null>(null);
  const [addingProductId, setAddingProductId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [recommendedProducts, setRecommendedProducts] = useState<PublicProduct[]>([]);
  const [isRecommendationLoading, setIsRecommendationLoading] = useState(true);

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

  useEffect(() => {
    const controller = new AbortController();

    void getRecommendations(10, controller.signal)
      .then((response) => {
        setRecommendedProducts(response.items.map((item) => item.product));
      })
      .catch(() => {
        if (!controller.signal.aborted) setRecommendedProducts([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsRecommendationLoading(false);
      });

    return () => controller.abort();
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
    setSuccessMessage('');

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

  const handleAddToCart = async (productId: string) => {
    if (addingProductId || removingProductId) return;

    setAddingProductId(productId);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await addToCart(productId, 1);
      setSuccessMessage('Đã thêm sản phẩm vào giỏ hàng.');
    } catch (error: unknown) {
      setErrorMessage(getApiErrorMessage(error, 'Không thể thêm sản phẩm vào giỏ hàng.'));
    } finally {
      setAddingProductId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(items.length / WISHLIST_PAGE_SIZE));
  const visiblePage = Math.min(currentPage, totalPages);
  const paginatedItems = useMemo(() => {
    const startIndex = (visiblePage - 1) * WISHLIST_PAGE_SIZE;
    return items.slice(startIndex, startIndex + WISHLIST_PAGE_SIZE);
  }, [items, visiblePage]);

  const firstVisibleItem = items.length === 0 ? 0 : (visiblePage - 1) * WISHLIST_PAGE_SIZE + 1;
  const lastVisibleItem = Math.min(visiblePage * WISHLIST_PAGE_SIZE, items.length);
  const wishlistRecommendations = useMemo(() => {
    const wishlistProductIds = new Set(items.map((item) => item.productId));
    return recommendedProducts.filter(
      (product) => !wishlistProductIds.has(product.productId),
    );
  }, [items, recommendedProducts]);

  return (
    <main className="wishlist-page">
      <header className="wishlist-heading">
        <div>
          <span>Tài khoản của bạn</span>
          <div className="wishlist-heading__title">
            <h1>Sản phẩm yêu thích</h1>
            {!isLoading && items.length > 0 && <strong>{items.length} sản phẩm</strong>}
          </div>
          <p>Những sản phẩm bạn quan tâm và muốn mua trong tương lai.</p>
        </div>
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

      {successMessage && (
        <div className="wishlist-alert wishlist-alert--success" role="status">
          <div><strong>Đã cập nhật giỏ hàng</strong><p>{successMessage}</p></div>
          <Link to="/cart">Xem giỏ hàng</Link>
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
          {paginatedItems.map((item) => {
            const isRemoving = removingProductId === item.productId;
            const isAdding = addingProductId === item.productId;

            return (
              <article className="wishlist-card" key={item.wishlistItemId}>
                <div className="wishlist-card__visual">
                  <Link
                    className="wishlist-card__media"
                    to={`/products/${item.productId}`}
                    aria-label={`Xem ${item.name}`}
                  >
                    <WishlistProductImage imageUrl={item.imageUrl} name={item.name} />
                  </Link>
                  <button
                    className="wishlist-card__remove"
                    type="button"
                    onClick={() => void handleRemove(item.productId)}
                    disabled={Boolean(removingProductId || addingProductId)}
                    aria-label={`Xóa ${item.name} khỏi danh sách yêu thích`}
                    title="Xóa khỏi danh sách yêu thích"
                  >
                    <span aria-hidden="true">{isRemoving ? '…' : '♥'}</span>
                  </button>
                </div>
                <div className="wishlist-card__body">
                  <small>Gian hàng #{item.shopId}</small>
                  <h2><Link to={`/products/${item.productId}`}>{item.name}</Link></h2>
                  <strong>{formatCurrency(item.price)}</strong>
                  <button
                    className="wishlist-card__cart"
                    type="button"
                    onClick={() => void handleAddToCart(item.productId)}
                    disabled={Boolean(addingProductId || removingProductId)}
                  >
                    <span aria-hidden="true">＋</span>
                    {isAdding ? 'Đang thêm...' : 'Thêm vào giỏ'}
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      ) : null}

      {!isLoading && items.length > 0 && (
        <nav className="wishlist-pagination" aria-label="Phân trang danh sách yêu thích">
          <p>Hiển thị <strong>{firstVisibleItem}–{lastVisibleItem}</strong> trong tổng số <strong>{items.length}</strong> sản phẩm yêu thích</p>
          <div>
            <button type="button" onClick={() => setCurrentPage(Math.max(1, visiblePage - 1))} disabled={visiblePage === 1} aria-label="Trang trước">‹</button>
            {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
              <button className={page === visiblePage ? 'is-active' : ''} type="button" onClick={() => setCurrentPage(page)} aria-current={page === visiblePage ? 'page' : undefined} key={page}>{page}</button>
            ))}
            <button type="button" onClick={() => setCurrentPage(Math.min(totalPages, visiblePage + 1))} disabled={visiblePage === totalPages} aria-label="Trang sau">›</button>
          </div>
        </nav>
      )}

      <RecommendationSection
        title="Gợi ý dành cho bạn"
        products={wishlistRecommendations}
        isLoading={isRecommendationLoading}
        className="wishlist-recommendations"
        skeletonCount={5}
      />
    </main>
  );
}

function WishlistProductImage({ imageUrl, name }: { imageUrl: string | null; name: string }) {
  const [hasImageError, setHasImageError] = useState(false);

  if (imageUrl && !hasImageError) {
    return <img src={imageUrl} alt={name} loading="lazy" onError={() => setHasImageError(true)} />;
  }

  return (
    <div className="wishlist-card__fallback">
      <span>{name.trim().charAt(0).toLocaleUpperCase('vi') || 'M'}</span>
      <small>Chưa có hình ảnh</small>
    </div>
  );
}
