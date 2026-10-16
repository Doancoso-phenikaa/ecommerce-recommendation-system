import { useEffect, useMemo, useState } from 'react';
import { getActiveCategories } from '../../api/category.api';
import { getProducts } from '../../api/product.api';
import { BannerCarousel } from '../../components/customer/BannerCarousel';
import { CategorySection } from '../../components/customer/CategorySection';
import { ProductCard } from '../../components/product/ProductCard';
import { mockBanners, mockSidePromotions } from '../../mock/banners';
import type { Category } from '../../types/category';
import type { ProductListResponse } from '../../types/product';
import { getApiErrorMessage } from '../../utils/auth';
import './customer-home.css';
import './customer-product-states.css';

export function CustomerHomePage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isCategoryLoading, setIsCategoryLoading] = useState(true);
  const [categoryError, setCategoryError] = useState('');
  const [productResult, setProductResult] = useState<ProductListResponse | null>(null);
  const [isProductLoading, setIsProductLoading] = useState(true);
  const [productError, setProductError] = useState('');

  useEffect(() => {
    let isCurrent = true;

    void getActiveCategories()
      .then((activeCategories) => {
        if (isCurrent) setCategories(activeCategories);
      })
      .catch((requestError: unknown) => {
        if (isCurrent) {
          setCategoryError(getApiErrorMessage(requestError, 'Không thể tải danh mục lúc này.'));
        }
      })
      .finally(() => {
        if (isCurrent) setIsCategoryLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    let isCurrent = true;

    void getProducts({ page: 1, limit: 10 })
      .then((result) => {
        if (isCurrent) setProductResult(result);
      })
      .catch((requestError: unknown) => {
        if (isCurrent) {
          setProductError(getApiErrorMessage(requestError, 'Không thể tải sản phẩm.'));
        }
      })
      .finally(() => {
        if (isCurrent) setIsProductLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  const products = useMemo(() => productResult?.data ?? [], [productResult]);
  const suggestedProducts = useMemo(() => [...products].reverse(), [products]);

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

      <CategorySection categories={categories} isLoading={isCategoryLoading} error={categoryError} />

      <section className="featured-section" id="featured-products" aria-labelledby="featured-title">
        <div className="market-section-heading featured-section__heading">
          <div><h2 id="featured-title">Sản phẩm nổi bật</h2></div>
        </div>

        {isProductLoading ? (
          <div className="customer-product-skeleton" aria-label="Đang tải sản phẩm" aria-busy="true">
            {Array.from({ length: 10 }, (_, index) => <span key={index} />)}
          </div>
        ) : productError ? (
          <div className="catalog-empty catalog-empty--error" role="alert">
            <span aria-hidden="true">!</span>
            <h3>Không thể tải sản phẩm</h3>
            <p>{productError}</p>
          </div>
        ) : products.length > 0 ? (
          <div className="product-grid">
            {products.map((product) => <ProductCard key={product.productId} product={product} />)}
          </div>
        ) : (
          <div className="catalog-empty">
            <span aria-hidden="true">0</span>
            <h3>Chưa có sản phẩm để hiển thị</h3>
            <p>Hãy quay lại sau để khám phá các sản phẩm mới.</p>
          </div>
        )}
      </section>

      {!isProductLoading && !productError && suggestedProducts.length > 0 && (
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
