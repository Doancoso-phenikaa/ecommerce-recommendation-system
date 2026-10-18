import { Link } from 'react-router-dom';
import type { PublicProduct } from '../../types/product';
import { formatCurrency } from '../../utils/format-currency';
import { getProductDiscountPercentage } from '../../utils/product-price';
import './home-product-card.css';

interface HomeProductCardProps {
  product: PublicProduct;
  promotionalLabel?: string;
  isWishlisted: boolean;
  isWishlistUpdating: boolean;
  onWishlistToggle: (productId: string) => Promise<void>;
}

export function HomeProductCard({
  product,
  promotionalLabel,
  isWishlisted,
  isWishlistUpdating,
  onWishlistToggle,
}: HomeProductCardProps) {
  const availableQuantity = Math.max(product.inventory.availableQuantity, 0);
  const discountPercentage = getProductDiscountPercentage(
    product.price,
    product.originalPrice,
  );
  const displayedPromotion =
    discountPercentage !== null ? `-${discountPercentage}%` : promotionalLabel;

  return (
    <article className="home-product-card">
      <Link
        className="home-product-card__media"
        to={`/products/${product.productId}`}
        aria-label={`Xem ${product.name}`}
      >
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} loading="lazy" />
        ) : (
          <span>{product.name.charAt(0).toLocaleUpperCase('vi')}</span>
        )}
        {displayedPromotion && (
          <small
            aria-label={
              discountPercentage !== null
                ? `Giảm ${discountPercentage}%`
                : 'Nhãn khuyến mại minh họa'
            }
          >
            {displayedPromotion}
          </small>
        )}
      </Link>
      <button
        className={`home-product-card__wishlist${isWishlisted ? ' is-active' : ''}`}
        type="button"
        aria-label={
          isWishlisted
            ? `Xóa ${product.name} khỏi yêu thích`
            : `Thêm ${product.name} vào yêu thích`
        }
        aria-pressed={isWishlisted}
        disabled={isWishlistUpdating}
        onClick={() => void onWishlistToggle(product.productId)}
      >
        {isWishlistUpdating ? '…' : isWishlisted ? '♥' : '♡'}
      </button>
      <div className="home-product-card__body">
        <Link to={`/products/${product.productId}`}>
          <h3>{product.name}</h3>
        </Link>
        <div className="home-product-card__pricing">
          <strong>{formatCurrency(product.price)}</strong>
          {discountPercentage !== null && product.originalPrice && (
            <div>
              <del>{formatCurrency(product.originalPrice)}</del>
              <span>-{discountPercentage}%</span>
            </div>
          )}
        </div>
        <div className="home-product-card__meta">
          <span>
            {availableQuantity > 0
              ? `Còn ${availableQuantity} sản phẩm`
              : 'Tạm hết hàng'}
          </span>
          <small>Shop #{product.shopId}</small>
        </div>
      </div>
    </article>
  );
}
