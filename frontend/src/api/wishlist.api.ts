import type {
  RemoveWishlistItemResponse,
  WishlistItem,
  WishlistResponse,
} from '../types/wishlist';
import { api } from './axios';

export async function getWishlist(): Promise<WishlistResponse> {
  const response = await api.get<WishlistResponse>('/wishlist');
  return response.data;
}

export async function addToWishlist(productId: string): Promise<WishlistItem> {
  const response = await api.post<WishlistItem>(`/wishlist/${productId}`);
  return response.data;
}

export async function removeFromWishlist(
  productId: string,
): Promise<RemoveWishlistItemResponse> {
  const response = await api.delete<RemoveWishlistItemResponse>(
    `/wishlist/${productId}`,
  );
  return response.data;
}
