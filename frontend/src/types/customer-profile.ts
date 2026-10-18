export interface CustomerProfile {
  userId: string;
  customerId: string;
  fullName: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  shippingAddress: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface UpdateCustomerProfileRequest {
  fullName?: string;
  phone?: string;
  avatarUrl?: string;
  shippingAddress?: string;
}
