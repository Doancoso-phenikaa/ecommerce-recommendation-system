export interface MockBanner {
  bannerId: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  ctaLabel?: string;
  imageUrl: string;
  tone: 'blue' | 'navy' | 'cyan';
}

export interface MockSidePromotion {
  promotionId: string;
  title: string;
  subtitle: string;
  imageUrl: string;
}

export const mockBanners: MockBanner[] = [
  {
    bannerId: 'banner-1',
    eyebrow: 'Siêu sale đầu năm 2026',
    title: 'Lễ hội mua sắm\nsiêu sale năm mới',
    subtitle: 'Ưu đãi giảm sốc chọn lọc, voucher hấp dẫn cùng hàng ngàn sản phẩm chính hãng dành cho bạn.',
    ctaLabel: 'Săn deal ngay',
    imageUrl: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=1600&q=82',
    tone: 'blue',
  },
  {
    bannerId: 'banner-2',
    eyebrow: 'Phong cách mới',
    title: 'Mặc đẹp theo cách\nriêng của bạn',
    subtitle: 'Trang phục và phụ kiện linh hoạt cho mọi nhịp sống hiện đại.',
    ctaLabel: 'Xem sản phẩm',
    imageUrl: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1600&q=82',
    tone: 'navy',
  },
  {
    bannerId: 'banner-3',
    eyebrow: 'Không gian sống',
    title: 'Tiện nghi hơn\nsống cảm hứng hơn',
    subtitle: 'Những lựa chọn giúp căn nhà trở nên gọn gàng và dễ chịu hơn.',
    ctaLabel: 'Mua sắm ngay',
    imageUrl: 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=1600&q=82',
    tone: 'cyan',
  },
];

export const mockSidePromotions: MockSidePromotion[] = [
  {
    promotionId: 'side-promo-1',
    title: 'Phụ kiện mới',
    subtitle: 'Nhỏ gọn, tiện dụng mỗi ngày',
    imageUrl: 'https://images.unsplash.com/photo-1523170335258-f5ed11844a49?auto=format&fit=crop&w=900&q=82',
  },
  {
    promotionId: 'side-promo-2',
    title: 'Góc nhà tinh gọn',
    subtitle: 'Chọn đồ hay cho không gian sống',
    imageUrl: 'https://images.unsplash.com/photo-1484101403633-562f891dc89a?auto=format&fit=crop&w=900&q=82',
  },
];
