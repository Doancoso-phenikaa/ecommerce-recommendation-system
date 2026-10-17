export type DiscountType = 'PERCENT' | 'FIXED';

export type DiscountStatus = 'ACTIVE' | 'INACTIVE';

export interface Discount {
  discountId: string;
  code: string;
  type: DiscountType;
  value: string;
  minOrderAmount: string;
  startDate: string;
  endDate: string;
  usageLimit: number | null;
  usedCount: number;
  status: DiscountStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDiscountRequest {
  code: string;
  type: DiscountType;
  value: string;
  minOrderAmount?: string;
  startDate: string;
  endDate: string;
  usageLimit?: number;
}

export interface UpdateDiscountRequest {
  code?: string;
  type?: DiscountType;
  value?: string;
  minOrderAmount?: string;
  startDate?: string;
  endDate?: string;
  usageLimit?: number | null;
}

export interface UpdateDiscountStatusRequest {
  status: DiscountStatus;
}
