import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { BannerCarousel } from '../../components/customer/BannerCarousel';
import { CategorySection } from '../../components/customer/CategorySection';
import { ProductCard } from '../../components/product/ProductCard';
import { mockBanners, mockSidePromotions } from '../../mock/banners';
import { mockCategories } from '../../mock/categories';
import { mockProducts } from '../../mock/products';
import type { PublicProduct } from '../../types/product';
import './customer-home.css';

interface CustomerOutletContext {
  searchTerm: string;
  setSearchTerm: (value: string) => void;
}

export function CustomerHomePage() {
  // Replace this source with API-backed state when GET /products is enabled.
  const products: PublicProduct[] = mockProducts;
  const { searchTerm, setSearchTerm } = useOutletContext<CustomerOutletContext>();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLocaleLowerCase('vi');

    return products.filter((product) => {
      const matchesSearch =
        !normalizedSearch ||
        product.name.toLocaleLowerCase('vi').includes(normalizedSearch);
      const matchesCategory =
        selectedCategoryId === null || product.categoryId === selectedCategoryId;

      return matchesSearch && matchesCategory;
    });
  }, [products, searchTerm, selectedCategoryId]);

  const suggestedProducts = useMemo(
    () => [...filteredProducts].reverse(),
    [filteredProducts],
  );

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedCategoryId(null);
  };

  return (
    <main className="customer-home">
      <section className="promotion-area" aria-label="Chương trình nổi bật">
        <BannerCarousel banners={mockBanners} />
        <aside className="side-promotions" aria-label="Ưu đãi khác">
          {mockSidePromotions.map((promotion) => (
            <article className="side-promotion" key={promotion.promotionId}>
              <img src={promotion.imageUrl} alt="" />
              <div className="side-promotion__overlay" />
              <div>
                <h2>{promotion.title}</h2>
                <p>{promotion.subtitle}</p>
              </div>
            </article>
          ))}
        </aside>
      </section>

      <CategorySection
        categories={mockCategories}
        selectedCategoryId={selectedCategoryId}
        onSelect={setSelectedCategoryId}
      />

      <section className="featured-section" id="featured-products" aria-labelledby="featured-title">
        <div className="market-section-heading featured-section__heading">
          <div>
            <h2 id="featured-title">Sản phẩm nổi bật</h2>
            {(searchTerm || selectedCategoryId) && (
              <p>{filteredProducts.length} kết quả phù hợp</p>
            )}
          </div>
          {(searchTerm || selectedCategoryId) && (
            <button type="button" onClick={clearFilters}>Xóa bộ lọc</button>
          )}
        </div>

        {filteredProducts.length > 0 ? (
          <div className="product-grid">
            {filteredProducts.map((product) => (
              <ProductCard key={product.productId} product={product} />
            ))}
          </div>
        ) : (
          <div className="catalog-empty">
            <span aria-hidden="true">0</span>
            <h3>Không tìm thấy sản phẩm phù hợp</h3>
            <p>Hãy thử một từ khóa hoặc danh mục khác.</p>
            <button type="button" onClick={clearFilters}>Xem tất cả sản phẩm</button>
          </div>
        )}
      </section>

      {suggestedProducts.length > 0 && (
        <section className="suggestion-section" aria-labelledby="suggestion-title">
          <div className="market-section-heading suggestion-section__heading">
            <div>
              <h2 id="suggestion-title">Gợi ý hôm nay</h2>
              <p>Sản phẩm được sắp xếp lại để bạn khám phá thêm lựa chọn.</p>
            </div>
          </div>
          <div className="product-grid">
            {suggestedProducts.map((product) => (
              <ProductCard key={`suggested-${product.productId}`} product={product} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
