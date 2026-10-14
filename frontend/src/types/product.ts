export interface ProductInventory {
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
}

export interface PublicProduct {
  productId: string;
  shopId: string;
  categoryId: string;
  name: string;
  description: string | null;
  price: string;
  imageUrl: string | null;
  approvedAt: string | null;
  inventory: ProductInventory;
  createdAt: string;
  updatedAt: string;
}

export interface ProductListResponse {
  data: PublicProduct[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}
