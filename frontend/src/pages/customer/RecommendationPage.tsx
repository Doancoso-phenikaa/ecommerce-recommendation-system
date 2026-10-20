import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getRecommendations } from '../../api/recommendation.api';
import { ProductGrid } from '../../components/product-listing/ProductGrid';
import type { RecommendedProductItem } from '../../types/recommendation';
import { getApiErrorMessage } from '../../utils/auth';
import './recommendation-page.css';

export function RecommendationPage() {
  const [recommendations, setRecommendations] = useState<RecommendedProductItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isCurrent = true;

    const loadRecommendations = async () => {
      setIsLoading(true);
      setError('');

      try {
        const result = await getRecommendations(20);
        if (isCurrent) setRecommendations(result.items);
      } catch (requestError: unknown) {
        if (isCurrent) {
          setError(
            getApiErrorMessage(
              requestError,
              'Không thể tải danh sách gợi ý lúc này.',
            ),
          );
        }
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    };

    void loadRecommendations();
    return () => {
      isCurrent = false;
    };
  }, []);

  return (
    <main className="recommendation-page">
      <nav className="recommendation-page__breadcrumb" aria-label="Breadcrumb">
        <Link to="/">Trang chủ</Link>
        <span aria-hidden="true">/</span>
        <strong>Sản phẩm gợi ý</strong>
      </nav>

      <header className="recommendation-page__header">
        <div>
          <span>Dành riêng cho bạn</span>
          <h1>Sản phẩm gợi ý</h1>
          <p>Những lựa chọn được đề xuất dựa trên hoạt động mua sắm của bạn.</p>
        </div>
        {!isLoading && !error && (
          <strong>{recommendations.length} sản phẩm</strong>
        )}
      </header>

      <section aria-label="Danh sách sản phẩm gợi ý">
        <ProductGrid
          products={recommendations.map(({ product }) => product)}
          isLoading={isLoading}
          error={error}
          emptyTitle="Chưa có sản phẩm gợi ý"
          emptyMessage="Hãy tiếp tục xem sản phẩm, thêm vào yêu thích hoặc giỏ hàng để nhận gợi ý phù hợp hơn."
        />
      </section>
    </main>
  );
}
