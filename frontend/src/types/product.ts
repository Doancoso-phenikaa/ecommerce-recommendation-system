export interface ProductInventory {
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
}

export interface PublicProductShop {
  shopId: string;
  name: string;
  logoUrl: string | null;
  productCount?: number;
  reviewCount?: number;
}

export interface PublicProduct {
  productId: string;
  shopId: string;
  shop?: PublicProductShop | null;
  categoryId: string;
  name: string;
  description: string | null;
  price: string;
  originalPrice: string | null;
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

export type ProductSort =
  | 'NEWEST'
  | 'LATEST_APPROVED'
  | 'PRICE_ASC'
  | 'PRICE_DESC';

export interface PublicProductQuery {
  search?: string;
  categoryId?: string;
  shopId?: string;
  minPrice?: string;
  maxPrice?: string;
  inStock?: boolean;
  sort?: ProductSort;
  page?: number;
  limit?: number;
}

export type ProductStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface SellerProductCategory {
  categoryId: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface SellerProduct {
  productId: string;
  shopId: string;
  categoryId: string;
  name: string;
  description: string | null;
  price: string;
  originalPrice: string | null;
  imageUrl: string | null;
  status: ProductStatus;
  rejectionReason: string | null;
  approvedAt: string | null;
  inventory: ProductInventory | null;
  category: SellerProductCategory | null;
  createdAt: string;
  updatedAt: string;
}

export interface SellerProductQuery {
  search?: string;
  status?: ProductStatus;
  categoryId?: string;
  page?: number;
  limit?: number;
}

export interface SellerProductListResponse {
  data: SellerProduct[];
  pagination: ProductListResponse['pagination'];
}

export interface CreateSellerProductRequest {
  categoryId: string;
  name: string;
  description?: string;
  price: string;
  originalPrice?: string | null;
  imageUrl?: string;
  quantity: number;
}

export interface UpdateSellerProductRequest {
  categoryId?: string;
  name?: string;
  description?: string;
  price?: string;
  originalPrice?: string | null;
  imageUrl?: string;
}

export interface ProductMutationResponse {
  productId: string;
  shopId: string;
  categoryId: string;
  name: string;
  description: string | null;
  price: string;
  originalPrice: string | null;
  imageUrl: string | null;
  status: ProductStatus;
  rejectionReason: string | null;
  approvedAt: string | null;
  inventory: Omit<ProductInventory, 'availableQuantity'>;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryUpdateResponse {
  productId: string;
  quantity: number;
  reservedQuantity: number;
  updatedAt: string;
}

export interface AdminProductShop {
  shopId: string;
  name: string;
  status: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED';
}

export interface AdminProduct extends SellerProduct {
  shop: AdminProductShop | null;
}

export interface AdminProductQuery {
  search?: string;
  status?: ProductStatus;
  categoryId?: string;
  shopId?: string;
  page?: number;
  limit?: number;
}

export interface AdminProductListResponse {
  data: AdminProduct[];
  pagination: ProductListResponse['pagination'];
}
