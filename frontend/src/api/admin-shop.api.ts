import type {
  AdminShopDetail,
  AdminShopListResponse,
  AdminShopQuery,
  Shop,
  ShopStatusTransitionResponse,
} from '../types/shop';
import { api } from './axios';

export async function getAdminShops(
  query: AdminShopQuery = {},
): Promise<AdminShopListResponse> {
  const response = await api.get<AdminShopListResponse>('/admin/shops', {
    params: query,
  });
  return response.data;
}

export async function getAdminShopDetail(
  shopId: string,
): Promise<AdminShopDetail> {
  const response = await api.get<AdminShopDetail>(`/admin/shops/${shopId}`);
  return response.data;
}

export async function approveAdminShop(shopId: string): Promise<Shop> {
  const response = await api.patch<Shop>(`/admin/shops/${shopId}/approve`);
  return response.data;
}

export async function approveAllAdminShops(): Promise<{
  approvedCount: number;
  shopIds: string[];
}> {
  const response = await api.patch<{
    approvedCount: number;
    shopIds: string[];
  }>('/admin/shops/approve-all');
  return response.data;
}

export async function rejectAdminShop(
  shopId: string,
  rejectionReason: string,
): Promise<Shop> {
  const response = await api.patch<Shop>(`/admin/shops/${shopId}/reject`, {
    rejectionReason,
  });
  return response.data;
}

export async function suspendAdminShop(
  shopId: string,
): Promise<ShopStatusTransitionResponse> {
  const response = await api.patch<ShopStatusTransitionResponse>(
    `/admin/shops/${shopId}/suspend`,
  );
  return response.data;
}

export async function activateAdminShop(
  shopId: string,
): Promise<ShopStatusTransitionResponse> {
  const response = await api.patch<ShopStatusTransitionResponse>(
    `/admin/shops/${shopId}/activate`,
  );
  return response.data;
}
