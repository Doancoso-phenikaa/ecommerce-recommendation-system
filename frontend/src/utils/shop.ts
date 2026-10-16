import type { ShopStatus } from '../types/shop';

export const SHOP_STATUS_LABELS: Record<ShopStatus, string> = {
  PENDING: 'Chờ duyệt',
  ACTIVE: 'Đang hoạt động',
  REJECTED: 'Đã từ chối',
  SUSPENDED: 'Tạm ngưng',
};

export function formatShopDate(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
