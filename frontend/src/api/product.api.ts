import type {
  ProductListResponse,
  PublicProduct,
  PublicProductQuery,
} from '../types/product';
import { api } from './axios';

export async function getProducts(
  query: PublicProductQuery = {},
): Promise<ProductListResponse> {
  const response = await api.get<ProductListResponse>('/products', {
    params: query,
  });
  return response.data;
}

export async function getProductDetail(productId: string): Promise<PublicProduct> {
  const response = await api.get<PublicProduct>(`/products/${productId}`);
  return response.data;
}
