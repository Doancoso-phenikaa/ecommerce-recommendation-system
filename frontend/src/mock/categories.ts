export interface MockCategory {
  categoryId: string;
  name: string;
  symbol: string;
}

export const mockCategories: MockCategory[] = [
  { categoryId: '1', name: 'Điện tử', symbol: '⌁' },
  { categoryId: '2', name: 'Thời trang', symbol: '◇' },
  { categoryId: '3', name: 'Nhà cửa', symbol: '⌂' },
  { categoryId: '4', name: 'Phụ kiện', symbol: '◫' },
  { categoryId: '5', name: 'Làm đẹp', symbol: '✦' },
  { categoryId: '6', name: 'Thể thao', symbol: '○' },
  { categoryId: '7', name: 'Sách', symbol: '▤' },
  { categoryId: '8', name: 'Đồ gia dụng', symbol: '▱' },
  { categoryId: '9', name: 'Văn phòng', symbol: '□' },
  { categoryId: '10', name: 'Khác', symbol: '＋' },
];
