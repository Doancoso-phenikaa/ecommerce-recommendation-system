export type CartUnavailableReason =
  | 'PRODUCT_NOT_AVAILABLE'
  | 'SHOP_NOT_ACTIVE'
  | 'INSUFFICIENT_STOCK';

export interface CartItem {
  cartItemId: string;
  productId: string;
  shopId?: string | null;
  shopName?: string | null;
  shopLogoUrl?: string | null;
  name: string | null;
  imageUrl: string | null;
  price: string | null;
  originalPrice?: string | null;
  quantity: number;
  availableQuantity: number;
  subtotal: string | null;
  isAvailable: boolean;
  unavailableReason: CartUnavailableReason | null;
}

export interface CartResponse {
  items: CartItem[];
  totalAmount: string;
}

export interface CartMutationItem {
  productId: string;
  name: string;
  imageUrl: string | null;
  price: string;
  quantity: number;
  availableQuantity: number;
  subtotal: string;
}

export interface RemoveCartItemResponse {
  message: string;
  productId: string;
}
