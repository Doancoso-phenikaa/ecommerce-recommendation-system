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

export type AdminStatisticsRange = '7d' | '30d';

export interface AdminStatisticsOverview {
  totalRevenue: string;
  totalOrders: number;
  completedOrders: number;
  processingOrders: number;
  totalUsers: number;
  totalSellers: number;
  totalShops: number;
  totalProducts: number;
}

export interface AdminOrderStatusCounts {
  pending: number;
  confirmed: number;
  shipping: number;
  completed: number;
  cancelled: number;
}

export interface AdminTopShop {
  shopId: string;
  shopName: string;
  revenue: string;
  completedOrders: number;
}

export interface AdminTopProduct {
  productId: string;
  productName: string;
  imageUrl: string | null;
  shopId: string;
  shopName: string;
  quantitySold: number;
  revenue: string;
}

export interface AdminRevenuePoint {
  date: string;
  revenue: string;
  orders: number;
}

export interface AdminStatisticsResponse {
  range: AdminStatisticsRange;
  overview: AdminStatisticsOverview;
  orderStatusCounts: AdminOrderStatusCounts;
  revenueByDay: AdminRevenuePoint[];
  topShops: AdminTopShop[];
  topProducts: AdminTopProduct[];
}
