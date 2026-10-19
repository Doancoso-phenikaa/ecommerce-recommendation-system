import type {
  CartMutationItem,
  CartResponse,
  RemoveCartItemResponse,
} from '../types/cart';
import { api } from './axios';

export async function getCart(): Promise<CartResponse> {
  const response = await api.get<CartResponse>('/cart');
  return response.data;
}

export async function addToCart(
  productId: string,
  quantity: number,
): Promise<CartMutationItem> {
  const response = await api.post<CartMutationItem>('/cart/items', {
    productId,
    quantity,
  });
  return response.data;
}

export async function updateCartItem(
  productId: string,
  quantity: number,
): Promise<CartMutationItem> {
  const response = await api.patch<CartMutationItem>(
    `/cart/items/${productId}`,
    { quantity },
  );
  return response.data;
}

export async function removeCartItem(
  productId: string,
): Promise<RemoveCartItemResponse> {
  const response = await api.delete<RemoveCartItemResponse>(
    `/cart/items/${productId}`,
  );
  return response.data;
}
