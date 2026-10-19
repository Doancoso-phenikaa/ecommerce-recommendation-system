import type {
  CheckoutPreviewRequest,
  CheckoutPreviewResponse,
  ConfirmCheckoutRequest,
  ConfirmCheckoutResponse,
} from '../types/checkout';
import { api } from './axios';

export async function getCheckoutPreview(
  data: CheckoutPreviewRequest,
): Promise<CheckoutPreviewResponse> {
  const response = await api.post<CheckoutPreviewResponse>('/checkout/preview', data);
  return response.data;
}

export async function confirmCheckout(
  data: ConfirmCheckoutRequest,
): Promise<ConfirmCheckoutResponse> {
  const response = await api.post<ConfirmCheckoutResponse>('/checkout', data);
  return response.data;
}
