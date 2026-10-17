import { useState, type ReactNode } from 'react';
import type { Category } from '../../types/category';
import type { ProductListResponse, ProductSort } from '../../types/product';
import type { PublicShop } from '../../types/shop';
import { ProductFilterSidebar } from './ProductFilterSidebar';
import { ProductGrid } from './ProductGrid';
import { ProductListingToolbar } from './ProductListingToolbar';
import { ProductPagination } from './ProductPagination';
import type { ProductListingFilters } from './product-listing.types';
import './product-listing.css';

interface ProductListingViewProps {
  sectionId: string;
  filters: ProductListingFilters;
  sort: ProductSort;
  page: number;
  result: ProductListResponse | null;
  isLoading: boolean;
  error: string;
  shops: PublicShop[];
  categories?: Category[];
  showCategoryFilter?: boolean;
  isShopLoading?: boolean;
  isCategoryLoading?: boolean;
  shopError?: string;
  categoryError?: string;
  trailingAction?: ReactNode;
  emptyTitle?: string;
  emptyMessage?: string;
  onUpdateQuery: (updates: Record<string, string | null>, resetPage?: boolean) => void;
  onResetFilters: () => void;
}

export function ProductListingView({
  sectionId,
  filters,
  sort,
  page,
  result,
  isLoading,
  error,
  shops,
  categories = [],
  showCategoryFilter = false,
  isShopLoading = false,
  isCategoryLoading = false,
  shopError,
  categoryError,
  trailingAction,
  emptyTitle,
  emptyMessage,
  onUpdateQuery,
  onResetFilters,
}: ProductListingViewProps) {
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const totalPages = result?.pagination.totalPages ?? 0;

  const handlePageChange = (nextPage: number) => {
    onUpdateQuery({ page: nextPage > 1 ? String(nextPage) : null }, false);
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const resetFilters = () => {
    onResetFilters();
    setIsFilterOpen(false);
  };

  const filterProps = {
    filters,
    shops,
    categories,
    showCategoryFilter,
    isLoadingShops: isShopLoading,
    isLoadingCategories: isCategoryLoading,
    shopError,
    categoryError,
    onCategoryChange: (categoryId: string) => onUpdateQuery({ categoryId: categoryId || null }),
    onShopChange: (shopId: string) => onUpdateQuery({ shopId: shopId || null }),
    onInStockChange: (inStock: boolean) => onUpdateQuery({ inStock: inStock ? 'true' : null }),
    onApplyPrice: (minPrice: string, maxPrice: string) => {
      onUpdateQuery({ minPrice: minPrice || null, maxPrice: maxPrice || null });
      setIsFilterOpen(false);
    },
    onReset: resetFilters,
  };

  return (
    <section className="product-listing-view" id={sectionId}>
      <ProductListingToolbar
        totalItems={result?.pagination.totalItems ?? 0}
        sort={sort}
        page={page}
        totalPages={totalPages}
        isLoading={isLoading}
        onSortChange={(nextSort) => onUpdateQuery({ sort: nextSort === 'NEWEST' ? null : nextSort })}
        onPageChange={handlePageChange}
        onOpenFilters={() => setIsFilterOpen(true)}
        trailingAction={trailingAction}
      />

      <div className="product-listing-view__layout">
        <aside className="product-listing-view__sidebar" aria-label="Bộ lọc sản phẩm">
          <ProductFilterSidebar key={`${filters.minPrice}:${filters.maxPrice}`} {...filterProps} />
        </aside>

        <div className="product-listing-view__results">
          <ProductGrid
            products={result?.data ?? []}
            isLoading={isLoading}
            error={error}
            onResetFilters={resetFilters}
            emptyTitle={emptyTitle}
            emptyMessage={emptyMessage}
          />
          {!isLoading && !error && (result?.data.length ?? 0) > 0 && (
            <ProductPagination page={page} totalPages={totalPages} onPageChange={handlePageChange} />
          )}
        </div>
      </div>

      {isFilterOpen && (
        <div className="product-filter-drawer" role="presentation" onMouseDown={() => setIsFilterOpen(false)}>
          <div
            className="product-filter-drawer__panel"
            role="dialog"
            aria-modal="true"
            aria-label="Bộ lọc sản phẩm"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="product-filter-drawer__header">
              <strong>Lọc sản phẩm</strong>
              <button type="button" onClick={() => setIsFilterOpen(false)} aria-label="Đóng bộ lọc">×</button>
            </div>
            <ProductFilterSidebar key={`${filters.minPrice}:${filters.maxPrice}`} {...filterProps} />
          </div>
        </div>
      )}
    </section>
  );
}
