import type { CreatePaymentRequest, PaymentResponse } from '../types/payment';
import { api } from './axios';

export async function createPayment(data: CreatePaymentRequest): Promise<PaymentResponse> {
  const response = await api.post<PaymentResponse>('/payments', data);
  return response.data;
}
