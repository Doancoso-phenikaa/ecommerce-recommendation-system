import { useEffect, useState } from 'react';
import { getActiveCategories } from '../api/category.api';
import { getPublicShops } from '../api/shop-public.api';
import type { Category } from '../types/category';
import type { PublicShop } from '../types/shop';
import { getApiErrorMessage } from '../utils/auth';

export function useProductListingOptions(includeCategories = false) {
  const [shops, setShops] = useState<PublicShop[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isShopLoading, setIsShopLoading] = useState(true);
  const [isCategoryLoading, setIsCategoryLoading] = useState(includeCategories);
  const [shopError, setShopError] = useState('');
  const [categoryError, setCategoryError] = useState('');

  useEffect(() => {
    let isCurrent = true;

    void getPublicShops()
      .then((response) => {
        if (isCurrent) setShops(response.data);
      })
      .catch((error: unknown) => {
        if (isCurrent) setShopError(getApiErrorMessage(error, 'Không thể tải danh sách gian hàng.'));
      })
      .finally(() => {
        if (isCurrent) setIsShopLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    if (!includeCategories) return;
    let isCurrent = true;

    void getActiveCategories()
      .then((response) => {
        if (isCurrent) setCategories(response);
      })
      .catch((error: unknown) => {
        if (isCurrent) setCategoryError(getApiErrorMessage(error, 'Không thể tải danh sách danh mục.'));
      })
      .finally(() => {
        if (isCurrent) setIsCategoryLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [includeCategories]);

  return {
    shops,
    categories,
    isShopLoading,
    isCategoryLoading,
    shopError,
    categoryError,
  };
}
