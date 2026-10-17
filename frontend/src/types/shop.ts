export type ShopStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED';

export interface PublicShop {
  shopId: string;
  name: string;
}

export interface PublicShopListResponse {
  data: PublicShop[];
}

export interface Shop {
  shopId: string;
  sellerId: string;
  name: string;
  description: string | null;
  rating: string;
  status: ShopStatus;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateShopRequest {
  name: string;
  description?: string;
}

export interface UpdateShopRequest {
  name?: string;
  description?: string;
}

export interface AdminShopSellerSummary {
  sellerId: string;
  fullName: string;
  email: string;
}

export interface AdminShopListItem {
  shopId: string;
  name: string;
  description: string | null;
  rating: string;
  status: ShopStatus;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  seller: AdminShopSellerSummary;
}

export interface AdminShopDetail extends Omit<AdminShopListItem, 'seller'> {
  seller: {
    sellerId: string;
    status: string;
    user: {
      userId: string;
      fullName: string;
      email: string;
      phone: string | null;
      isActive: boolean;
    };
  };
}

export interface AdminShopListResponse {
  data: AdminShopListItem[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface AdminShopQuery {
  search?: string;
  status?: ShopStatus;
  page?: number;
  limit?: number;
}

export interface ShopStatusTransitionResponse {
  shopId: string;
  status: ShopStatus;
  message: string;
}
