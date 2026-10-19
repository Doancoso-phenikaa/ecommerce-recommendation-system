import type {
  ShippingConfig,
  UpdateShippingConfigRequest,
} from '../types/shipping-config';
import { api } from './axios';

export async function getAdminShippingConfig(): Promise<ShippingConfig> {
  const response = await api.get<ShippingConfig>('/admin/shipping-config');
  return response.data;
}

export async function updateAdminShippingConfig(
  data: UpdateShippingConfigRequest,
): Promise<ShippingConfig> {
  const response = await api.patch<ShippingConfig>(
    '/admin/shipping-config',
    data,
  );
  return response.data;
}
