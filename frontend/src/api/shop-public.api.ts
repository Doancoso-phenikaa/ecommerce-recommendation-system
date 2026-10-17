import type { PublicShopListResponse } from '../types/shop';
import { api } from './axios';

export async function getPublicShops(): Promise<PublicShopListResponse> {
  const response = await api.get<PublicShopListResponse>('/shops');
  return response.data;
}
