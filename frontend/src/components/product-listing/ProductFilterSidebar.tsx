import { useId, useState } from 'react';
import type { PublicShop } from '../../types/shop';
import type { ProductListingFilters } from './product-listing.types';
import './product-listing.css';

interface ProductFilterSidebarProps {
  filters: ProductListingFilters;
  shops: PublicShop[];
  isLoadingShops?: boolean;
  shopError?: string;
  onShopChange: (shopId: string) => void;
  onInStockChange: (inStock: boolean) => void;
  onApplyPrice: (minPrice: string, maxPrice: string) => void;
  onReset: () => void;
}

const DECIMAL_PATTERN = /^\d+(?:\.\d{1,2})?$/;

function toCents(value: string): bigint {
  const [whole, decimal = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(decimal.padEnd(2, '0'));
}

export function ProductFilterSidebar({
  filters,
  shops,
  isLoadingShops = false,
  shopError,
  onShopChange,
  onInStockChange,
  onApplyPrice,
  onReset,
}: ProductFilterSidebarProps) {
  const shopFilterId = useId();
  const [minPrice, setMinPrice] = useState(filters.minPrice);
  const [maxPrice, setMaxPrice] = useState(filters.maxPrice);
  const [priceError, setPriceError] = useState('');

  const applyPrice = () => {
    const normalizedMin = minPrice.trim();
    const normalizedMax = maxPrice.trim();

    if (
      (normalizedMin && !DECIMAL_PATTERN.test(normalizedMin))
      || (normalizedMax && !DECIMAL_PATTERN.test(normalizedMax))
    ) {
      setPriceError('Giá phải là số không âm, tối đa 2 chữ số thập phân.');
      return;
    }

    if (normalizedMin && normalizedMax && toCents(normalizedMin) > toCents(normalizedMax)) {
      setPriceError('Giá tối thiểu không được lớn hơn giá tối đa.');
      return;
    }

    setPriceError('');
    onApplyPrice(normalizedMin, normalizedMax);
  };

  return (
    <div className="listing-filter">
      <div className="listing-filter__heading">
        <div>
          <span>Bộ lọc</span>
          <h2>Tìm nhanh hơn</h2>
        </div>
        <button type="button" onClick={onReset}>Đặt lại</button>
      </div>

      <section className="listing-filter__section">
        <h3>Khoảng giá</h3>
        <div className="listing-filter__price-row">
          <label>
            <span>Từ</span>
            <input
              inputMode="decimal"
              value={minPrice}
              placeholder="0"
              onChange={(event) => setMinPrice(event.target.value)}
            />
          </label>
          <span aria-hidden="true">–</span>
          <label>
            <span>Đến</span>
            <input
              inputMode="decimal"
              value={maxPrice}
              placeholder="Không giới hạn"
              onChange={(event) => setMaxPrice(event.target.value)}
            />
          </label>
        </div>
        {priceError && <p className="listing-filter__error">{priceError}</p>}
        <button className="listing-filter__apply" type="button" onClick={applyPrice}>Áp dụng giá</button>
      </section>

      <section className="listing-filter__section">
        <label className="listing-filter__label" htmlFor={shopFilterId}>Gian hàng</label>
        <select
          id={shopFilterId}
          value={filters.shopId}
          disabled={isLoadingShops}
          onChange={(event) => onShopChange(event.target.value)}
        >
          <option value="">Tất cả gian hàng</option>
          {shops.map((shop) => <option key={shop.shopId} value={shop.shopId}>{shop.name}</option>)}
        </select>
        {shopError && <p className="listing-filter__hint">{shopError}</p>}
      </section>

      <section className="listing-filter__section">
        <label className="listing-filter__checkbox">
          <input
            type="checkbox"
            checked={filters.inStock}
            onChange={(event) => onInStockChange(event.target.checked)}
          />
          <span>Chỉ hiển thị sản phẩm còn hàng</span>
        </label>
      </section>
    </div>
  );
}
