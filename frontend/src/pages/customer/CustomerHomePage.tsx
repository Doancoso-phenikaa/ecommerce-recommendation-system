import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getActiveCategories } from '../../api/category.api';
import { getProducts } from '../../api/product.api';
import { getRecommendations } from '../../api/recommendation.api';
import { addToWishlist, getWishlist, removeFromWishlist } from '../../api/wishlist.api';
import { BannerCarousel } from '../../components/customer/BannerCarousel';
import { CategorySection } from '../../components/customer/CategorySection';
import { HomeProductCard } from '../../components/customer/HomeProductCard';
import { RecommendationSection } from '../../components/recommendation/RecommendationSection';
import { useAuth } from '../../hooks/useAuth';
import { mockBanners, mockSidePromotions } from '../../mock/banners';
import type { Category } from '../../types/category';
import type { ProductListResponse, PublicProduct } from '../../types/product';
import { getApiErrorMessage } from '../../utils/auth';
import './customer-home.css';
import './customer-product-states.css';

const FLASH_SALE_MAX_SECONDS = 3 * 60 * 60;
const FLASH_SALE_RESET_SECONDS = 60 * 60;

const formatCountdownUnit = (value: number) => String(value).padStart(2, '0');

type HomeIconName =
  | 'categories'
  | 'flash'
  | 'verified'
  | 'trend'
  | 'new'
  | 'voucher'
  | 'live'
  | 'truck'
  | 'return'
  | 'payment'
  | 'support';

function HomeIcon({ name }: { name: HomeIconName }) {
  const svgProps = { viewBox: '0 0 24 24', 'aria-hidden': true, focusable: false } as const;

  switch (name) {
    case 'categories':
      return <svg {...svgProps}><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></svg>;
    case 'flash':
      return <svg {...svgProps}><path d="M13.4 2.8 5.8 13h5.8l-1 8.2L18.2 11h-5.8l1-8.2Z" /></svg>;
    case 'verified':
      return <svg {...svgProps}><path d="M12 3.2 14.2 5l2.8-.1.7 2.7 2.3 1.6-1.1 2.6.8 2.7-2.4 1.5-.9 2.7-2.8-.3-2.1 1.8-2.1-1.8-2.8.3-.9-2.7-2.4-1.5.8-2.7L3 9.2l2.3-1.6L6 4.9l2.8.1L11 3.2Z" /><path d="m8.2 11.8 2.2 2.2 4.8-4.8" /></svg>;
    case 'trend':
      return <svg {...svgProps}><path d="M4 17.5 9 12l3.4 3.4L20 7.8" /><path d="M14.5 7.8H20v5.5" /></svg>;
    case 'new':
      return <svg {...svgProps}><path d="m12 3 1.1 3.4A5 5 0 0 0 16.3 9l3.7 1-3.7 1a5 5 0 0 0-3.2 2.6L12 17l-1.1-3.4A5 5 0 0 0 7.7 11L4 10l3.7-1a5 5 0 0 0 3.2-2.6L12 3Z" /><path d="m18.5 15 .5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5.5-1.5Z" /></svg>;
    case 'voucher':
      return <svg {...svgProps}><path d="M4 6.5h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4v-4Z" /><path d="m9 15 6-6" /><circle cx="9" cy="9" r=".8" /><circle cx="15" cy="15" r=".8" /></svg>;
    case 'live':
      return <svg {...svgProps}><rect x="4" y="5" width="16" height="14" rx="3" /><path d="m10 9 5 3-5 3V9Z" /><path d="M2 9v6M22 9v6" /></svg>;
    case 'truck':
      return <svg {...svgProps}><path d="M3 6h11v10H3V6Z" /><path d="M14 9h3l4 4v3h-7V9Z" /><circle cx="7" cy="17" r="2" /><circle cx="18" cy="17" r="2" /></svg>;
    case 'return':
      return <svg {...svgProps}><path d="M8 7H4V3" /><path d="M4.5 7A8 8 0 1 1 4 15" /><path d="M8 12h8v7H8z" /></svg>;
    case 'payment':
      return <svg {...svgProps}><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M3 9h18M7 15h4" /></svg>;
    case 'support':
      return <svg {...svgProps}><path d="M4 13v-2a8 8 0 0 1 16 0v2" /><path d="M4 13h3v6H5a2 2 0 0 1-2-2v-2a2 2 0 0 1 1-2ZM20 13h-3v6h2a2 2 0 0 0 2-2v-2a2 2 0 0 0-1-2Z" /><path d="M17 19c-1 1.3-2.7 2-5 2" /></svg>;
  }
}

