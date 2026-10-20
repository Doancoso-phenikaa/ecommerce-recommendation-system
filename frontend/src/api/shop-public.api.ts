import type { PublicShopDetail, PublicShopListResponse } from '../types/shop';
import { api } from './axios';

export async function getPublicShops(): Promise<PublicShopListResponse> {
  const response = await api.get<PublicShopListResponse>('/shops');
  return response.data;
}

export async function getPublicShopDetail(
  shopId: string,
): Promise<PublicShopDetail> {
  const response = await api.get<PublicShopDetail>(`/shops/${shopId}`);
  return response.data;
}
