import type { PaymentMethod, PaymentStatus } from './payment';
import type { OrderItemReview } from './review';

export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'SHIPPING'
  | 'COMPLETED'
  | 'CANCELLED';

export interface CustomerOrderListPayment {
  paymentMethod: PaymentMethod;
  status: PaymentStatus;
  paidAt: string | null;
}

export interface CustomerOrderListItem {
  orderId: string;
  shopId: string;
  shopName: string;
  totalAmount: string;
  status: OrderStatus;
  createdAt: string;
}

export interface CustomerOrderGroupListItem {
  orderGroupId: string;
  totalAmount: string;
  createdAt: string;
  payment: CustomerOrderListPayment | null;
  orders: CustomerOrderListItem[];
}

export interface CustomerOrderHistoryResponse {
  data: CustomerOrderGroupListItem[];
}

export interface CustomerOrderDetailItem {
  orderItemId: string;
  productId: string;
  productName: string;
  imageUrl: string | null;
  quantity: number;
  unitPrice: string;
  subtotal: string;
  review: OrderItemReview | null;
}

export interface CustomerOrderDetailOrder {
  orderId: string;
  shopId: string;
  shopName: string;
  subtotal: string;
  discountAmount: string;
  shippingFee: string;
  totalAmount: string;
  shippingAddress: string;
  shippingMethod: string | null;
  status: OrderStatus;
  createdAt: string;
  items: CustomerOrderDetailItem[];
}

export interface OrderDetailPayment {
  paymentId: string;
  paymentMethod: PaymentMethod;
  amount: string;
  status: PaymentStatus;
  paidAt: string | null;
}

export interface CustomerOrderDetailResponse {
  orderGroupId: string;
  totalAmount: string;
  createdAt: string;
  payment: OrderDetailPayment | null;
  orders: CustomerOrderDetailOrder[];
}

export interface CustomerOrderStatusResponse {
  orderId: string;
  status: OrderStatus;
  updatedAt: string;
  message: string;
}

export interface SellerOrderListItem {
  orderId: string;
  orderGroupId: string;
  subtotal: string;
  discountAmount: string;
  shippingFee: string;
  totalAmount: string;
  shippingAddress: string;
  shippingMethod: string | null;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SellerOrderListResponse {
  data: SellerOrderListItem[];
}

export interface SellerOrderItem {
  orderItemId: string;
  productId: string;
  productName: string;
  imageUrl: string | null;
  quantity: number;
  unitPrice: string;
  subtotal: string;
}

export interface SellerOrderDetailResponse extends SellerOrderListItem {
  items: SellerOrderItem[];
  payment: OrderDetailPayment | null;
}

export interface SellerOrderStatusResponse {
  orderId: string;
  status: OrderStatus;
  updatedAt: string;
  message: string;
}
