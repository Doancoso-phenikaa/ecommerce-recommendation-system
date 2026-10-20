import { api } from './axios';

export async function recordProductView(productId: string): Promise<void> {
  await api.post(`/user-behaviors/view/${productId}`);
}
