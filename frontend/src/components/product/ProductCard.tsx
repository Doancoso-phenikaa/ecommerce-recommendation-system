import type { PublicProduct } from '../../types/product';
import './product-card.css';

interface ProductCardProps {
  product: PublicProduct;
}

const currencyFormatter = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

export function ProductCard({ product }: ProductCardProps) {
  const availableQuantity = Math.max(product.inventory.availableQuantity, 0);
  const isInStock = availableQuantity > 0;

  return (
    <article className="product-card">
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
        <strong className="product-card__price">{currencyFormatter.format(Number(product.price))}</strong>
        <p className={`product-card__stock${isInStock ? '' : ' product-card__stock--empty'}`}>
          {isInStock ? `Còn ${availableQuantity} sản phẩm` : 'Tạm hết hàng'}
        </p>
        <button className="product-card__action" type="button" aria-label={`Xem chi tiết ${product.name}`}>
          Xem chi tiết
        </button>
      </div>
    </article>
  );
}
