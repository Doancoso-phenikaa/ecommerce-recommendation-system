import type {
  CreateShopRequest,
  Shop,
  UpdateShopRequest,
} from '../types/shop';
import { api } from './axios';

export async function getMyShop(): Promise<Shop> {
  const response = await api.get<Shop>('/shop/me');
  return response.data;
}

export async function createShop(data: CreateShopRequest): Promise<Shop> {
  const response = await api.post<Shop>('/shop', data);
  return response.data;
}

export async function updateMyShop(data: UpdateShopRequest): Promise<Shop> {
  const response = await api.patch<Shop>('/shop/me', data);
  return response.data;
}

export async function resubmitShop(): Promise<Shop> {
  const response = await api.post<Shop>('/shop/me/resubmit');
  return response.data;
}
