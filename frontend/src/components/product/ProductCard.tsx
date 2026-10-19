import { Link } from 'react-router-dom';
import type { PublicProduct } from '../../types/product';
import { formatCurrency } from '../../utils/format-currency';
import { getProductDiscountPercentage } from '../../utils/product-price';
import './product-card.css';
import './product-card-link.css';
import './product-card-compact.css';

interface ProductCardProps {
  product: PublicProduct;
}

export function ProductCard({ product }: ProductCardProps) {
  const availableQuantity = Math.max(product.inventory.availableQuantity, 0);
  const isInStock = availableQuantity > 0;
  const discountPercentage = getProductDiscountPercentage(
    product.price,
    product.originalPrice,
  );

  return (
    <Link className="product-card" to={`/products/${product.productId}`} aria-label={`Xem ${product.name}`}>
      <div className="product-card__media">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} loading="lazy" />
        ) : (
          <div className="product-card__fallback" aria-label="Sản phẩm chưa có hình ảnh">
            <span>{product.name.charAt(0)}</span>
            <small>Chưa có hình ảnh</small>
          </div>
        )}
      </div>

      <div className="product-card__body">
        <h3>{product.name}</h3>
        <div className="product-card__pricing">
          <strong className="product-card__price">{formatCurrency(product.price)}</strong>
          {discountPercentage !== null && product.originalPrice && (
            <div className="product-card__discount">
              <del>{formatCurrency(product.originalPrice)}</del>
              <span>-{discountPercentage}%</span>
            </div>
          )}
        </div>
        <p className={`product-card__stock${isInStock ? '' : ' product-card__stock--empty'}`}>
          {isInStock ? `Còn ${availableQuantity} sản phẩm` : 'Tạm hết hàng'}
        </p>
      </div>
    </Link>
  );
}