const benefits = [
  { icon: 'verified', title: '100% chính hãng', text: 'Cam kết nguồn gốc minh bạch' },
  { icon: 'truck', title: 'Miễn phí vận chuyển', text: 'Áp dụng theo chính sách đơn hàng' },
  { icon: 'return', title: 'Đổi trả thuận tiện', text: 'Quy trình rõ ràng, dễ theo dõi' },
  { icon: 'payment', title: 'Thanh toán an toàn', text: 'Bảo vệ thông tin giao dịch' },
  { icon: 'support', title: 'Hỗ trợ 24/7', text: 'Luôn sẵn sàng đồng hành' },
] satisfies Array<{ icon: HomeIconName; title: string; text: string }>;

const mallBrands = [
  ['MN', 'MarketNest Select', 'Chất lượng được tuyển chọn'],
  ['TECH', 'Tech House', 'Thiết bị công nghệ mới'],
  ['MODE', 'Mode Studio', 'Phong cách mỗi ngày'],
  ['HOME', 'Living Plus', 'Tiện nghi cho tổ ấm'],
  ['BEAUTY', 'Pure Beauty', 'Chăm sóc dịu lành'],
  ['SPORT', 'Active Lab', 'Năng động mỗi ngày'],
];

const collections = [
  { title: 'Góc setup công thái học', description: 'Nâng cao hiệu suất với thiết bị công thái học thông minh.', categoryAliases: ['Nội thất', 'Nhà cửa'], imageUrl: 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=1000&q=82' },
  { title: 'Minimalist City Chic', description: 'Thời trang thanh lịch mang hơi thở tối giản hiện đại.', categoryAliases: ['Thời trang'], imageUrl: 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1000&q=82' },
  { title: 'Bếp hiện đại – Sống tiện nghi', description: 'Khám phá thiết bị giúp việc bếp núc nhẹ nhàng hơn.', categoryAliases: ['Gia dụng', 'Đồ gia dụng'], imageUrl: 'https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=1000&q=82' },
  { title: 'Liệu trình phục hồi làn da', description: 'Chăm sóc da với những lựa chọn tinh giản và dịu nhẹ.', categoryAliases: ['Làm đẹp', 'Mỹ phẩm'], imageUrl: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=1000&q=82' },
];

const normalizeCategoryName = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLocaleLowerCase('vi');

export function CustomerHomePage() {
  const { isAuthenticated, user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [isCategoryLoading, setIsCategoryLoading] = useState(true);
  const [categoryError, setCategoryError] = useState('');
  const [productResult, setProductResult] = useState<ProductListResponse | null>(null);
  const [isProductLoading, setIsProductLoading] = useState(true);
  const [flashSaleResult, setFlashSaleResult] = useState<ProductListResponse | null>(null);
  const [isFlashSaleLoading, setIsFlashSaleLoading] = useState(true);
  const [flashSaleError, setFlashSaleError] = useState('');
  const [recommendationResult, setRecommendationResult] = useState<{
    userId: string;
    products: PublicProduct[];
  } | null>(null);
  const [wishlistProductIds, setWishlistProductIds] = useState<Set<string>>(new Set());
  const [updatingWishlistId, setUpdatingWishlistId] = useState<string | null>(null);
  const [wishlistMessage, setWishlistMessage] = useState('');
  const [flashSaleRemainingSeconds, setFlashSaleRemainingSeconds] = useState(
    FLASH_SALE_MAX_SECONDS,
  );

  useEffect(() => {
    let isCurrent = true;
    void getActiveCategories()
      .then((activeCategories) => { if (isCurrent) setCategories(activeCategories); })
      .catch((requestError: unknown) => {
        if (isCurrent) setCategoryError(getApiErrorMessage(requestError, 'Không thể tải danh mục lúc này.'));
      })
      .finally(() => { if (isCurrent) setIsCategoryLoading(false); });
    return () => { isCurrent = false; };
  }, []);

  useEffect(() => {
    let isCurrent = true;
    void Promise.allSettled([
      getProducts({ page: 1, limit: 10 }),
      getProducts({ page: 1, limit: 5, sort: 'LATEST_APPROVED' }),
      isAuthenticated && user?.role === 'CUSTOMER'
        ? getWishlist()
        : Promise.resolve(null),
    ])
      .then(([productsResult, flashProductsResult, wishlistResult]) => {
        if (!isCurrent) return;
        if (productsResult.status === 'fulfilled') setProductResult(productsResult.value);
        if (flashProductsResult.status === 'fulfilled') setFlashSaleResult(flashProductsResult.value);
        else setFlashSaleError(getApiErrorMessage(flashProductsResult.reason, 'Không thể tải sản phẩm mới duyệt.'));
        if (wishlistResult.status === 'fulfilled' && wishlistResult.value) {
          setWishlistProductIds(new Set(wishlistResult.value.items.map((item) => item.productId)));
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsProductLoading(false);
          setIsFlashSaleLoading(false);
        }
      });
    return () => { isCurrent = false; };
  }, [isAuthenticated, user?.role]);

  useEffect(() => {
    const isCustomer = isAuthenticated && user?.role === 'CUSTOMER';

    if (!isCustomer) return;

    const controller = new AbortController();
    const customerUserId = user.userId;

    void getRecommendations(10, controller.signal)
      .then((response) => {
        setRecommendationResult({
          userId: customerUserId,
          products: response.items.map((item) => item.product),
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setRecommendationResult({ userId: customerUserId, products: [] });
        }
      });

    return () => controller.abort();
  }, [isAuthenticated, user?.role, user?.userId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setFlashSaleRemainingSeconds((current) =>
        current <= FLASH_SALE_RESET_SECONDS
          ? FLASH_SALE_MAX_SECONDS
          : current - 1,
      );
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const products = useMemo(() => productResult?.data ?? [], [productResult]);
  const isPersonalizedHome = isAuthenticated && user?.role === 'CUSTOMER';
  const recommendedProducts =
    isPersonalizedHome && recommendationResult?.userId === user.userId
      ? recommendationResult.products
      : [];
  const isRecommendationLoading =
    isPersonalizedHome && recommendationResult?.userId !== user.userId;
  const homeRecommendationProducts = isPersonalizedHome
    ? recommendedProducts
    : products;
  const isHomeRecommendationLoading = isPersonalizedHome
    ? isRecommendationLoading
    : isProductLoading;
  const flashSaleProducts = useMemo(() => flashSaleResult?.data ?? [], [flashSaleResult]);
  const flashSaleHours = Math.floor(flashSaleRemainingSeconds / 3600);
  const flashSaleMinutes = Math.floor((flashSaleRemainingSeconds % 3600) / 60);
  const flashSaleSeconds = flashSaleRemainingSeconds % 60;

  const handleWishlistToggle = async (productId: string) => {
    if (updatingWishlistId) return;
    const isWishlisted = wishlistProductIds.has(productId);
    setUpdatingWishlistId(productId);
    setWishlistMessage('');
    try {
      if (isWishlisted) await removeFromWishlist(productId);
      else await addToWishlist(productId);
      setWishlistProductIds((current) => {
        const next = new Set(current);
        if (isWishlisted) next.delete(productId);
        else next.add(productId);
        return next;
      });
    } catch (error: unknown) {
      setWishlistMessage(getApiErrorMessage(error, 'Không thể cập nhật danh sách yêu thích.'));
    } finally {
      setUpdatingWishlistId(null);
    }
  };

  const categoryDestination = (index: number) => {
    if (categories.length === 0) return '#recommendations';
    return `/categories/${categories[index % categories.length].categoryId}`;
  };

  const collectionDestination = (categoryAliases: string[]) => {
    const normalizedAliases = categoryAliases.map(normalizeCategoryName);
    const category = categories.find((item) => {
      const normalizedName = normalizeCategoryName(item.name);
      return normalizedAliases.some((alias) => normalizedName === alias || normalizedName.includes(alias));
    });

    return category ? `/categories/${category.categoryId}` : '#categories';
  };

  return (
    <main className="customer-home">
      <div className="home-category-nav" aria-label="Điều hướng mua sắm" role="navigation">
        <span><i aria-hidden="true"><HomeIcon name="categories" /></i><b>Khám phá danh mục</b><small>Đa dạng lựa chọn</small></span>
        <span><i aria-hidden="true"><HomeIcon name="flash" /></i><b>Flash Sale</b><small>Giá sốc</small></span>
        <span><i aria-hidden="true"><HomeIcon name="verified" /></i><b>Thương hiệu chính hãng</b><small>Mall</small></span>
        <span><i aria-hidden="true"><HomeIcon name="trend" /></i><b>Xu hướng & bán chạy</b><small>Chọn lọc</small></span>
        <span><i aria-hidden="true"><HomeIcon name="new" /></i><b>Hàng mới về</b><small>Mỗi ngày</small></span>
        <span><i aria-hidden="true"><HomeIcon name="voucher" /></i><b>Voucher & mã giảm giá</b><small>Ưu đãi</small></span>
        <span><i aria-hidden="true"><HomeIcon name="live" /></i><b>MarketNest Live</b><small>Trực tiếp</small></span>
        <span className="home-category-nav__delivery"><i aria-hidden="true"><HomeIcon name="truck" /></i><b>Giao nhanh 2h</b><small>Toàn quốc</small></span>
      </div>

      <section className="promotion-area" aria-label="Chương trình nổi bật">
        <BannerCarousel banners={mockBanners} />
        <aside className="side-promotions" aria-label="Ưu đãi khác">
          {mockSidePromotions.map((promotion, index) => (
            <Link className="side-promotion" to={categoryDestination(index)} key={promotion.promotionId}>
              <img src={promotion.imageUrl} alt="" /><div className="side-promotion__overlay" />
              <div><small>{index === 0 ? 'FLASH TECH' : 'BỘ SƯU TẬP MỚI'}</small><h2>{promotion.title}</h2><p>{promotion.subtitle}</p><strong>Khám phá ngay <span aria-hidden="true">→</span></strong></div>
            </Link>
          ))}
        </aside>
      </section>

      <section className="home-benefits" aria-label="Cam kết dịch vụ">
        {benefits.map((benefit) => <article key={benefit.title}><span aria-hidden="true"><HomeIcon name={benefit.icon} /></span><div><strong>{benefit.title}</strong><small>{benefit.text}</small></div></article>)}
      </section>

      <div id="categories"><CategorySection categories={categories} isLoading={isCategoryLoading} error={categoryError} /></div>

      <section className="home-market-section home-flash-sale" id="flash-sale" aria-labelledby="flash-sale-title">
        <header className="home-section-heading home-section-heading--sale">
          <div><span className="home-section-eyebrow">Ưu đãi trong khung giờ</span><h2 id="flash-sale-title"><i aria-hidden="true"><HomeIcon name="flash" /></i> Flash Sale giờ vàng</h2></div>
          <div className="flash-countdown" aria-label="Thời gian Flash Sale còn lại">
            <span>{formatCountdownUnit(flashSaleHours)}</span>
            <b aria-hidden="true">:</b>
            <span>{formatCountdownUnit(flashSaleMinutes)}</span>
            <b aria-hidden="true">:</b>
            <span>{formatCountdownUnit(flashSaleSeconds)}</span>
          </div>
        </header>
        <ProductContent products={flashSaleProducts} isLoading={isFlashSaleLoading} error={flashSaleError} wishlistProductIds={wishlistProductIds} updatingWishlistId={updatingWishlistId} onWishlistToggle={handleWishlistToggle} variant="sale" />
      </section>

      <section className="home-market-section home-mall" aria-labelledby="mall-title">
        <header className="home-section-heading"><div><span className="home-section-eyebrow">MarketNest Mall</span><h2 id="mall-title">Thương hiệu chính hãng</h2></div><span className="home-authentic-badge"><HomeIcon name="verified" /> Tuyển chọn chất lượng</span></header>
        <div className="home-brand-grid">{mallBrands.map(([mark, name, note]) => <article key={name}><span>{mark}</span><strong>{name}</strong><small>{note}</small></article>)}</div>
      </section>

      <section className="home-collections" aria-labelledby="collections-title">
        <header className="home-section-heading"><div><span className="home-section-eyebrow">Lựa chọn hàng đầu</span><h2 id="collections-title">Bộ sưu tập xu hướng</h2></div></header>
        <div className="home-collection-grid">{collections.map((collection) => <Link to={collectionDestination(collection.categoryAliases)} key={collection.title}><img src={collection.imageUrl} alt="" loading="lazy" /><div><h3>{collection.title}</h3><p>{collection.description}</p><strong>Xem bộ sưu tập <span aria-hidden="true">→</span></strong></div></Link>)}</div>
      </section>

      {(wishlistMessage || isHomeRecommendationLoading || homeRecommendationProducts.length > 0) && (
      <section className="home-recommendations" id="recommendations" aria-label="Gợi ý hôm nay">
        {wishlistMessage && <p className="home-wishlist-message" role="alert">{wishlistMessage}</p>}
        <RecommendationSection
          title="Gợi ý hôm nay"
          products={homeRecommendationProducts}
          isLoading={isHomeRecommendationLoading}
          className="home-recommendations__section"
          skeletonCount={10}
        />
        {isAuthenticated && user?.role === 'CUSTOMER' && !isRecommendationLoading && recommendedProducts.length > 0 && (
          <div className="home-recommendations__more">
            <Link to="/recommendations">Xem tất cả gợi ý <span aria-hidden="true">→</span></Link>
          </div>
        )}
      </section>
      )}
    </main>
  );
}

interface ProductContentProps {
  products: ProductListResponse['data'];
  isLoading: boolean;
  error: string;
  wishlistProductIds: Set<string>;
  updatingWishlistId: string | null;
  onWishlistToggle: (productId: string) => Promise<void>;
  variant?: 'sale';
}

function ProductContent({ products, isLoading, error, wishlistProductIds, updatingWishlistId, onWishlistToggle, variant }: ProductContentProps) {
  if (isLoading) return <div className="home-product-skeleton" aria-label="Đang tải sản phẩm" aria-busy="true">{Array.from({ length: variant === 'sale' ? 5 : 10 }, (_, index) => <span key={index} />)}</div>;
  if (error) return <div className="home-product-state is-error" role="alert"><strong>Không thể tải sản phẩm</strong><p>{error}</p></div>;
  if (products.length === 0) return <div className="home-product-state"><strong>Chưa có sản phẩm để hiển thị</strong><p>Hãy quay lại sau để khám phá những lựa chọn mới.</p></div>;
  return <div className={`home-product-grid${variant ? ` is-${variant}` : ''}`}>{products.map((product, index) => <HomeProductCard key={`${variant ?? 'recommendation'}-${product.productId}`} product={product} promotionalLabel={variant ? `-${[18, 22, 15, 30, 20][index % 5]}%` : undefined} isWishlisted={wishlistProductIds.has(product.productId)} isWishlistUpdating={updatingWishlistId === product.productId} onWishlistToggle={onWishlistToggle} />)}</div>;
}
