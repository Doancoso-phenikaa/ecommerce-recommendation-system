import type { PublicProduct } from '../../types/product';
import { ProductCard } from '../product/ProductCard';
import './recommendation-section.css';

interface RecommendationSectionProps {
  title: string;
  products: PublicProduct[];
  isLoading: boolean;
  subtitle?: string;
  className?: string;
  skeletonCount?: number;
}

export function RecommendationSection({
  title,
  products,
  isLoading,
  subtitle,
  className = '',
  skeletonCount = 5,
}: RecommendationSectionProps) {
  if (!isLoading && products.length === 0) return null;

  return (
    <section
      className={`recommendation-section ${className}`.trim()}
      aria-label={title}
    >
      <header className="recommendation-section__heading">
        <div>
          <span>Lựa chọn dành cho bạn</span>
          <h2>{title}</h2>
        </div>
        {subtitle && <p>{subtitle}</p>}
      </header>

      {isLoading ? (
        <div
          className="recommendation-section__skeleton"
          aria-label={`Đang tải ${title.toLocaleLowerCase('vi')}`}
          aria-busy="true"
        >
          {Array.from({ length: skeletonCount }, (_, index) => (
            <span key={index} aria-hidden="true" />
          ))}
        </div>
      ) : (
        <div className="recommendation-section__grid">
          {products.map((product) => (
            <ProductCard key={product.productId} product={product} />
          ))}
        </div>
      )}
    </section>
  );
}
