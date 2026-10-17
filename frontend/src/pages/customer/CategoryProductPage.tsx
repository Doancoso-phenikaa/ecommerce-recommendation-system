import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getActiveCategories } from '../../api/category.api';
import { getProducts } from '../../api/product.api';
import { ProductListingView } from '../../components/product-listing/ProductListingView';
import { useProductListingOptions } from '../../hooks/useProductListingOptions';
import { useProductListingParams } from '../../hooks/useProductListingParams';
import type { Category } from '../../types/category';
import type { ProductListResponse } from '../../types/product';
import { getApiErrorMessage } from '../../utils/auth';
import './category-product.css';

const PAGE_SIZE = 15;

export function CategoryProductPage() {
  const { categoryId = '' } = useParams();
  const { page, sort, filters, updateQuery, resetFilters } = useProductListingParams();
  const listingOptions = useProductListingOptions();
  const [category, setCategory] = useState<Category | null>(null);
  const [result, setResult] = useState<ProductListResponse | null>(null);
  const [isCategoryLoading, setIsCategoryLoading] = useState(true);
  const [isProductLoading, setIsProductLoading] = useState(false);
  const [categoryError, setCategoryError] = useState('');
  const [productError, setProductError] = useState('');
  const [isNotFound, setIsNotFound] = useState(false);

  useEffect(() => {
    let isCurrent = true;

    const loadCategory = async () => {
      setIsCategoryLoading(true);
      setCategoryError('');
      setIsNotFound(false);
      setCategory(null);

      if (!/^[1-9]\d*$/.test(categoryId)) {
        setIsNotFound(true);
        setIsCategoryLoading(false);
        return;
      }

      try {
        const categories = await getActiveCategories();
        if (!isCurrent) return;
        const currentCategory = categories.find((item) => item.categoryId === categoryId);

        if (!currentCategory) {
          setIsNotFound(true);
          return;
        }

        setCategory(currentCategory);
      } catch (requestError: unknown) {
        if (isCurrent) setCategoryError(getApiErrorMessage(requestError, 'Không thể tải danh mục.'));
      } finally {
        if (isCurrent) setIsCategoryLoading(false);
      }
    };

    void loadCategory();
    return () => {
      isCurrent = false;
    };
  }, [categoryId]);

  useEffect(() => {
    if (!category) return;
    let isCurrent = true;

    const loadProducts = async () => {
      setIsProductLoading(true);
      setProductError('');
      try {
        const response = await getProducts({
          categoryId: category.categoryId,
          shopId: filters.shopId || undefined,
          minPrice: filters.minPrice || undefined,
          maxPrice: filters.maxPrice || undefined,
          inStock: filters.inStock || undefined,
          sort,
          page,
          limit: PAGE_SIZE,
        });
        if (isCurrent) setResult(response);
      } catch (requestError: unknown) {
        if (isCurrent) {
          setProductError(getApiErrorMessage(requestError, 'Không thể tải sản phẩm trong danh mục.'));
        }
      } finally {
        if (isCurrent) setIsProductLoading(false);
      }
    };

    void loadProducts();
    return () => {
      isCurrent = false;
    };
  }, [category, filters.inStock, filters.maxPrice, filters.minPrice, filters.shopId, page, sort]);

  if (isNotFound) {
    return (
      <main className="category-product-page">
        <PageState title="Không tìm thấy danh mục" message="Danh mục này không tồn tại hoặc hiện không còn hoạt động." />
      </main>
    );
  }

  if (isCategoryLoading) {
    return <main className="category-product-page"><div className="category-page-loading">Đang tải danh mục...</div></main>;
  }

  if (!category) {
    return (
      <main className="category-product-page">
        <PageState title="Không thể tải danh mục" message={categoryError} isError />
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
        <div>
          <span>Danh mục sản phẩm</span>
          <h1>{category.name}</h1>
          <p>{category.description || 'Khám phá các sản phẩm đang được bán trong danh mục này.'}</p>
        </div>
      </header>

      <section className="category-product-catalog" aria-labelledby="category-products-title">
        <h2 className="category-product-catalog__title" id="category-products-title">Sản phẩm trong danh mục</h2>
        <ProductListingView
          sectionId="category-products"
          filters={filters}
          sort={sort}
          page={page}
          result={result}
          isLoading={isProductLoading}
          error={productError}
          {...listingOptions}
          onUpdateQuery={updateQuery}
          onResetFilters={resetFilters}
          trailingAction={<Link to="/">Tiếp tục khám phá</Link>}
        />
      </section>
    </main>
  );
}

function PageState({ title, message, isError = false }: { title: string; message: string; isError?: boolean }) {
  return (
    <div className={`category-page-state${isError ? ' category-page-state--error' : ''}`}>
      <span aria-hidden="true">{isError ? '!' : '?'}</span>
      <h1>{title}</h1>
      <p>{message}</p>
      <Link to="/">Quay lại trang chủ</Link>
    </div>
  );
}

function CategoryHeroImage({ category }: { category: Category }) {
  const [hasError, setHasError] = useState(false);

  if (!category.imageUrl || hasError) {
    return <div className="category-product-hero__fallback" aria-hidden="true">{category.name.charAt(0).toLocaleUpperCase('vi')}</div>;
  }

  return <img src={category.imageUrl} alt="" onError={() => setHasError(true)} />;
}
