import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ProductCard } from '../../components/product/ProductCard';
import { mockCategories } from '../../mock/categories';
import { mockProducts } from '../../mock/products';
import type { PublicProduct } from '../../types/product';
import { formatCurrency } from '../../utils/format-currency';
import './product-detail.css';

const mockReviews = [
  { reviewId: 'r1', customerName: 'Minh Anh', rating: 5, comment: 'Sản phẩm giống mô tả, đóng gói cẩn thận và sử dụng rất ổn.', date: '12/10/2026' },
  { reviewId: 'r2', customerName: 'Hoàng Nam', rating: 5, comment: 'Chất lượng tốt trong tầm giá, giao hàng nhanh hơn dự kiến.', date: '08/10/2026' },
  { reviewId: 'r3', customerName: 'Thu Hà', rating: 4, comment: 'Thiết kế đẹp và dễ sử dụng. Mình sẽ tiếp tục theo dõi gian hàng.', date: '02/10/2026' },
];

export function ProductDetailPage() {
  const { productId } = useParams<{ productId: string }>();
  const product = mockProducts.find((item) => item.productId === productId);

  if (!product) {
    return (
      <main className="product-detail-page">
        <section className="product-not-found">
          <span aria-hidden="true">?</span>
          <h1>Sản phẩm không tồn tại</h1>
          <p>Sản phẩm bạn đang tìm có thể đã được thay đổi hoặc không còn hiển thị.</p>
          <Link to="/">Quay lại trang chủ</Link>
        </section>
      </main>
    );
  }

  return <ProductDetailContent key={product.productId} product={product} />;
}

function ProductDetailContent({ product }: { product: PublicProduct }) {
  const [quantity, setQuantity] = useState(1);
  const [isFavorite, setIsFavorite] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const availableQuantity = Math.max(product.inventory.availableQuantity, 0);
  const isOutOfStock = availableQuantity === 0;
  const categoryName = mockCategories.find(
    (category) => category.categoryId === product.categoryId,
  )?.name ?? `Danh mục #${product.categoryId}`;
  const sameCategoryProducts = mockProducts.filter(
    (item) => item.productId !== product.productId && item.categoryId === product.categoryId,
  );
  const otherProducts = mockProducts.filter(
    (item) => item.productId !== product.productId && item.categoryId !== product.categoryId,
  );
  const relatedProducts = [...sameCategoryProducts, ...otherProducts].slice(0, 4);

  useEffect(() => {
    if (!feedbackMessage) return undefined;
    const timer = window.setTimeout(() => setFeedbackMessage(''), 3000);
    return () => window.clearTimeout(timer);
  }, [feedbackMessage]);

  const decreaseQuantity = () => setQuantity((current) => Math.max(1, current - 1));
  const increaseQuantity = () => {
    setQuantity((current) => Math.min(availableQuantity, current + 1));
  };
  const handleAddToCart = () => {
    if (!isOutOfStock) setFeedbackMessage('Đã thêm sản phẩm vào giỏ hàng');
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
            <strong>4.8 <span aria-hidden="true">★</span></strong>
            <span>120 đánh giá</span><span>350 đã bán</span>
          </div>
          <strong className="product-detail-price">{formatCurrency(product.price)}</strong>
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
            <button className="add-to-cart-button" type="button" onClick={handleAddToCart} disabled={isOutOfStock}>Thêm vào giỏ hàng</button>
            <button className="buy-now-button" type="button" onClick={() => setFeedbackMessage('Tính năng mua ngay sẽ được kết nối sau')} disabled={isOutOfStock}>Mua ngay</button>
            <button className={`wishlist-button${isFavorite ? ' wishlist-button--active' : ''}`} type="button" onClick={() => setIsFavorite((current) => !current)} aria-pressed={isFavorite}>
              <span aria-hidden="true">{isFavorite ? '♥' : '♡'}</span>{isFavorite ? 'Đã yêu thích' : 'Yêu thích'}
            </button>
          </div>
          {feedbackMessage && <p className="cart-feedback" role="status">{feedbackMessage}</p>}
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
        <div className="shop-information__avatar" aria-hidden="true">S</div>
        <div>
          <p>Thông tin gian hàng</p>
          <h2 id="shop-title">Gian hàng #{product.shopId}</h2>
          <span className="shop-status"><i aria-hidden="true" />Đang hoạt động</span>
          <small>Sản phẩm được đăng bán bởi gian hàng trên MarketNest.</small>
        </div>
        <button type="button">Xem gian hàng</button>
      </section>

      <section className="product-detail-section product-reviews" aria-labelledby="reviews-title">
        <div className="section-title-row"><h2 id="reviews-title">Đánh giá sản phẩm</h2><span>Dữ liệu minh họa</span></div>
        <div className="review-overview"><strong>4.8 <small>/ 5</small></strong><div><span aria-label="5 sao">★★★★★</span><p>120 đánh giá</p></div></div>
        <div className="review-list">
          {mockReviews.map((review) => (
            <article key={review.reviewId}>
              <div className="review-avatar" aria-hidden="true">{review.customerName.charAt(0)}</div>
              <div><header><strong>{review.customerName}</strong><time>{review.date}</time></header><span className="review-stars" aria-label={`${review.rating} sao`}>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span><p>{review.comment}</p></div>
            </article>
          ))}
        </div>
      </section>

      <section className="related-products" aria-labelledby="related-title">
        <div className="related-products__heading"><h2 id="related-title">Sản phẩm liên quan</h2><span>Cùng danh mục và các lựa chọn khác</span></div>
        <div className="related-products__grid">
          {relatedProducts.map((item) => <ProductCard key={item.productId} product={item} />)}
        </div>
      </section>
    </main>
  );
}
