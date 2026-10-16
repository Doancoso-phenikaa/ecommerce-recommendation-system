import type {
  CreateSellerProductRequest,
  InventoryUpdateResponse,
  ProductMutationResponse,
  SellerProduct,
  SellerProductListResponse,
  SellerProductQuery,
  UpdateSellerProductRequest,
} from '../types/product';
import { api } from './axios';

export async function getSellerProducts(
  query: SellerProductQuery = {},
): Promise<SellerProductListResponse> {
  const response = await api.get<SellerProductListResponse>('/seller/products', {
    params: query,
  });
  return response.data;
}

export async function getSellerProductDetail(productId: string): Promise<SellerProduct> {
  const response = await api.get<SellerProduct>(`/seller/products/${productId}`);
  return response.data;
}

export async function createSellerProduct(
  data: CreateSellerProductRequest,
): Promise<ProductMutationResponse> {
  const response = await api.post<ProductMutationResponse>('/products', data);
  return response.data;
}

export async function updateSellerProduct(
  productId: string,
  data: UpdateSellerProductRequest,
): Promise<ProductMutationResponse> {
  const response = await api.patch<ProductMutationResponse>(`/products/${productId}`, data);
  return response.data;
}

export async function updateSellerInventory(
  productId: string,
  quantity: number,
): Promise<InventoryUpdateResponse> {
  const response = await api.patch<InventoryUpdateResponse>(
    `/products/${productId}/inventory`,
    { quantity },
  );
  return response.data;
}

export async function resubmitSellerProduct(
  productId: string,
): Promise<ProductMutationResponse> {
  const response = await api.post<ProductMutationResponse>(
    `/products/${productId}/resubmit`,
  );
  return response.data;
}
