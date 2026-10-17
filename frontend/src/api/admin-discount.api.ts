import type {
  CreateDiscountRequest,
  Discount,
  UpdateDiscountRequest,
  UpdateDiscountStatusRequest,
} from '../types/discount';
import { api } from './axios';

export async function getAdminDiscounts(): Promise<Discount[]> {
  const response = await api.get<Discount[]>('/admin/discounts');
  return response.data;
}

export async function createAdminDiscount(
  data: CreateDiscountRequest,
): Promise<Discount> {
  const response = await api.post<Discount>('/admin/discounts', data);
  return response.data;
}

export async function updateAdminDiscount(
  discountId: string,
  data: UpdateDiscountRequest,
): Promise<Discount> {
  const response = await api.patch<Discount>(
    `/admin/discounts/${discountId}`,
    data,
  );
  return response.data;
}

export async function updateAdminDiscountStatus(
  discountId: string,
  data: UpdateDiscountStatusRequest,
): Promise<Discount> {
  const response = await api.patch<Discount>(
    `/admin/discounts/${discountId}/status`,
    data,
  );
  return response.data;
}
