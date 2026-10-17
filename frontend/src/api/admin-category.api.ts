import type {
  AdminCategoryListResponse,
  AdminCategoryQuery,
  Category,
  CreateCategoryRequest,
  UpdateCategoryRequest,
  UpdateCategoryStatusRequest,
} from '../types/category';
import { api } from './axios';

export async function getAdminCategories(
  query: AdminCategoryQuery = {},
): Promise<AdminCategoryListResponse> {
  const response = await api.get<AdminCategoryListResponse>(
    '/admin/categories',
    { params: query },
  );
  return response.data;
}

export async function createAdminCategory(
  data: CreateCategoryRequest,
): Promise<Category> {
  const response = await api.post<Category>('/admin/categories', data);
  return response.data;
}

export async function updateAdminCategory(
  categoryId: string,
  data: UpdateCategoryRequest,
): Promise<Category> {
  const response = await api.patch<Category>(
    `/admin/categories/${categoryId}`,
    data,
  );
  return response.data;
}

export async function updateAdminCategoryStatus(
  categoryId: string,
  data: UpdateCategoryStatusRequest,
): Promise<Category> {
  const response = await api.patch<Category>(
    `/admin/categories/${categoryId}/status`,
    data,
  );
  return response.data;
}
