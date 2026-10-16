import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getActiveCategories } from '../../api/category.api';
import { getProducts } from '../../api/product.api';
import { ProductCard } from '../../components/product/ProductCard';
import type { Category } from '../../types/category';
import type { ProductListResponse } from '../../types/product';
import { getApiErrorMessage } from '../../utils/auth';
import './category-product.css';

const PAGE_SIZE = 12;

export function CategoryProductPage() {
  const { categoryId = '' } = useParams();
  const [category, setCategory] = useState<Category | null>(null);
  const [result, setResult] = useState<ProductListResponse | null>(null);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isNotFound, setIsNotFound] = useState(false);

  useEffect(() => {
    let isCurrent = true;

    const loadCategoryProducts = async () => {
      setIsLoading(true);
      setError('');
      setIsNotFound(false);

      if (!/^[1-9]\d*$/.test(categoryId)) {
        setCategory(null);
        setResult(null);
        setIsNotFound(true);
        setIsLoading(false);
        return;
      }

      try {
        const activeCategories = await getActiveCategories();
        if (!isCurrent) return;

        const activeCategory = activeCategories.find(
          (item) => item.categoryId === categoryId,
        );

        if (!activeCategory) {
          setCategory(null);
          setResult(null);
          setIsNotFound(true);
          return;
        }

        setCategory(activeCategory);
        const products = await getProducts({ categoryId, page, limit: PAGE_SIZE });
        if (isCurrent) setResult(products);
      } catch (requestError: unknown) {
        if (isCurrent) {
          setError(
            getApiErrorMessage(
              requestError,
              'Không thể tải sản phẩm trong danh mục.',
            ),
          );
        }
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    };

    void loadCategoryProducts();
    return () => {
      isCurrent = false;
    };
  }, [categoryId, page]);

  if (isNotFound) {
    return (
      <main className="category-product-page">
        <div className="category-product-state">
          <span aria-hidden="true">?</span>
          <h1>Không tìm thấy danh mục</h1>
          <p>Danh mục này không tồn tại hoặc hiện không còn hoạt động.</p>
          <Link to="/">Tiếp tục khám phá</Link>
        </div>
      </main>
    );
  }

  if (isLoading && !category) {
    return (
      <main className="category-product-page">
        <div className="category-product-loading" aria-busy="true">Đang tải danh mục...</div>
      </main>
    );
  }

  if (!category) {
    return (
      <main className="category-product-page">
        <div className="category-product-state category-product-state--error">
          <span aria-hidden="true">!</span>
          <h1>Không thể tải danh mục</h1>
          <p>{error}</p>
          <Link to="/">Quay lại trang chủ</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="category-product-page">
      <nav className="category-product-breadcrumb" aria-label="Breadcrumb">
        <Link to="/">Trang chủ</Link><span aria-hidden="true">/</span><strong>{category.name}</strong>
      </nav>

      <header className="category-product-hero">
        <CategoryHeroImage key={category.imageUrl ?? category.categoryId} category={category} />
        <div><span>Danh mục sản phẩm</span><h1>{category.name}</h1><p>{category.description || 'Khám phá các sản phẩm đang được bán trong danh mục này.'}</p></div>
      </header>

      <section className="category-product-catalog" aria-labelledby="category-products-title">
        <div className="category-product-heading">
          <div><h2 id="category-products-title">Sản phẩm trong danh mục</h2><p>{result?.pagination.totalItems ?? 0} sản phẩm</p></div>
          <Link to="/">Tiếp tục khám phá</Link>
        </div>

        {isLoading ? (
          <div className="category-product-loading" aria-busy="true">Đang tải sản phẩm...</div>
        ) : error ? (
          <div className="category-product-state category-product-state--error"><span aria-hidden="true">!</span><h2>Không thể tải sản phẩm</h2><p>{error}</p></div>
        ) : result?.data.length ? (
          <>
            <div className="category-product-grid">
              {result.data.map((product) => <ProductCard key={product.productId} product={product} />)}
            </div>
            <footer className="category-product-pagination">
              <span>Trang {result.pagination.page} / {Math.max(result.pagination.totalPages, 1)}</span>
              <div>
                <button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Trước</button>
                <button type="button" disabled={page >= result.pagination.totalPages} onClick={() => setPage((current) => current + 1)}>Sau</button>
              </div>
            </footer>
          </>
        ) : (
          <div className="category-product-state"><span aria-hidden="true">0</span><h2>Chưa có sản phẩm nào trong danh mục này.</h2><p>Hãy quay lại sau hoặc khám phá các danh mục khác.</p><Link to="/">Tiếp tục khám phá</Link></div>
        )}
      </section>
    </main>
  );
}

function CategoryHeroImage({ category }: { category: Category }) {
  const [hasError, setHasError] = useState(false);

  if (!category.imageUrl || hasError) {
    return <div className="category-product-hero__fallback" aria-hidden="true">{category.name.charAt(0).toLocaleUpperCase('vi')}</div>;
  }

  return <img src={category.imageUrl} alt="" onError={() => setHasError(true)} />;
}
