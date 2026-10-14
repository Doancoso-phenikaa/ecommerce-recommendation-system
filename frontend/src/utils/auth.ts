import axios from 'axios';
import type { UserRole } from '../types/auth';

interface NestErrorResponse {
  message?: string | string[];
}

export function getRoleHomePath(role: UserRole): string {
  if (role === 'SELLER') {
    return '/seller';
  }

  if (role === 'ADMIN') {
    return '/admin';
  }

  return '/';
}

export function getApiErrorMessage(
  error: unknown,
  fallback = 'Đã có lỗi xảy ra. Vui lòng thử lại.',
): string {
  if (!axios.isAxiosError<NestErrorResponse>(error)) {
    return error instanceof Error ? error.message : fallback;
  }

  const message = error.response?.data?.message;

  if (Array.isArray(message)) {
    return message.join('. ');
  }

  return message || fallback;
}
