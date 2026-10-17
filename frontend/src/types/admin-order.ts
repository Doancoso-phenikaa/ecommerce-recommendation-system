import type { OrderStatus } from './order';
import type { PaymentMethod, PaymentStatus } from './payment';

export interface AdminOrderQuery {
  search?: string;
  status?: OrderStatus;
  shopId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface AdminOrderShop {
  shopId: string;
  name: string;
}

export interface AdminOrderCustomer {
  customerId: string;
  fullName: string;
  email: string;
  phone?: string | null;
}

export interface AdminOrderListPayment {
  paymentMethod: PaymentMethod;
  status: PaymentStatus;
}

export interface AdminOrderListItem {
  orderId: string;
  orderGroupId: string;
  shop: AdminOrderShop;
  customer: AdminOrderCustomer;
  subtotal: string;
  discountAmount: string;
  shippingFee: string;
  totalAmount: string;
  shippingMethod: string | null;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  payment: AdminOrderListPayment | null;
}

export interface AdminOrderListResponse {
  data: AdminOrderListItem[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface AdminOrderDetailPayment extends AdminOrderListPayment {
  paymentId: string;
  amount: string;
  paidAt: string | null;
}

export interface AdminOrderDetailItem {
  orderItemId: string;
  productId: string;
  productName: string;
  imageUrl: string | null;
  quantity: number;
  unitPrice: string;
  subtotal: string;
}

export interface AdminOrderDetailResponse {
  orderId: string;
  orderGroupId: string;
  customer: AdminOrderCustomer;
  shop: AdminOrderShop;
  subtotal: string;
  discountAmount: string;
  shippingFee: string;
  totalAmount: string;
  shippingAddress: string;
  shippingMethod: string | null;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  payment: AdminOrderDetailPayment | null;
  items: AdminOrderDetailItem[];
}
