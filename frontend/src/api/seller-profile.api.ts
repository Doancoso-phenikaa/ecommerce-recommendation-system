import type {
  SellerProfile,
  UpdateSellerProfileRequest,
} from '../types/seller-profile';
import { api } from './axios';

export async function getSellerProfile(): Promise<SellerProfile> {
  const response = await api.get<SellerProfile>('/seller/profile');
  return response.data;
}

export async function updateSellerProfile(
  data: UpdateSellerProfileRequest,
): Promise<SellerProfile> {
  const response = await api.patch<SellerProfile>('/seller/profile', data);
  return response.data;
}
