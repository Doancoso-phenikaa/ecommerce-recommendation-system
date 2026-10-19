import type {
  AdminUserDetail,
  AdminUserListResponse,
  AdminUserQuery,
  AdminUserStatusResponse,
} from '../types/user';
import { api } from './axios';

export async function getAdminUsers(query: AdminUserQuery = {}): Promise<AdminUserListResponse> {
  const response = await api.get<AdminUserListResponse>('/admin/users', { params: query });
  return response.data;
}

export async function getAdminUserDetail(userId: string): Promise<AdminUserDetail> {
  const response = await api.get<AdminUserDetail>(`/admin/users/${userId}`);
  return response.data;
}

export async function updateAdminUserStatus(
  userId: string,
  isActive: boolean,
): Promise<AdminUserStatusResponse> {
  const action = isActive ? 'activate' : 'deactivate';
  const response = await api.patch<AdminUserStatusResponse>(`/admin/users/${userId}/${action}`);
  return response.data;
}
