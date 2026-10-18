import type {
  CustomerProfile,
  UpdateCustomerProfileRequest,
} from '../types/customer-profile';
import { api } from './axios';

export async function getCustomerProfile(): Promise<CustomerProfile> {
  const response = await api.get<CustomerProfile>('/customer/profile');
  return response.data;
}

export async function updateCustomerProfile(
  data: UpdateCustomerProfileRequest,
): Promise<CustomerProfile> {
  const response = await api.patch<CustomerProfile>('/customer/profile', data);
  return response.data;
}
