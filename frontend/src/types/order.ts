import type { PaymentMethod, PaymentStatus } from './payment';

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

export interface CustomerOrderReview {
  reviewId: string;
  rating: number;
  comment: string | null;
  status: 'ACTIVE' | 'HIDDEN';
  createdAt: string;
  updatedAt: string;
}

export interface CustomerOrderDetailItem {
  orderItemId: string;
  productId: string;
  productName: string;
  imageUrl: string | null;
  quantity: number;
  unitPrice: string;
  subtotal: string;
  review: CustomerOrderReview | null;
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

export interface CustomerOrderDetailPayment {
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
  payment: CustomerOrderDetailPayment | null;
  orders: CustomerOrderDetailOrder[];
}

export interface CancelCustomerOrderResponse {
  orderId: string;
  status: OrderStatus;
  updatedAt: string;
  message: string;
}
