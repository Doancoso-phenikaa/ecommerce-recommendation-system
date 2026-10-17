export type CheckoutDiscountType = 'PERCENT' | 'FIXED';

export interface CheckoutPreviewItem {
  productId: string;
  name: string;
  imageUrl: string | null;
  price: string;
  quantity: number;
  availableQuantity: number;
  subtotal: string;
}

export interface CheckoutPreviewShopGroup {
  shopId: string;
  shopName: string;
  items: CheckoutPreviewItem[];
  subtotal: string;
}

export interface CheckoutPreviewDiscount {
  discountId: string;
  code: string;
  type: CheckoutDiscountType;
  value: string;
}

export interface CheckoutPreviewResponse {
  shopGroups: CheckoutPreviewShopGroup[];
  cartSubtotal: string;
  discount: CheckoutPreviewDiscount | null;
  discountAmount: string;
  finalTotal: string;
}

export interface CheckoutPreviewRequest {
  discountCode?: string;
}

export interface ConfirmCheckoutRequest {
  shippingAddress: string;
  shippingMethod?: string;
  discountCode?: string;
}

export type CheckoutOrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'SHIPPING'
  | 'COMPLETED'
  | 'CANCELLED';

export interface ConfirmCheckoutOrderItem {
  orderItemId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: string;
  subtotal: string;
}

export interface ConfirmCheckoutOrder {
  orderId: string;
  shopId: string;
  subtotal: string;
  discountAmount: string;
  shippingFee: string;
  totalAmount: string;
  shippingAddress: string;
  shippingMethod: string | null;
  status: CheckoutOrderStatus;
  items: ConfirmCheckoutOrderItem[];
}

export interface ConfirmCheckoutResponse {
  orderGroupId: string;
  cartSubtotal: string;
  discount: { discountId: string; code: string } | null;
  discountAmount: string;
  totalAmount: string;
  orders: ConfirmCheckoutOrder[];
  createdAt: string;
}

