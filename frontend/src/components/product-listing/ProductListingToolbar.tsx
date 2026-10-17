import type { ReactNode } from 'react';
import type { ProductSort } from '../../types/product';
import { ProductPagination } from './ProductPagination';
import './product-listing.css';

interface ProductListingToolbarProps {
  totalItems: number;
  sort: ProductSort;
  page: number;
  totalPages: number;
  isLoading?: boolean;
  trailingAction?: ReactNode;
  onSortChange: (sort: ProductSort) => void;
  onPageChange: (page: number) => void;
  onOpenFilters: () => void;
}

export function ProductListingToolbar({
  totalItems,
  sort,
  page,
  totalPages,
  isLoading = false,
  trailingAction,
  onSortChange,
  onPageChange,
  onOpenFilters,
}: ProductListingToolbarProps) {
  return (
    <div className="listing-toolbar">
      <div className="listing-toolbar__summary" aria-live="polite">
        <strong>{totalItems}</strong> sản phẩm
      </div>

      <button className="listing-toolbar__filter-button" type="button" onClick={onOpenFilters}>
        <span aria-hidden="true">☰</span>
        Bộ lọc
      </button>

      <label className="listing-toolbar__sort">
        <span>Sắp xếp</span>
        <select value={sort} onChange={(event) => onSortChange(event.target.value as ProductSort)}>
          <option value="NEWEST">Mới nhất</option>
          <option value="PRICE_ASC">Giá thấp đến cao</option>
          <option value="PRICE_DESC">Giá cao đến thấp</option>
        </select>
      </label>

      <ProductPagination
        page={page}
        totalPages={totalPages}
        onPageChange={onPageChange}
        variant="compact"
        disabled={isLoading}
      />

      {trailingAction && <div className="listing-toolbar__action">{trailingAction}</div>}
    </div>
  );
}
