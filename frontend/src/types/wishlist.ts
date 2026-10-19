export interface WishlistItem {
  wishlistItemId: string;
  productId: string;
  name: string;
  price: string;
  imageUrl: string | null;
  shopId: string;
  createdAt: string;
}

export interface WishlistResponse {
  items: WishlistItem[];
}

export interface RemoveWishlistItemResponse {
  message: string;
  productId: string;
}
