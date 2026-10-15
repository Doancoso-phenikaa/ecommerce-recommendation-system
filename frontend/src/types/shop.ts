export type ShopStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED';

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
