import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { getAdminCategories } from '../../api/admin-category.api';
import {
  approveAdminProduct,
  approveAllAdminProducts,
  getAdminProducts,
} from '../../api/admin-product.api';
import { getAdminShops } from '../../api/admin-shop.api';
import { AdminActionDialog } from '../../components/admin/AdminActionDialog';
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
import './admin-list-actions.css';

const PAGE_SIZE = 10;

type ProductDialog =
  | { kind: 'all' }
  | { kind: 'product'; productId: string; productName: string };

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
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [activeAction, setActiveAction] = useState('');
  const [dialog, setDialog] = useState<ProductDialog | null>(null);

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

  const handleApproveProduct = async (productId: string): Promise<boolean> => {
    setActiveAction(`approve:${productId}`);
    setActionError('');
    setActionMessage('');
    try {
      await approveAdminProduct(productId);
      setActionMessage('Đã duyệt sản phẩm.');
      await loadProducts(false);
      return true;
    } catch (requestError: unknown) {
      setActionError(
        getApiErrorMessage(requestError, 'Không thể duyệt sản phẩm.'),
      );
      return false;
    } finally {
      setActiveAction('');
    }
  };

  const handleApproveAll = async (): Promise<boolean> => {
    setActiveAction('approve-all');
    setActionError('');
    setActionMessage('');
    try {
      const response = await approveAllAdminProducts();
      setActionMessage(
        response.approvedCount > 0
          ? `Đã duyệt ${response.approvedCount} sản phẩm.`
          : 'Không có sản phẩm nào đang chờ duyệt.',
      );
      await loadProducts(false);
      return true;
    } catch (requestError: unknown) {
      setActionError(
        getApiErrorMessage(requestError, 'Không thể duyệt tất cả sản phẩm.'),
      );
      return false;
    } finally {
      setActiveAction('');
    }
  };

  const handleDialogConfirm = async () => {
    if (!dialog) return;
    const succeeded = dialog.kind === 'all'
      ? await handleApproveAll()
      : await handleApproveProduct(dialog.productId);
    if (succeeded) setDialog(null);
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
          <div className="admin-product-shop-actions">
            <label>Gian hàng<select value={shopId} onChange={(event) => changeFilter(() => setShopId(event.target.value))}><option value="">Tất cả</option>{shops.map((shop) => <option value={shop.shopId} key={shop.shopId}>{shop.name}</option>)}</select></label>
            <button className="admin-bulk-approve" type="button" disabled={Boolean(activeAction)} onClick={() => setDialog({ kind: 'all' })}>{activeAction === 'approve-all' ? 'Đang duyệt...' : 'Duyệt tất cả'}</button>
          </div>
        </div>

        {actionMessage && <div className="admin-list-success" role="status">{actionMessage}</div>}
        {actionError && <div className="admin-product-inline-error" role="alert">{actionError}</div>}
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
                  <td><div className="admin-list-row-actions">{product.status === 'PENDING' && <button type="button" disabled={Boolean(activeAction)} onClick={() => setDialog({ kind: 'product', productId: product.productId, productName: product.name })}>{activeAction === `approve:${product.productId}` ? 'Đang duyệt...' : 'Duyệt'}</button>}<Link className="admin-product-detail-link" to={`/admin/products/${product.productId}`}>Xem chi tiết →</Link></div></td>
                </tr>
              ))}
            </tbody></table></div>
            <footer className="admin-product-pagination"><span>Trang {result.pagination.page} / {Math.max(result.pagination.totalPages, 1)}</span><div><button type="button" disabled={page <= 1} onClick={() => { setIsLoading(true); setError(''); setPage((current) => current - 1); }}>Trước</button><button type="button" disabled={page >= result.pagination.totalPages} onClick={() => { setIsLoading(true); setError(''); setPage((current) => current + 1); }}>Sau</button></div></footer>
          </>
        )}
      </section>
      <AdminActionDialog
        open={Boolean(dialog)}
        title={dialog?.kind === 'all' ? 'Duyệt tất cả sản phẩm?' : `Duyệt sản phẩm ${dialog?.productName ?? ''}?`}
        description={dialog?.kind === 'all' ? 'Tất cả sản phẩm đang chờ duyệt sẽ được kiểm tra điều kiện gian hàng, danh mục và tồn kho trước khi công khai.' : 'Sản phẩm sẽ được công khai với khách hàng sau khi đáp ứng các điều kiện hiện tại.'}
        confirmLabel={dialog?.kind === 'all' ? 'Duyệt tất cả' : 'Xác nhận duyệt'}
        isLoading={Boolean(activeAction)}
        onClose={() => setDialog(null)}
        onConfirm={() => void handleDialogConfirm()}
      />
    </main>
  );
}

function ProductThumbnail({ src, name }: { src: string | null; name: string }) {
  const [hasError, setHasError] = useState(false);
  if (!src || hasError) return <span className="admin-product-placeholder" aria-hidden="true">▣</span>;
  return <img src={src} alt={name} onError={() => setHasError(true)} />;
}
