import { Link } from 'react-router-dom';
import type { PublicProduct } from '../../types/product';
import { formatCurrency } from '../../utils/format-currency';
import './product-card.css';

interface ProductCardProps {
  product: PublicProduct;
}

export function ProductCard({ product }: ProductCardProps) {
  const availableQuantity = Math.max(product.inventory.availableQuantity, 0);
  const isInStock = availableQuantity > 0;

  return (
    <article className="product-card">
      <Link className="product-card__media" to={`/products/${product.productId}`} aria-label={`Xem ${product.name}`}>
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} loading="lazy" />
        ) : (
          <div className="product-card__fallback" aria-label="Sản phẩm chưa có hình ảnh">
            <span>{product.name.charAt(0)}</span>
            <small>Chưa có hình ảnh</small>
          </div>
        )}
      </Link>

      <div className="product-card__body">
        <h3><Link to={`/products/${product.productId}`}>{product.name}</Link></h3>
        <strong className="product-card__price">{formatCurrency(product.price)}</strong>
        <p className={`product-card__stock${isInStock ? '' : ' product-card__stock--empty'}`}>
          {isInStock ? `Còn ${availableQuantity} sản phẩm` : 'Tạm hết hàng'}
        </p>
        <Link className="product-card__action" to={`/products/${product.productId}`} aria-label={`Xem chi tiết ${product.name}`}>
          Xem chi tiết
        </Link>
      </div>
    </article>
  );
}
