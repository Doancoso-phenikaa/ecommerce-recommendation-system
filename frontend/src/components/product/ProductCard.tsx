import { Link } from 'react-router-dom';
import type { PublicProduct } from '../../types/product';
import { formatCurrency } from '../../utils/format-currency';
import './product-card.css';
import './product-card-link.css';

interface ProductCardProps {
  product: PublicProduct;
}

export function ProductCard({ product }: ProductCardProps) {
  const availableQuantity = Math.max(product.inventory.availableQuantity, 0);
  const isInStock = availableQuantity > 0;

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
        <strong className="product-card__price">{formatCurrency(product.price)}</strong>
        <p className={`product-card__stock${isInStock ? '' : ' product-card__stock--empty'}`}>
          {isInStock ? `Còn ${availableQuantity} sản phẩm` : 'Tạm hết hàng'}
        </p>
      </div>
    </Link>
  );
}
