import type {
  SellerOrderDetailResponse,
  SellerOrderListResponse,
  SellerOrderStatusResponse,
} from '../types/order';
import { api } from './axios';

export async function getSellerOrders(): Promise<SellerOrderListResponse> {
  const response = await api.get<SellerOrderListResponse>('/seller/orders');
  return response.data;
}

export async function getSellerOrderDetail(
  orderId: string,
): Promise<SellerOrderDetailResponse> {
  const response = await api.get<SellerOrderDetailResponse>(`/seller/orders/${orderId}`);
  return response.data;
}

export async function confirmSellerOrder(orderId: string): Promise<SellerOrderStatusResponse> {
  const response = await api.patch<SellerOrderStatusResponse>(`/seller/orders/${orderId}/confirm`);
  return response.data;
}

export async function markSellerOrderShipping(orderId: string): Promise<SellerOrderStatusResponse> {
  const response = await api.patch<SellerOrderStatusResponse>(`/seller/orders/${orderId}/shipping`);
  return response.data;
}

export async function cancelSellerOrder(orderId: string): Promise<SellerOrderStatusResponse> {
  const response = await api.patch<SellerOrderStatusResponse>(`/seller/orders/${orderId}/cancel`);
  return response.data;
}
