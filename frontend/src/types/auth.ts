export type UserRole = 'CUSTOMER' | 'SELLER' | 'ADMIN';

export interface AuthUser {
  userId: string;
  fullName: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  role: UserRole;
  isActive: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface RegisterCustomerRequest {
  fullName: string;
  email: string;
  phone?: string;
  password: string;
  shippingAddress?: string;
}

export interface RegisterCustomerResponse extends AuthUser {
  customerId: string;
  shippingAddress: string | null;
  createdAt: string;
}

export interface RegisterSellerRequest {
  fullName: string;
  email: string;
  phone?: string;
  password: string;
}

export interface RegisterSellerResponse extends AuthUser {
  sellerId: string;
  sellerStatus: string;
  createdAt: string;
}
