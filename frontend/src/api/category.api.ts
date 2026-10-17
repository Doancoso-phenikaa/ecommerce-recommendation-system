import type { Category } from '../types/category';
import { api } from './axios';

export async function getActiveCategories(): Promise<Category[]> {
  const response = await api.get<Category[]>('/categories');
  return response.data;
}
