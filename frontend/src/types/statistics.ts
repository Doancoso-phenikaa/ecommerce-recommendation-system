export type SellerStatisticsRange = '7d' | '30d';

export interface SellerStatisticsOverview {
  totalRevenue: string;
  totalOrders: number;
  completedOrders: number;
  processingOrders: number;
}

export interface SellerOrderStatusCounts {
  pending: number;
  confirmed: number;
  shipping: number;
  completed: number;
  cancelled: number;
}

export interface SellerTopProduct {
  productId: string;
  productName: string;
  imageUrl: string | null;
  quantitySold: number;
  revenue: string;
}

export interface SellerRevenuePoint {
  date: string;
  revenue: string;
  orders: number;
}

export interface SellerStatisticsResponse {
  shopId: string;
  range: SellerStatisticsRange;
  overview: SellerStatisticsOverview;
  orderStatusCounts: SellerOrderStatusCounts;
  topProducts: SellerTopProduct[];
  revenueByDay: SellerRevenuePoint[];
}
