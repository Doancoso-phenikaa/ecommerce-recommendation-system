import type { PublicProduct } from '../../types/product';
import { ProductCard } from '../product/ProductCard';
import './product-listing.css';

interface ProductGridProps {
  products: PublicProduct[];
  isLoading: boolean;
  error?: string;
  onResetFilters?: () => void;
}

export function ProductGrid({ products, isLoading, error, onResetFilters }: ProductGridProps) {
  if (isLoading) {
    return (
      <div className="listing-grid" aria-label="Đang tải sản phẩm" aria-busy="true">
        {Array.from({ length: 10 }, (_, index) => (
          <div className="listing-product-skeleton" key={index} aria-hidden="true">
            <div />
            <span />
            <span />
            <small />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="listing-state listing-state--error" role="alert">
        <span aria-hidden="true">!</span>
        <h2>Không thể tải sản phẩm</h2>
        <p>{error}</p>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="listing-state">
        <span aria-hidden="true">0</span>
        <h2>Không tìm thấy sản phẩm phù hợp</h2>
        <p>Thử thay đổi khoảng giá, gian hàng hoặc điều kiện còn hàng.</p>
        {onResetFilters && <button type="button" onClick={onResetFilters}>Xóa bộ lọc</button>}
      </div>
    );
  }

  return (
    <div className="listing-grid">
      {products.map((product) => <ProductCard key={product.productId} product={product} />)}
    </div>
  );
}
