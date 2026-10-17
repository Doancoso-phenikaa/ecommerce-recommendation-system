import type { UserRole } from './auth';
import type { ShopStatus } from './shop';

export interface AdminUserListItem {
  userId: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminCustomerProfile {
  customerId: string;
  shippingAddress: string | null;
  createdAt: string;
}

export interface AdminSellerProfile {
  sellerId: string;
  status: string;
  createdAt: string;
  shop: {
    shopId: string;
    name: string;
    status: ShopStatus;
  } | null;
}

export interface AdminProfile {
  adminId: string;
  createdAt: string;
}

export type AdminUserDetail = AdminUserListItem & (
  | { role: 'CUSTOMER'; profile: AdminCustomerProfile | null }
  | { role: 'SELLER'; profile: AdminSellerProfile | null }
  | { role: 'ADMIN'; profile: AdminProfile | null }
);

export interface AdminUserSummary {
  totalUsers: number;
  totalCustomers: number;
  totalSellers: number;
  totalAdmins: number;
  inactiveUsers: number;
}

export interface AdminUserListResponse {
  data: AdminUserListItem[];
  summary: AdminUserSummary;
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface AdminUserQuery {
  search?: string;
  role?: UserRole;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export interface AdminUserStatusResponse {
  userId: string;
  isActive: boolean;
  message: string;
}
