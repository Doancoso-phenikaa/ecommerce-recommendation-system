import { useSearchParams } from 'react-router-dom';
import type { ProductListingFilters } from '../components/product-listing/product-listing.types';
import type { ProductSort } from '../types/product';

const SORT_OPTIONS: ProductSort[] = ['NEWEST', 'PRICE_ASC', 'PRICE_DESC'];
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;
const PRICE_PATTERN = /^\d+(?:\.\d{1,2})?$/;

function readPositiveInteger(value: string | null, fallback: number): number {
  if (!value || !POSITIVE_INTEGER_PATTERN.test(value)) return fallback;
  return Number(value);
}

function readId(value: string | null): string {
  return value && POSITIVE_INTEGER_PATTERN.test(value) ? value : '';
}

function readPrice(value: string | null): string {
  return value && PRICE_PATTERN.test(value) ? value : '';
}

function readSort(value: string | null): ProductSort {
  return SORT_OPTIONS.includes(value as ProductSort) ? value as ProductSort : 'NEWEST';
}

function toCents(value: string): bigint {
  const [whole, decimal = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(decimal.padEnd(2, '0'));
}

export function useProductListingParams() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = readPositiveInteger(searchParams.get('page'), 1);
  const sort = readSort(searchParams.get('sort'));
  let minPrice = readPrice(searchParams.get('minPrice'));
  let maxPrice = readPrice(searchParams.get('maxPrice'));

  if (minPrice && maxPrice && toCents(minPrice) > toCents(maxPrice)) {
    minPrice = '';
    maxPrice = '';
  }

  const filters: ProductListingFilters = {
    categoryId: readId(searchParams.get('categoryId')),
    shopId: readId(searchParams.get('shopId')),
    minPrice,
    maxPrice,
    inStock: searchParams.get('inStock') === 'true',
  };

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

  const resetFilters = () => {
    updateQuery({
      categoryId: null,
      shopId: null,
      minPrice: null,
      maxPrice: null,
      inStock: null,
      sort: null,
    });
  };

  return { searchParams, page, sort, filters, updateQuery, resetFilters };
}
