export type SellerProfileStatus = 'ACTIVE' | 'SUSPENDED';

export interface SellerProfile {
  userId: string;
  sellerId: string;
  fullName: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  sellerStatus: SellerProfileStatus;
  createdAt: string;
}

export interface UpdateSellerProfileRequest {
  fullName?: string;
  phone?: string;
  avatarUrl?: string;
}
