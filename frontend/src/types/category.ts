export type CategoryStatus = 'ACTIVE' | 'INACTIVE';

export interface Category {
  categoryId: string;
  name: string;
  description: string | null;
  status: CategoryStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AdminCategoryQuery {
  search?: string;
  status?: CategoryStatus;
  page?: number;
  limit?: number;
}

export interface AdminCategoryListResponse {
  data: Category[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface CreateCategoryRequest {
  name: string;
  description?: string;
}

export interface UpdateCategoryRequest {
  name?: string;
  description?: string;
}

export interface UpdateCategoryStatusRequest {
  status: CategoryStatus;
}
