import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getActiveCategories } from '../../api/category.api';
import { getProducts } from '../../api/product.api';
import { getPublicShopDetail } from '../../api/shop-public.api';
import { ProductListingView } from '../../components/product-listing/ProductListingView';
import { useProductListingParams } from '../../hooks/useProductListingParams';
import type { Category } from '../../types/category';
import type { ProductListResponse } from '../../types/product';
import type { PublicShopDetail } from '../../types/shop';
import { getApiErrorMessage } from '../../utils/auth';
import { formatOrderDate } from '../../utils/order';
import './shop-page.css';

const PAGE_SIZE = 12;
const SHOP_COVER_URL =
  'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1800&q=86';

const promotions = [
  {
    title: 'Sản phẩm nổi bật trong tháng',
    copy: 'Khám phá những lựa chọn được yêu thích và cập nhật mới từ gian hàng.',
    imageUrl:
      'https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=1200&q=84',
  },
  {
    title: 'Bảo hành vàng 24 tháng',
    copy: 'An tâm mua sắm với chính sách hỗ trợ rõ ràng và thuận tiện.',
    imageUrl:
      'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?auto=format&fit=crop&w=1200&q=84',
  },
];

export function ShopPage() {
  const { shopId = '' } = useParams<{ shopId: string }>();
  const { searchParams, page, sort, filters, updateQuery, resetFilters } =
    useProductListingParams();
  const search = (searchParams.get('q') ?? '').trim();
  const [searchDraft, setSearchDraft] = useState(search);
  const [shop, setShop] = useState<PublicShopDetail | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [result, setResult] = useState<ProductListResponse | null>(null);
  const [loadedShopId, setLoadedShopId] = useState('');
  const [loadedProductKey, setLoadedProductKey] = useState('');
  const [shopError, setShopError] = useState('');
  const [productError, setProductError] = useState('');
  const [isFollowing, setIsFollowing] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const isValidShopId = /^[1-9]\d*$/.test(shopId);

  useEffect(() => {
    let isCurrent = true;

    if (!isValidShopId) return;

    void Promise.all([getPublicShopDetail(shopId), getActiveCategories()])
      .then(([shopDetail, activeCategories]) => {
        if (!isCurrent) return;
        setShop(shopDetail);
        setCategories(activeCategories);
        setShopError('');
        setLoadedShopId(shopId);
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setShop(null);
          setShopError(
            getApiErrorMessage(
              error,
              'Không thể tải thông tin gian hàng lúc này.',
            ),
          );
          setLoadedShopId(shopId);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [isValidShopId, shopId]);

  const productRequestKey = shop && shop.shopId === shopId
    ? [shopId, search, filters.categoryId, filters.minPrice, filters.maxPrice, filters.inStock, sort, page].join('|')
    : '';

  useEffect(() => {
    if (!shop || !productRequestKey) return;
    let isCurrent = true;

    void getProducts({
      shopId: shop.shopId,
      search: search || undefined,
      categoryId: filters.categoryId || undefined,
      minPrice: filters.minPrice || undefined,
      maxPrice: filters.maxPrice || undefined,
      inStock: filters.inStock || undefined,
      sort,
      page,
      limit: PAGE_SIZE,
    })
      .then((response) => {
        if (isCurrent) {
          setResult(response);
          setProductError('');
          setLoadedProductKey(productRequestKey);
        }
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setResult(null);
          setProductError(
            getApiErrorMessage(
              error,
              'Không thể tải sản phẩm của gian hàng.',
            ),
          );
          setLoadedProductKey(productRequestKey);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [
    filters.categoryId,
    filters.inStock,
    filters.maxPrice,
    filters.minPrice,
    page,
    productRequestKey,
    search,
    shop,
    sort,
  ]);

  const visibleRating = useMemo(
    () => (shop ? shop.rating.toFixed(1) : '0.0'),
    [shop],
  );
  const isShopLoading = isValidShopId && loadedShopId !== shopId;
  const isProductLoading = Boolean(productRequestKey) && loadedProductKey !== productRequestKey;

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    updateQuery({ q: searchDraft.trim() || null });
  };

  if (!isValidShopId) {
    return (
      <main className="customer-shop-page">
        <section className="customer-shop-state customer-shop-state--error">
          <span aria-hidden="true">?</span>
          <h1>Không thể hiển thị gian hàng</h1>
          <p>Gian hàng không tồn tại hoặc hiện không còn hoạt động.</p>
          <Link to="/">Quay lại trang chủ</Link>
        </section>
      </main>
    );
  }

  if (isShopLoading) {
    return <ShopPageSkeleton />;
  }

  if (!shop) {
    return (
      <main className="customer-shop-page">
        <section className="customer-shop-state customer-shop-state--error">
          <span aria-hidden="true">?</span>
          <h1>Không thể hiển thị gian hàng</h1>
          <p>{shopError}</p>
          <Link to="/">Quay lại trang chủ</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="customer-shop-page">
      <section className="shop-hero" id="shop-home" aria-labelledby="shop-name">
        <img className="shop-hero__cover" src={SHOP_COVER_URL} alt="Không gian mua sắm MarketNest" />
        <div className="shop-hero__veil" />
        <article className="shop-profile-card">
          <ShopLogo logoUrl={shop.logoUrl} name={shop.name} />
          <div className="shop-profile-card__identity">
            <span>Gian hàng chính hãng</span>
            <h1 id="shop-name">{shop.name}</h1>
            <p>{shop.description || 'Mang đến những sản phẩm được chọn lọc cho khách hàng MarketNest.'}</p>
            <div className="shop-profile-card__actions">
              <button
                className={isFollowing ? 'is-following' : ''}
                type="button"
                onClick={() => setIsFollowing((current) => !current)}
              >
                {isFollowing ? 'Đang theo dõi' : '+ Theo dõi shop'}
              </button>
              <button type="button" onClick={() => setActionMessage('Tính năng trò chuyện sẽ sớm được mở trên MarketNest.')}>
                Chat ngay
              </button>
            </div>
          </div>
          <dl className="shop-profile-card__metrics">
            <div><dt>Đánh giá</dt><dd><strong>{visibleRating}</strong>/5</dd><small>{shop.reviewCount} lượt</small></div>
            <div><dt>Sản phẩm</dt><dd><strong>{shop.productCount}</strong></dd><small>Đang bán</small></div>
            <div><dt>Tham gia</dt><dd><strong>{new Date(shop.createdAt).getFullYear()}</strong></dd><small>Trên MarketNest</small></div>
          </dl>
        </article>
      </section>

      {actionMessage && <p className="shop-action-message" role="status">{actionMessage}</p>}

      <nav className="shop-navigation" aria-label="Điều hướng gian hàng">
        <a href="#shop-home">Trang chủ</a>
        <a href="#shop-products">Tất cả sản phẩm</a>
        <a href="#shop-promotions">Sản phẩm nổi bật</a>
        <a href="#shop-reviews">Đánh giá</a>
        <a href="#shop-information">Thông tin shop</a>
      </nav>

      <section className="shop-promotions" id="shop-promotions" aria-label="Ưu đãi nổi bật">
        {promotions.map((promotion, index) => (
          <article key={promotion.title}>
            <img src={promotion.imageUrl} alt={promotion.title} />
            <span aria-hidden="true" />
            <div>
              <small>{index === 0 ? 'Lựa chọn nổi bật' : 'Mua sắm an tâm'}</small>
              <h2>{promotion.title}</h2>
              <p>{promotion.copy}</p>
              <a href="#shop-products">Khám phá ngay →</a>
            </div>
          </article>
        ))}
      </section>

      <section className="shop-product-catalog" id="shop-products" aria-labelledby="shop-products-title">
        <header>
          <span>Sản phẩm của gian hàng</span>
          <h2 id="shop-products-title">Khám phá sản phẩm</h2>
        </header>
        <ProductListingView
          sectionId="shop-product-results"
          filters={{ ...filters, shopId: shop.shopId }}
          sort={sort}
          page={page}
          result={result}
          isLoading={isProductLoading}
          error={productError}
          shops={[]}
          categories={categories}
          showCategoryFilter
          showShopFilter={false}
          isCategoryLoading={false}
          onUpdateQuery={updateQuery}
          onResetFilters={resetFilters}
          emptyTitle="Gian hàng chưa có sản phẩm phù hợp"
          emptyMessage="Hãy thay đổi bộ lọc hoặc quay lại sau để xem sản phẩm mới."
          trailingAction={
            <form className="shop-product-search" role="search" onSubmit={handleSearch}>
              <input
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="Tìm trong shop..."
                aria-label="Tìm sản phẩm trong shop"
              />
              <button type="submit">Tìm</button>
            </form>
          }
        />
      </section>

      <section className="shop-review-section" id="shop-reviews" aria-labelledby="shop-review-title">
        <header>
          <div><span>Trải nghiệm mua sắm thật</span><h2 id="shop-review-title">Đánh giá từ khách hàng xác thực</h2></div>
          <strong>★ {visibleRating} / 5 <small>({shop.reviewCount} đánh giá)</small></strong>
        </header>
        {shop.reviews.length > 0 ? (
          <div className="shop-review-grid">
            {shop.reviews.map((review) => (
              <article key={review.reviewId}>
                <div className="shop-review-card__customer">
                  <span aria-hidden="true">{review.customerName.charAt(0).toLocaleUpperCase('vi')}</span>
                  <div><strong>{review.customerName}</strong><small>{formatOrderDate(review.createdAt)}</small></div>
                </div>
                <div className="shop-review-card__stars" aria-label={`${review.rating} sao`}>
                  {'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}
                </div>
                <p>{review.comment || 'Khách hàng đã đánh giá sản phẩm sau khi nhận hàng.'}</p>
                <Link to={`/products/${review.productId}`}>{review.productName}</Link>
              </article>
            ))}
          </div>
        ) : (
          <div className="shop-review-empty">Gian hàng chưa có đánh giá từ khách hàng.</div>
        )}
      </section>

      <section className="shop-about" id="shop-information" aria-labelledby="shop-about-title">
        <div><span>Về gian hàng</span><h2 id="shop-about-title">Thông tin shop</h2></div>
        <p>{shop.description || `${shop.name} cung cấp các sản phẩm đang được hiển thị công khai trên MarketNest.`}</p>
        <small>Tham gia MarketNest từ {formatOrderDate(shop.createdAt)}</small>
      </section>
    </main>
  );
}

function ShopLogo({ logoUrl, name }: { logoUrl: string | null; name: string }) {
  const [hasError, setHasError] = useState(false);

  if (!logoUrl || hasError) {
    return <span className="shop-profile-card__logo" aria-hidden="true">{name.charAt(0).toLocaleUpperCase('vi')}</span>;
  }

  return <img className="shop-profile-card__logo" src={logoUrl} alt={`Logo ${name}`} onError={() => setHasError(true)} />;
}

function ShopPageSkeleton() {
  return (
    <main className="customer-shop-page" aria-busy="true" aria-label="Đang tải gian hàng">
      <div className="shop-page-skeleton shop-page-skeleton--hero" />
      <div className="shop-page-skeleton shop-page-skeleton--nav" />
      <div className="shop-page-skeleton-row"><span /><span /></div>
      <div className="shop-page-skeleton shop-page-skeleton--products" />
    </main>
  );
}
