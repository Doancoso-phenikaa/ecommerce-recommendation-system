import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getProducts } from '../../api/product.api';
import { ProductListingView } from '../../components/product-listing/ProductListingView';
import { useProductListingOptions } from '../../hooks/useProductListingOptions';
import { useProductListingParams } from '../../hooks/useProductListingParams';
import type { ProductListResponse } from '../../types/product';
import { getApiErrorMessage } from '../../utils/auth';
import './product-search.css';

const PAGE_SIZE = 20;

export function ProductSearchPage() {
  const { searchParams, page, sort, filters, updateQuery, resetFilters } = useProductListingParams();
  const listingOptions = useProductListingOptions(true);
  const [result, setResult] = useState<ProductListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const keyword = (searchParams.get('q') ?? '').trim();

  useEffect(() => {
    if (!keyword) return;
    let isCurrent = true;

    const loadSearchResults = async () => {
      setIsLoading(true);
      setError('');
      try {
        const response = await getProducts({
          search: keyword,
          categoryId: filters.categoryId || undefined,
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
          setError(getApiErrorMessage(requestError, 'Không thể tải kết quả tìm kiếm.'));
        }
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    };

    void loadSearchResults();
    return () => {
      isCurrent = false;
    };
  }, [filters.categoryId, filters.inStock, filters.maxPrice, filters.minPrice, filters.shopId, keyword, page, sort]);

  return (
    <main className="product-search-page">
      <nav className="product-search-breadcrumb" aria-label="Breadcrumb">
        <Link to="/">Trang chủ</Link><span aria-hidden="true">/</span><strong>Tìm kiếm</strong>
      </nav>

      <header className="product-search-header">
        <span>Kết quả tìm kiếm</span>
        {keyword ? (
          <>
            <h1>“{keyword}”</h1>
            <p>{result?.pagination.totalItems ?? 0} sản phẩm được tìm thấy</p>
          </>
        ) : (
          <h1>Tìm sản phẩm bạn cần</h1>
        )}
      </header>

      {!keyword ? (
        <section className="product-search-empty">
          <span aria-hidden="true">⌕</span>
          <h2>Nhập từ khóa để bắt đầu tìm kiếm</h2>
          <p>Bạn có thể tìm theo tên sản phẩm bằng ô tìm kiếm ở đầu trang.</p>
          <Link to="/">Về trang chủ</Link>
        </section>
      ) : (
        <ProductListingView
          sectionId="search-products"
          filters={filters}
          sort={sort}
          page={page}
          result={result}
          isLoading={isLoading}
          error={error}
          {...listingOptions}
          showCategoryFilter
          onUpdateQuery={updateQuery}
          onResetFilters={resetFilters}
          emptyTitle="Không tìm thấy sản phẩm phù hợp."
          emptyMessage="Hãy thử thay đổi hoặc xóa bộ lọc."
          trailingAction={<Link to="/">Về trang chủ</Link>}
        />
      )}
    </main>
  );
}
