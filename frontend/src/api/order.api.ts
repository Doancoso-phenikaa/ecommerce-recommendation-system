import type {
  CustomerOrderStatusResponse,
  CustomerOrderDetailResponse,
  CustomerOrderHistoryResponse,
} from '../types/order';
import { api } from './axios';

export async function getCustomerOrders(): Promise<CustomerOrderHistoryResponse> {
  const response = await api.get<CustomerOrderHistoryResponse>('/orders');
  return response.data;
}

export async function cancelCustomerOrder(
  orderId: string,
): Promise<CustomerOrderStatusResponse> {
  const response = await api.patch<CustomerOrderStatusResponse>(`/orders/${orderId}/cancel`);
  return response.data;
}

export async function confirmCustomerOrderReceived(
  orderId: string,
): Promise<CustomerOrderStatusResponse> {
  const response = await api.patch<CustomerOrderStatusResponse>(`/orders/${orderId}/received`);
  return response.data;
}

export async function getCustomerOrderDetail(
  orderGroupId: string,
): Promise<CustomerOrderDetailResponse> {
  const response = await api.get<CustomerOrderDetailResponse>(`/orders/${orderGroupId}`);
  return response.data;
}
