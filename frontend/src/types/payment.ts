export type PaymentMethod = 'COD' | 'ONLINE';
export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED';

export interface CreatePaymentRequest {
  orderGroupId: string;
  paymentMethod: PaymentMethod;
}

export interface PaymentResponse {
  paymentId: string;
  orderGroupId: string;
  paymentMethod: PaymentMethod;
  amount: string;
  status: PaymentStatus;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentResultState {
  payment: PaymentResponse;
  orderCount: number;
}
