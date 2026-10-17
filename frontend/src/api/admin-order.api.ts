import type {
  AdminOrderDetailResponse,
  AdminOrderListResponse,
  AdminOrderQuery,
} from '../types/admin-order';
import { api } from './axios';

export async function getAdminOrders(
  query: AdminOrderQuery = {},
): Promise<AdminOrderListResponse> {
  const response = await api.get<AdminOrderListResponse>('/admin/orders', {
    params: query,
  });
  return response.data;
}

export async function getAdminOrderDetail(
  orderId: string,
): Promise<AdminOrderDetailResponse> {
  const response = await api.get<AdminOrderDetailResponse>(
    `/admin/orders/${orderId}`,
  );
  return response.data;
}
