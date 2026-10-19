import type {
  AdminProduct,
  AdminProductListResponse,
  AdminProductQuery,
  ProductMutationResponse,
} from '../types/product';
import { api } from './axios';

export async function getAdminProducts(
  query: AdminProductQuery = {},
): Promise<AdminProductListResponse> {
  const response = await api.get<AdminProductListResponse>('/admin/products', {
    params: query,
  });
  return response.data;
}

export async function getAdminProductDetail(productId: string): Promise<AdminProduct> {
  const response = await api.get<AdminProduct>(`/admin/products/${productId}`);
  return response.data;
}

export async function approveAdminProduct(
  productId: string,
): Promise<ProductMutationResponse> {
  const response = await api.patch<ProductMutationResponse>(
    `/admin/products/${productId}/approve`,
  );
  return response.data;
}

export async function rejectAdminProduct(
  productId: string,
  rejectionReason: string,
): Promise<ProductMutationResponse> {
  const response = await api.patch<ProductMutationResponse>(
    `/admin/products/${productId}/reject`,
    { rejectionReason },
  );
  return response.data;
}
