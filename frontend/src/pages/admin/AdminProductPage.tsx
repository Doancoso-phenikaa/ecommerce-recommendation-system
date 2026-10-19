import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { getAdminCategories } from '../../api/admin-category.api';
import { getAdminProducts } from '../../api/admin-product.api';
import { getAdminShops } from '../../api/admin-shop.api';
import type { Category } from '../../types/category';
import type {
  AdminProductListResponse,
  ProductStatus,
} from '../../types/product';
import type { AdminShopListItem } from '../../types/shop';
import { getApiErrorMessage } from '../../utils/auth';
import { formatCurrency } from '../../utils/format-currency';
import { Link } from 'react-router-dom';
import './admin-product.css';

const PAGE_SIZE = 10;

const STATUS_LABELS: Record<ProductStatus, string> = {
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Bị từ chối',
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

export function AdminProductPage() {
  const [result, setResult] = useState<AdminProductListResponse | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [shops, setShops] = useState<AdminShopListItem[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | ProductStatus>('');
  const [categoryId, setCategoryId] = useState('');
  const [shopId, setShopId] = useState('');
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadProducts = useCallback(async (showLoading = true) => {
    try {
      const [products, categoryResult, shopResult] = await Promise.all([
        getAdminProducts({
          search: search || undefined,
          status: status || undefined,
          categoryId: categoryId || undefined,
          shopId: shopId || undefined,
          page,
          limit: PAGE_SIZE,
        }),
        getAdminCategories({ page: 1, limit: 100 }),
        getAdminShops({ page: 1, limit: 100 }),
      ]);
      setResult(products);
      setCategories(categoryResult.data);
      setShops(shopResult.data);
      setError('');
    } catch (requestError) {
      setError(
        getApiErrorMessage(
          requestError,
          'Không thể tải danh sách sản phẩm.',
        ),
      );
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [categoryId, page, search, shopId, status]);

  useEffect(() => {
    let isCurrent = true;
    queueMicrotask(() => {
      if (isCurrent) void loadProducts(true);
    });
    return () => {
      isCurrent = false;
    };
  }, [loadProducts]);

  useEffect(() => {
    const handleFocus = () => {
      void loadProducts(false);
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [loadProducts]);

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedSearch = searchInput.trim();
    if (normalizedSearch === search && page === 1) {
      void loadProducts(false);
      return;
    }
    setIsLoading(true);
    setError('');
    setPage(1);
    setSearch(normalizedSearch);
  };

  const changeFilter = (callback: () => void) => {
    setIsLoading(true);
    setError('');
    setPage(1);
    callback();
  };

  return (
    <main className="admin-product-page">
      <header className="admin-product-heading">
        <div><span>Kiểm duyệt marketplace</span><h1>Quản lý sản phẩm</h1><p>Kiểm duyệt và theo dõi sản phẩm được đăng bởi các gian hàng.</p></div>
        <div><strong>{result?.pagination.totalItems ?? '—'}</strong><span>kết quả phù hợp</span></div>
      </header>

      <section className="admin-product-panel" aria-label="Danh sách sản phẩm">
        <div className="admin-product-toolbar">
          <form onSubmit={handleSearch}><label htmlFor="admin-product-search">Tìm sản phẩm</label><div><input id="admin-product-search" type="search" value={searchInput} placeholder="Nhập tên sản phẩm..." onChange={(event) => setSearchInput(event.target.value)} /><button type="submit">Tìm</button></div></form>
          <label>Trạng thái<select value={status} onChange={(event) => changeFilter(() => setStatus(event.target.value as '' | ProductStatus))}><option value="">Tất cả</option><option value="PENDING">Chờ duyệt</option><option value="APPROVED">Đã duyệt</option><option value="REJECTED">Bị từ chối</option></select></label>
          <label>Danh mục<select value={categoryId} onChange={(event) => changeFilter(() => setCategoryId(event.target.value))}><option value="">Tất cả</option>{categories.map((category) => <option value={category.categoryId} key={category.categoryId}>{category.name}</option>)}</select></label>
          <label>Gian hàng<select value={shopId} onChange={(event) => changeFilter(() => setShopId(event.target.value))}><option value="">Tất cả</option>{shops.map((shop) => <option value={shop.shopId} key={shop.shopId}>{shop.name}</option>)}</select></label>
        </div>

        {error && result && <div className="admin-product-inline-error" role="alert">{error}</div>}

        {isLoading ? (
          <div className="admin-product-skeleton" aria-label="Đang tải">{Array.from({ length: 5 }, (_, index) => <span key={index} />)}</div>
        ) : error && !result ? (
          <div className="admin-product-state is-error"><strong>Không thể tải danh sách sản phẩm.</strong><p>{error}</p><button type="button" onClick={() => { setIsLoading(true); setError(''); void loadProducts(true); }}>Thử lại</button></div>
        ) : !result?.data.length ? (
          <div className="admin-product-state"><span aria-hidden="true">▣</span><strong>Không tìm thấy sản phẩm</strong><p>Hãy thử thay đổi bộ lọc hoặc từ khóa tìm kiếm.</p></div>
        ) : (
          <>
            <div className="admin-product-table-wrap"><table className="admin-product-table"><thead><tr><th>Sản phẩm</th><th>Gian hàng</th><th>Danh mục</th><th>Giá</th><th>Tồn kho</th><th>Trạng thái</th><th>Ngày tạo</th><th><span className="sr-only">Thao tác</span></th></tr></thead><tbody>
              {result.data.map((product) => (
                <tr key={product.productId}>
                  <td data-label="Sản phẩm"><div className="admin-product-identity"><ProductThumbnail src={product.imageUrl} name={product.name} /><div><strong>{product.name}</strong><small>#{product.productId}</small></div></div></td>
                  <td data-label="Gian hàng"><strong>{product.shop?.name ?? 'Không xác định'}</strong><small>#{product.shopId}</small></td>
                  <td data-label="Danh mục">{product.category?.name ?? 'Không xác định'}</td>
                  <td data-label="Giá"><strong className="admin-product-price">{formatCurrency(product.price)}</strong></td>
                  <td data-label="Tồn kho"><strong>{product.inventory?.quantity ?? 0}</strong><small>{product.inventory?.availableQuantity ?? 0} có thể bán</small></td>
                  <td data-label="Trạng thái"><span className={`admin-product-status is-${product.status.toLowerCase()}`}>{STATUS_LABELS[product.status]}</span></td>
                  <td data-label="Ngày tạo">{formatDate(product.createdAt)}</td>
                  <td><Link className="admin-product-detail-link" to={`/admin/products/${product.productId}`}>Xem chi tiết →</Link></td>
                </tr>
              ))}
            </tbody></table></div>
            <footer className="admin-product-pagination"><span>Trang {result.pagination.page} / {Math.max(result.pagination.totalPages, 1)}</span><div><button type="button" disabled={page <= 1} onClick={() => { setIsLoading(true); setError(''); setPage((current) => current - 1); }}>Trước</button><button type="button" disabled={page >= result.pagination.totalPages} onClick={() => { setIsLoading(true); setError(''); setPage((current) => current + 1); }}>Sau</button></div></footer>
          </>
        )}
      </section>
    </main>
  );
}

function ProductThumbnail({ src, name }: { src: string | null; name: string }) {
  const [hasError, setHasError] = useState(false);
  if (!src || hasError) return <span className="admin-product-placeholder" aria-hidden="true">▣</span>;
  return <img src={src} alt={name} onError={() => setHasError(true)} />;
}
