import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ProductCard } from '../../components/product/ProductCard';
import { addToCart } from '../../api/cart.api';
import { getActiveCategories } from '../../api/category.api';
import { getProductDetail, getProducts } from '../../api/product.api';
import { getProductReviews } from '../../api/review.api';
import { recordProductView } from '../../api/user-behavior.api';
import {
  addToWishlist,
  getWishlist,
  removeFromWishlist,
} from '../../api/wishlist.api';
import type { PublicProduct } from '../../types/product';
import type { ProductReviewsResponse } from '../../types/review';
import { formatCurrency } from '../../utils/format-currency';
import { getApiErrorMessage } from '../../utils/auth';
import { formatOrderDate } from '../../utils/order';
import { getProductDiscountPercentage } from '../../utils/product-price';
import './product-detail.css';

export function ProductDetailPage() {
  const { productId = '' } = useParams<{ productId: string }>();
  const [product, setProduct] = useState<PublicProduct | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [relatedProducts, setRelatedProducts] = useState<PublicProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const trackedProductIdRef = useRef<string | null>(null);

  useEffect(() => {
    let isCurrent = true;

    const loadProduct = async () => {
      setIsLoading(true);
      setError('');
      setProduct(null);
      setRelatedProducts([]);

      try {
        const currentProduct = await getProductDetail(productId);
        if (!isCurrent) return;
        setProduct(currentProduct);
        setCategoryName(`Danh mục #${currentProduct.categoryId}`);

        if (trackedProductIdRef.current !== currentProduct.productId) {
          trackedProductIdRef.current = currentProduct.productId;
          void recordProductView(currentProduct.productId).catch(() => {
            // Recommendation tracking is best-effort and must not block detail.
          });
        }

        const [categoriesResult, relatedResult] = await Promise.allSettled([
          getActiveCategories(),
          getProducts({
            categoryId: currentProduct.categoryId,
            page: 1,
            limit: 5,
          }),
        ]);

        if (!isCurrent) return;
        if (categoriesResult.status === 'fulfilled') {
          const category = categoriesResult.value.find(
            (item) => item.categoryId === currentProduct.categoryId,
          );
          if (category) setCategoryName(category.name);
        }
        if (relatedResult.status === 'fulfilled') {
          setRelatedProducts(
            relatedResult.value.data
              .filter((item) => item.productId !== currentProduct.productId)
              .slice(0, 4),
          );
        }
      } catch (requestError: unknown) {
        if (isCurrent) {
          setError(
            getApiErrorMessage(
              requestError,
              'Không thể tải thông tin sản phẩm.',
            ),
          );
        }
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    };

    void loadProduct();
    return () => {
      isCurrent = false;
    };
  }, [productId]);

  if (isLoading) {
    return (
      <main className="product-detail-page">
        <section className="product-not-found" aria-busy="true">
          <span aria-hidden="true">…</span>
          <h1>Đang tải thông tin sản phẩm</h1>
          <p>Vui lòng chờ trong giây lát.</p>
        </section>
      </main>
    );
  }

  if (!product) {
    return (
      <main className="product-detail-page">
        <section className="product-not-found">
          <span aria-hidden="true">?</span>
          <h1>Không thể hiển thị sản phẩm</h1>
          <p>{error || 'Sản phẩm bạn đang tìm có thể đã được thay đổi hoặc không còn hiển thị.'}</p>
          <Link to="/">Quay lại trang chủ</Link>
        </section>
      </main>
    );
  }

  return <ProductDetailContent key={product.productId} product={product} categoryName={categoryName} relatedProducts={relatedProducts} />;
}

function ProductDetailContent({ product, categoryName, relatedProducts }: { product: PublicProduct; categoryName: string; relatedProducts: PublicProduct[] }) {
  const navigate = useNavigate();
  const [quantity, setQuantity] = useState(1);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isWishlistLoading, setIsWishlistLoading] = useState(true);
  const [isWishlistUpdating, setIsWishlistUpdating] = useState(false);
  const [wishlistError, setWishlistError] = useState('');
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [isBuyingNow, setIsBuyingNow] = useState(false);
  const [cartError, setCartError] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [reviews, setReviews] = useState<ProductReviewsResponse | null>(null);
  const [isReviewsLoading, setIsReviewsLoading] = useState(true);
  const [reviewError, setReviewError] = useState('');
  const [reviewReloadKey, setReviewReloadKey] = useState(0);
  const availableQuantity = Math.max(product.inventory.availableQuantity, 0);
  const isOutOfStock = availableQuantity === 0;
  const discountPercentage = getProductDiscountPercentage(
    product.price,
    product.originalPrice,
  );

  useEffect(() => {
    let isCurrent = true;

    const loadWishlistState = async () => {
      try {
        const response = await getWishlist();

        if (isCurrent) {
          setIsFavorite(
            response.items.some((item) => item.productId === product.productId),
          );
        }
      } catch (error: unknown) {
        if (isCurrent) {
          setWishlistError(
            getApiErrorMessage(
              error,
              'Không thể kiểm tra trạng thái yêu thích.',
            ),
          );
        }
      } finally {
        if (isCurrent) setIsWishlistLoading(false);
      }
    };

    void loadWishlistState();

    return () => {
      isCurrent = false;
    };
  }, [product.productId]);

  useEffect(() => {
    let isCurrent = true;

    const loadReviews = async () => {
      setIsReviewsLoading(true);
      setReviewError('');

      try {
        const response = await getProductReviews(product.productId);
        if (isCurrent) setReviews(response);
      } catch (error: unknown) {
        if (isCurrent) {
          setReviewError(
            getApiErrorMessage(error, 'Không thể tải đánh giá sản phẩm.'),
          );
        }
      } finally {
        if (isCurrent) setIsReviewsLoading(false);
      }
    };

    void loadReviews();
    return () => {
      isCurrent = false;
    };
  }, [product.productId, reviewReloadKey]);

  useEffect(() => {
    if (!feedbackMessage) return undefined;
    const timer = window.setTimeout(() => setFeedbackMessage(''), 3000);
    return () => window.clearTimeout(timer);
  }, [feedbackMessage]);

  const decreaseQuantity = () => setQuantity((current) => Math.max(1, current - 1));
  const increaseQuantity = () => {
    setQuantity((current) => Math.min(availableQuantity, current + 1));
  };
  const handleAddToCart = async () => {
    if (isOutOfStock || isAddingToCart || isBuyingNow) return;

    setIsAddingToCart(true);
    setCartError('');

    try {
      await addToCart(product.productId, quantity);
      setFeedbackMessage('Đã thêm sản phẩm vào giỏ hàng');
    } catch (error: unknown) {
      setCartError(
        getApiErrorMessage(error, 'Không thể thêm sản phẩm vào giỏ hàng.'),
      );
    } finally {
      setIsAddingToCart(false);
    }
  };

  const handleBuyNow = async () => {
    if (isOutOfStock || isAddingToCart || isBuyingNow) return;

    setIsBuyingNow(true);
    setCartError('');
    setFeedbackMessage('');

    try {
      await addToCart(product.productId, quantity);
      navigate('/checkout');
    } catch (error: unknown) {
      setCartError(
        getApiErrorMessage(
          error,
          'Không thể chuẩn bị sản phẩm để đặt hàng.',
        ),
      );
      setIsBuyingNow(false);
    }
  };

  const handleWishlistToggle = async () => {
    if (isWishlistLoading || isWishlistUpdating) return;

    setIsWishlistUpdating(true);
    setWishlistError('');

    try {
      if (isFavorite) {
        await removeFromWishlist(product.productId);
        setIsFavorite(false);
        setFeedbackMessage('Đã xóa sản phẩm khỏi danh sách yêu thích');
      } else {
        await addToWishlist(product.productId);
        setIsFavorite(true);
        setFeedbackMessage('Đã thêm sản phẩm vào danh sách yêu thích');
      }
    } catch (error: unknown) {
      setWishlistError(
        getApiErrorMessage(
          error,
          isFavorite
            ? 'Không thể xóa sản phẩm khỏi danh sách yêu thích.'
            : 'Không thể thêm sản phẩm vào danh sách yêu thích.',
        ),
      );
    } finally {
      setIsWishlistUpdating(false);
    }
  };

  return (
    <main className="product-detail-page">
      <nav className="product-breadcrumb" aria-label="Breadcrumb">
        <Link to="/">Trang chủ</Link><span aria-hidden="true">/</span>
        <span>Sản phẩm</span><span aria-hidden="true">/</span>
        <strong>{product.name}</strong>
      </nav>

      <section className="product-overview" aria-labelledby="product-title">
        <div className="product-detail-media">
          {product.imageUrl ? (
            <img src={product.imageUrl} alt={product.name} />
          ) : (
            <div className="product-detail-media__fallback" aria-label="Sản phẩm chưa có hình ảnh">
              <span>{product.name.charAt(0)}</span><p>Chưa có hình ảnh sản phẩm</p>
            </div>
          )}
        </div>

        <div className="product-purchase-panel">
          <div className="product-badges" aria-label="Quyền lợi sản phẩm">
            <span>Chính hãng</span><span>Đổi trả 7 ngày</span><span>Bảo đảm chất lượng</span>
          </div>
          <h1 id="product-title">{product.name}</h1>
          <div className="product-meta" aria-label="Thông tin đánh giá và lượt bán">
            {isReviewsLoading ? (
              <span>Đang tải đánh giá...</span>
            ) : reviews && reviews.summary.totalReviews > 0 ? (
              <>
                <strong>{reviews.summary.averageRating.toFixed(1)} <span aria-hidden="true">★</span></strong>
                <span>{reviews.summary.totalReviews} đánh giá</span>
              </>
            ) : (
              <span>Chưa có đánh giá</span>
            )}
          </div>
          <div className="product-detail-pricing">
            <strong className="product-detail-price">{formatCurrency(product.price)}</strong>
            {discountPercentage !== null && product.originalPrice && (
              <div>
                <del>{formatCurrency(product.originalPrice)}</del>
                <span>-{discountPercentage}%</span>
              </div>
            )}
          </div>
          <div className={`product-detail-stock${isOutOfStock ? ' product-detail-stock--empty' : ''}`}>
            <span aria-hidden="true" />{isOutOfStock ? 'Hết hàng' : `Còn ${availableQuantity} sản phẩm`}
          </div>

          <div className="commerce-services">
            <div><span className="commerce-services__symbol" aria-hidden="true">↗</span><div><strong>Vận chuyển</strong><p>Giao hàng toàn quốc</p><small>Miễn phí vận chuyển cho đơn đủ điều kiện</small></div></div>
            <div><span className="commerce-services__symbol" aria-hidden="true">✓</span><div><strong>Bảo đảm</strong><p>Đổi trả trong 7 ngày</p><small>Thanh toán an toàn trên MarketNest</small></div></div>
          </div>

          <div className="quantity-row">
            <span>Số lượng</span>
            <div className="quantity-control" aria-label="Chọn số lượng">
              <button type="button" onClick={decreaseQuantity} disabled={isOutOfStock || quantity <= 1} aria-label="Giảm số lượng">−</button>
              <output aria-live="polite">{quantity}</output>
              <button type="button" onClick={increaseQuantity} disabled={isOutOfStock || quantity >= availableQuantity} aria-label="Tăng số lượng">+</button>
            </div>
          </div>

          <div className="product-actions">
            <button
              className="add-to-cart-button"
              type="button"
              onClick={() => void handleAddToCart()}
              disabled={isOutOfStock || isAddingToCart || isBuyingNow}
            >
              {isAddingToCart ? 'Đang thêm...' : 'Thêm vào giỏ hàng'}
            </button>
            <button
              className="buy-now-button"
              type="button"
              onClick={() => void handleBuyNow()}
              disabled={isOutOfStock || isAddingToCart || isBuyingNow}
            >
              {isBuyingNow ? 'Đang chuẩn bị...' : 'Mua ngay'}
            </button>
            <button
              className={`wishlist-button${isFavorite ? ' wishlist-button--active' : ''}`}
              type="button"
              onClick={() => void handleWishlistToggle()}
              disabled={isWishlistLoading || isWishlistUpdating}
              aria-pressed={isFavorite}
            >
              <span aria-hidden="true">{isFavorite ? '♥' : '♡'}</span>
              {isWishlistLoading
                ? 'Đang kiểm tra...'
                : isWishlistUpdating
                  ? 'Đang cập nhật...'
                  : isFavorite
                    ? 'Đã yêu thích'
                    : 'Yêu thích'}
            </button>
          </div>
          {feedbackMessage && <p className="cart-feedback" role="status">{feedbackMessage}</p>}
          {cartError && <p className="cart-feedback-error" role="alert">{cartError}</p>}
          {wishlistError && <p className="wishlist-feedback-error" role="alert">{wishlistError}</p>}
        </div>
      </section>

      <section className="product-detail-section product-specifications" aria-labelledby="specification-title">
        <h2 id="specification-title">Thông tin sản phẩm</h2>
        <dl>
          <div><dt>Danh mục</dt><dd>{categoryName}</dd></div>
          <div><dt>Mã sản phẩm</dt><dd>#{product.productId}</dd></div>
          <div><dt>Tình trạng</dt><dd>{isOutOfStock ? 'Hết hàng' : 'Còn hàng'}</dd></div>
          <div><dt>Kho hiện tại</dt><dd>{availableQuantity} sản phẩm</dd></div>
        </dl>
      </section>

      <section className="product-detail-section" aria-labelledby="description-title">
        <h2 id="description-title">Mô tả sản phẩm</h2>
        <p>{product.description || 'Chưa có mô tả cho sản phẩm này.'}</p>
      </section>

      <section className="shop-information" aria-labelledby="shop-title">
        <div className="shop-information__identity">
          <ShopLogo
            logoUrl={product.shop?.logoUrl ?? null}
            shopName={product.shop?.name ?? `Gian hàng ${product.shopId}`}
          />
          <div className="shop-information__copy">
            <h2 id="shop-title">
              {product.shop?.name ?? `Gian hàng #${product.shopId}`}
              <span className="shop-information__verified" aria-label="Gian hàng đang hoạt động">✓</span>
            </h2>
            <span className="shop-status"><i aria-hidden="true" />Đang hoạt động</span>
            <button className="shop-information__view-button" type="button">
              <span aria-hidden="true">▣</span>Xem Shop
            </button>
          </div>
        </div>
        <div className="shop-information__metrics">
          <div>
            <span>Sản phẩm</span>
            <strong>
              {product.shop?.productCount !== undefined
                ? `${product.shop.productCount} sản phẩm`
                : '—'}
            </strong>
            <small>Đang hiển thị công khai</small>
          </div>
          <div>
            <span>Đánh giá gian hàng</span>
            <strong>
              {product.shop?.reviewCount !== undefined
                ? `${product.shop.reviewCount} review`
                : '—'}
            </strong>
            <small>Trên tất cả sản phẩm của Shop</small>
          </div>
        </div>
      </section>

      <section className="product-detail-section product-reviews" aria-labelledby="reviews-title">
        <div className="section-title-row">
          <h2 id="reviews-title">Đánh giá sản phẩm</h2>
          {reviews && <span>{reviews.summary.totalReviews} đánh giá</span>}
        </div>

        {isReviewsLoading && (
          <div className="product-review-state" aria-busy="true">Đang tải đánh giá...</div>
        )}

        {!isReviewsLoading && reviewError && (
          <div className="product-review-state is-error" role="alert">
            <p>{reviewError}</p>
            <button type="button" onClick={() => setReviewReloadKey((value) => value + 1)}>Thử lại</button>
          </div>
        )}

        {!isReviewsLoading && !reviewError && reviews && reviews.summary.totalReviews === 0 && (
          <div className="product-review-state">
            <strong>Chưa có đánh giá</strong>
            <p>Hãy là khách hàng đầu tiên chia sẻ trải nghiệm về sản phẩm.</p>
          </div>
        )}

        {!isReviewsLoading && !reviewError && reviews && reviews.summary.totalReviews > 0 && (
          <>
            <div className="review-overview">
              <strong>{reviews.summary.averageRating.toFixed(1)} <small>/ 5</small></strong>
              <div>
                <span aria-label={`${reviews.summary.averageRating} sao`}>
                  {'★'.repeat(Math.round(reviews.summary.averageRating))}
                  {'☆'.repeat(5 - Math.round(reviews.summary.averageRating))}
                </span>
                <p>{reviews.summary.totalReviews} đánh giá đã xác thực</p>
              </div>
            </div>
            <div className="review-list">
              {reviews.data.map((review) => (
                <article key={review.reviewId}>
                  <div className="review-avatar" aria-hidden="true">{review.customerName.charAt(0)}</div>
                  <div>
                    <header>
                      <strong>{review.customerName}</strong>
                      <time dateTime={review.createdAt}>{formatOrderDate(review.createdAt)}</time>
                    </header>
                    <span className="review-stars" aria-label={`${review.rating} sao`}>
                      {'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}
                    </span>
                    {review.comment && <p>{review.comment}</p>}
                    {review.sellerReply && (
                      <div className="review-shop-response">
                        {product.shop?.logoUrl ? (
                          <img src={product.shop.logoUrl} alt={`Logo ${product.shop.name}`} loading="lazy" />
                        ) : (
                          <span aria-hidden="true">
                            {(product.shop?.name ?? 'M').charAt(0).toLocaleUpperCase('vi')}
                          </span>
                        )}
                        <div>
                          <div className="review-shop-response__heading">
                            <strong>Phản hồi từ cửa hàng</strong>
                            {review.sellerRepliedAt && (
                              <time dateTime={review.sellerRepliedAt}>{formatOrderDate(review.sellerRepliedAt)}</time>
                            )}
                          </div>
                          <p>{review.sellerReply}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>

      {relatedProducts.length > 0 && <section className="related-products" aria-labelledby="related-title">
        <div className="related-products__heading"><h2 id="related-title">Sản phẩm liên quan</h2><span>Cùng danh mục và các lựa chọn khác</span></div>
        <div className="related-products__grid">
          {relatedProducts.map((item) => <ProductCard key={item.productId} product={item} />)}
        </div>
      </section>}
    </main>
  );
}

function ShopLogo({
  logoUrl,
  shopName,
}: {
  logoUrl: string | null;
  shopName: string;
}) {
  const [hasImageError, setHasImageError] = useState(false);

  if (!logoUrl || hasImageError) {
    return (
      <span className="shop-information__avatar" aria-hidden="true">
        {shopName.trim().charAt(0).toLocaleUpperCase('vi') || 'M'}
      </span>
    );
  }

  return (
    <img
      className="shop-information__avatar"
      src={logoUrl}
      alt={`Logo ${shopName}`}
      onError={() => setHasImageError(true)}
    />
  );
}
