export type CheckoutDiscountType = 'PERCENT' | 'FIXED';
export type CheckoutDiscountTarget = 'PRODUCT' | 'SHIPPING';

export interface CheckoutPreviewItem {
  cartItemId: string;
  productId: string;
  name: string;
  imageUrl: string | null;
  price: string;
  originalPrice: string | null;
  categoryName: string;
  quantity: number;
  availableQuantity: number;
  subtotal: string;
}

export interface CheckoutPreviewShopGroup {
  shopId: string;
  shopName: string;
  items: CheckoutPreviewItem[];
  subtotal: string;
  productDiscountAmount: string;
  totalAmount: string;
}

export interface CheckoutPreviewDiscount {
  discountId: string;
  code: string;
  type: CheckoutDiscountType;
  target: CheckoutDiscountTarget;
  value: string;
}

export interface CheckoutPreviewResponse {
  shopGroups: CheckoutPreviewShopGroup[];
  subtotal: string;
  cartSubtotal: string;
  productDiscount: CheckoutPreviewDiscount | null;
  shippingDiscount: CheckoutPreviewDiscount | null;
  productDiscountAmount: string;
  shippingFee: string;
  shippingDiscountAmount: string;
  totalAmount: string;
  discount: CheckoutPreviewDiscount | null;
  discountAmount: string;
  finalTotal: string;
}

export interface CheckoutPreviewRequest {
  selectedCartItemIds: string[];
  productDiscountCode?: string;
  shippingDiscountCode?: string;
}

export interface ConfirmCheckoutRequest {
  selectedCartItemIds: string[];
  shippingAddress: string;
  shippingMethod?: string;
  productDiscountCode?: string;
  shippingDiscountCode?: string;
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
  totalAmount: string;
  shippingAddress: string;
  shippingMethod: string | null;
  status: CheckoutOrderStatus;
  items: ConfirmCheckoutOrderItem[];
}

export interface ConfirmCheckoutResponse {
  orderGroupId: string;
  subtotal: string;
  cartSubtotal: string;
  productDiscount: { discountId: string; code: string } | null;
  shippingDiscount: { discountId: string; code: string } | null;
  productDiscountAmount: string;
  shippingFee: string;
  shippingDiscountAmount: string;
  discount: { discountId: string; code: string } | null;
  discountAmount: string;
  totalAmount: string;
  orders: ConfirmCheckoutOrder[];
  createdAt: string;
}

