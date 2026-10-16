import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { getActiveCategories } from '../../api/category.api';
import { getProducts } from '../../api/product.api';
import { getPublicShops } from '../../api/shop-public.api';
import { ProductFilterSidebar } from '../../components/product-listing/ProductFilterSidebar';
import { ProductGrid } from '../../components/product-listing/ProductGrid';
import { ProductListingToolbar } from '../../components/product-listing/ProductListingToolbar';
import { ProductPagination } from '../../components/product-listing/ProductPagination';
import type { ProductListingFilters } from '../../components/product-listing/product-listing.types';
import type { Category } from '../../types/category';
import type { ProductListResponse, ProductSort } from '../../types/product';
import type { PublicShop } from '../../types/shop';
import { getApiErrorMessage } from '../../utils/auth';
import './category-product.css';

const PAGE_SIZE = 15;
const SORT_OPTIONS: ProductSort[] = ['NEWEST', 'PRICE_ASC', 'PRICE_DESC'];

function readPositiveInteger(value: string | null, fallback: number): number {
  if (!value || !/^[1-9]\d*$/.test(value)) return fallback;
  return Number(value);
}

function readSort(value: string | null): ProductSort {
  return SORT_OPTIONS.includes(value as ProductSort) ? value as ProductSort : 'NEWEST';
}

export function CategoryProductPage() {
  const { categoryId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [category, setCategory] = useState<Category | null>(null);
  const [shops, setShops] = useState<PublicShop[]>([]);
  const [result, setResult] = useState<ProductListResponse | null>(null);
  const [isCategoryLoading, setIsCategoryLoading] = useState(true);
  const [isProductLoading, setIsProductLoading] = useState(false);
  const [isShopLoading, setIsShopLoading] = useState(true);
  const [categoryError, setCategoryError] = useState('');
  const [productError, setProductError] = useState('');
  const [shopError, setShopError] = useState('');
  const [isNotFound, setIsNotFound] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const page = readPositiveInteger(searchParams.get('page'), 1);
  const sort = readSort(searchParams.get('sort'));
  const filters = useMemo<ProductListingFilters>(() => ({
    shopId: searchParams.get('shopId') ?? '',
    minPrice: searchParams.get('minPrice') ?? '',
    maxPrice: searchParams.get('maxPrice') ?? '',
    inStock: searchParams.get('inStock') === 'true',
  }), [searchParams]);

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
        if (isCurrent) {
          setCategoryError(getApiErrorMessage(requestError, 'Không thể tải danh mục.'));
        }
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
    let isCurrent = true;

    const loadShops = async () => {
      setIsShopLoading(true);
      setShopError('');
      try {
        const response = await getPublicShops();
        if (isCurrent) setShops(response.data);
      } catch (requestError: unknown) {
        if (isCurrent) {
          setShopError(getApiErrorMessage(requestError, 'Không thể tải danh sách gian hàng.'));
        }
      } finally {
        if (isCurrent) setIsShopLoading(false);
      }
    };

    void loadShops();
    return () => {
      isCurrent = false;
    };
  }, []);

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

  const updateQuery = (updates: Record<string, string | null>, resetPage = true) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      Object.entries(updates).forEach(([key, value]) => {
        if (!value) next.delete(key);
        else next.set(key, value);
      });
      if (resetPage) next.delete('page');
      return next;
    });
  };

  const handlePageChange = (nextPage: number) => {
    updateQuery({ page: nextPage > 1 ? String(nextPage) : null }, false);
    document.getElementById('category-products')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const resetFilters = () => {
    updateQuery({ shopId: null, minPrice: null, maxPrice: null, inStock: null });
    setIsFilterOpen(false);
  };

  const filterProps = {
    filters,
    shops,
    isLoadingShops: isShopLoading,
    shopError,
    onShopChange: (shopId: string) => updateQuery({ shopId: shopId || null }),
    onInStockChange: (inStock: boolean) => updateQuery({ inStock: inStock ? 'true' : null }),
    onApplyPrice: (minPrice: string, maxPrice: string) => {
      updateQuery({ minPrice: minPrice || null, maxPrice: maxPrice || null });
      setIsFilterOpen(false);
    },
    onReset: resetFilters,
  };

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

  const totalPages = result?.pagination.totalPages ?? 0;

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

      <section className="category-product-catalog" id="category-products" aria-labelledby="category-products-title">
        <h2 className="category-product-catalog__title" id="category-products-title">Sản phẩm trong danh mục</h2>

        <ProductListingToolbar
          totalItems={result?.pagination.totalItems ?? 0}
          sort={sort}
          page={page}
          totalPages={totalPages}
          isLoading={isProductLoading}
          onSortChange={(nextSort) => updateQuery({ sort: nextSort === 'NEWEST' ? null : nextSort })}
          onPageChange={handlePageChange}
          onOpenFilters={() => setIsFilterOpen(true)}
          trailingAction={<Link to="/">Tiếp tục khám phá</Link>}
        />

        <div className="category-product-layout">
          <aside className="category-product-sidebar" aria-label="Bộ lọc sản phẩm">
            <ProductFilterSidebar key={`${filters.minPrice}:${filters.maxPrice}`} {...filterProps} />
          </aside>

          <div className="category-product-results">
            <ProductGrid
              products={result?.data ?? []}
              isLoading={isProductLoading}
              error={productError}
              onResetFilters={resetFilters}
            />
            {!isProductLoading && !productError && (result?.data.length ?? 0) > 0 && (
              <ProductPagination page={page} totalPages={totalPages} onPageChange={handlePageChange} />
            )}
          </div>
        </div>
      </section>

      {isFilterOpen && (
        <div className="category-filter-drawer" role="presentation" onMouseDown={() => setIsFilterOpen(false)}>
          <div
            className="category-filter-drawer__panel"
            role="dialog"
            aria-modal="true"
            aria-label="Bộ lọc sản phẩm"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="category-filter-drawer__header">
              <strong>Lọc sản phẩm</strong>
              <button type="button" onClick={() => setIsFilterOpen(false)} aria-label="Đóng bộ lọc">×</button>
            </div>
            <ProductFilterSidebar key={`${filters.minPrice}:${filters.maxPrice}`} {...filterProps} />
          </div>
        </div>
      )}
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
