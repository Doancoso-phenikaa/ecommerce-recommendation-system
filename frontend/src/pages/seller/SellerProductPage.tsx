import axios from 'axios';
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { getActiveCategories } from '../../api/category.api';
import {
  createSellerProduct,
  getSellerProductDetail,
  getSellerProducts,
  resubmitSellerProduct,
  updateSellerInventory,
  updateSellerProduct,
} from '../../api/seller-product.api';
import { getMyShop } from '../../api/shop.api';
import type { Category } from '../../types/category';
import type {
  ProductStatus,
  SellerProduct,
  SellerProductListResponse,
} from '../../types/product';
import type { Shop } from '../../types/shop';
import { getApiErrorMessage } from '../../utils/auth';
import { formatCurrency } from '../../utils/format-currency';
import './seller-product.css';
import './seller-product-skeleton.css';

const PAGE_SIZE = 10;
const PRICE_PATTERN = /^(?=.*[1-9])\d{1,10}(?:\.\d{1,2})?$/;

const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Bị từ chối',
};

const SHOP_GUARD_MESSAGES: Record<Exclude<Shop['status'], 'ACTIVE'>, string> = {
  PENDING: 'Gian hàng đang chờ Admin duyệt.',
  REJECTED: 'Gian hàng đã bị từ chối. Hãy cập nhật và gửi lại duyệt.',
  SUSPENDED: 'Gian hàng đang bị đình chỉ. Bạn vẫn có thể xem dữ liệu sản phẩm hiện có.',
};

interface ProductStatusCounts {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
}

const emptyStatusCounts: ProductStatusCounts = {
  total: 0,
  approved: 0,
  pending: 0,
  rejected: 0,
};

type FormMode = 'create' | 'edit';

function isShopNotFound(error: unknown): boolean {
  if (!axios.isAxiosError(error) || error.response?.status !== 404) return false;
  const message = (error.response.data as { message?: string | string[] } | undefined)?.message;
  return message === 'Shop not found' || (Array.isArray(message) && message.includes('Shop not found'));
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

export function SellerProductPage() {
  const [shop, setShop] = useState<Shop | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [result, setResult] = useState<SellerProductListResponse | null>(null);
  const [statusCounts, setStatusCounts] = useState<ProductStatusCounts>(emptyStatusCounts);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | ProductStatus>('');
  const [categoryId, setCategoryId] = useState('');
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const [editingProduct, setEditingProduct] = useState<SellerProduct | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [formCategoryId, setFormCategoryId] = useState('');
  const [quantity, setQuantity] = useState('0');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [openingProductId, setOpeningProductId] = useState<string | null>(null);
  const [inventoryTarget, setInventoryTarget] = useState<SellerProduct | null>(null);
  const [inventoryQuantity, setInventoryQuantity] = useState('0');
  const [resubmitTarget, setResubmitTarget] = useState<SellerProduct | null>(null);

  const requestData = useCallback(
    async (targetPage = page, showLoading = true) => {
      if (showLoading) setIsLoading(true);
      else setIsRefreshing(true);
      setError('');

      try {
        const currentShop = await getMyShop();
        const [
          activeCategories,
          products,
          allProducts,
          approvedProducts,
          pendingProducts,
          rejectedProducts,
        ] = await Promise.all([
          getActiveCategories(),
          getSellerProducts({
            search: search || undefined,
            status: status || undefined,
            categoryId: categoryId || undefined,
            page: targetPage,
            limit: PAGE_SIZE,
          }),
          getSellerProducts({ page: 1, limit: 1 }),
          getSellerProducts({ status: 'APPROVED', page: 1, limit: 1 }),
          getSellerProducts({ status: 'PENDING', page: 1, limit: 1 }),
          getSellerProducts({ status: 'REJECTED', page: 1, limit: 1 }),
        ]);

        setShop(currentShop);
        setCategories(activeCategories);
        setResult(products);
        setStatusCounts({
          total: allProducts.pagination.totalItems,
          approved: approvedProducts.pagination.totalItems,
          pending: pendingProducts.pagination.totalItems,
          rejected: rejectedProducts.pagination.totalItems,
        });
      } catch (requestError: unknown) {
        if (isShopNotFound(requestError)) {
          setShop(null);
          setResult(null);
          setStatusCounts(emptyStatusCounts);
        } else {
          setError(getApiErrorMessage(requestError, 'Không thể tải danh sách sản phẩm.'));
        }
      } finally {
        if (showLoading) setIsLoading(false);
        else setIsRefreshing(false);
      }
    },
    [categoryId, page, search, status],
  );

  useEffect(() => {
    let isCurrent = true;
    queueMicrotask(() => {
      if (isCurrent) void requestData(page, true);
    });

    const handleFocus = () => {
      if (isCurrent) void requestData(page, false);
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      isCurrent = false;
      window.removeEventListener('focus', handleFocus);
    };
  }, [page, requestData]);

  const canManageProducts = shop?.status === 'ACTIVE';
  const hasFilters = Boolean(search || status || categoryId);
  const selectedCategory = categories.find((category) => category.categoryId === categoryId);

  const resetForm = () => {
    setName('');
    setDescription('');
    setPrice('');
    setImageUrl('');
    setFormCategoryId('');
    setQuantity('0');
    setEditingProduct(null);
    setFormError('');
  };

  const openCreateForm = () => {
    resetForm();
    setFormMode('create');
    setSuccessMessage('');
  };

  const openEditForm = async (productId: string) => {
    setOpeningProductId(productId);
    setFormError('');
    try {
      const product = await getSellerProductDetail(productId);
      setEditingProduct(product);
      setName(product.name);
      setDescription(product.description ?? '');
      setPrice(product.price);
      setImageUrl(product.imageUrl ?? '');
      setFormCategoryId(product.categoryId);
      setFormMode('edit');
    } catch (requestError: unknown) {
      setError(getApiErrorMessage(requestError, 'Không thể tải thông tin sản phẩm.'));
    } finally {
      setOpeningProductId(null);
    }
  };

  const closeForm = () => {
    if (isSubmitting) return;
    setFormMode(null);
    resetForm();
  };

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = searchInput.trim();
    if (normalized === search && page === 1) {
      void requestData();
      return;
    }
    setIsLoading(true);
    setError('');
    setPage(1);
    setSearch(normalized);
  };

  const changeStatus = (nextStatus: '' | ProductStatus) => {
    if (nextStatus === status) return;
    setIsLoading(true);
    setError('');
    setPage(1);
    setStatus(nextStatus);
  };

  const changeCategory = (nextCategoryId: string) => {
    setIsLoading(true);
    setError('');
    setPage(1);
    setCategoryId(nextCategoryId);
  };

  const resetFilters = () => {
    setSearchInput('');
    setSearch('');
    setStatus('');
    setCategoryId('');
    setPage(1);
    setError('');
    setIsLoading(true);
  };

  const validateProductForm = (): string | null => {
    if (!name.trim()) return 'Tên sản phẩm không được để trống.';
    if (name.trim().length > 180) return 'Tên sản phẩm không được vượt quá 180 ký tự.';
    if (!formCategoryId) return 'Vui lòng chọn danh mục.';
    if (!PRICE_PATTERN.test(price.trim())) return 'Giá phải lớn hơn 0 và có tối đa 2 chữ số thập phân.';
    if (formMode === 'create' && (!/^\d+$/.test(quantity) || Number(quantity) < 0)) {
      return 'Số lượng tồn kho phải là số nguyên không âm.';
    }
    return null;
  };

  const handleProductSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formMode || !canManageProducts) return;
    const validationError = validateProductForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setIsSubmitting(true);
    setFormError('');
    setSuccessMessage('');
    try {
      if (formMode === 'create') {
        await createSellerProduct({
          categoryId: formCategoryId,
          name: name.trim(),
          description: description.trim() || undefined,
          price: price.trim(),
          imageUrl: imageUrl.trim() || undefined,
          quantity: Number(quantity),
        });
        setSuccessMessage('Đã tạo sản phẩm và gửi vào hàng chờ duyệt.');
        setPage(1);
        await requestData(1);
      } else if (editingProduct) {
        await updateSellerProduct(editingProduct.productId, {
          ...(formCategoryId !== editingProduct.categoryId
            ? { categoryId: formCategoryId }
            : {}),
          name: name.trim(),
          description: description.trim(),
          price: price.trim(),
          imageUrl: imageUrl.trim(),
        });
        setSuccessMessage(
          editingProduct.status === 'APPROVED'
            ? 'Đã cập nhật sản phẩm. Sản phẩm được chuyển về trạng thái chờ duyệt.'
            : 'Đã cập nhật sản phẩm.',
        );
        await requestData();
      }
      setFormMode(null);
      resetForm();
    } catch (requestError: unknown) {
      setFormError(
        getApiErrorMessage(
          requestError,
          formMode === 'create'
            ? 'Không thể tạo sản phẩm.'
            : 'Không thể cập nhật sản phẩm.',
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const openInventoryForm = (product: SellerProduct) => {
    setInventoryTarget(product);
    setInventoryQuantity(String(product.inventory?.quantity ?? 0));
    setFormError('');
  };

  const handleInventorySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!inventoryTarget || !canManageProducts) return;
    if (!/^\d+$/.test(inventoryQuantity)) {
      setFormError('Số lượng phải là số nguyên không âm.');
      return;
    }
    const nextQuantity = Number(inventoryQuantity);
    const reservedQuantity = inventoryTarget.inventory?.reservedQuantity ?? 0;
    if (nextQuantity < reservedQuantity) {
      setFormError(`Số lượng không thể nhỏ hơn ${reservedQuantity} sản phẩm đang được giữ chỗ.`);
      return;
    }

    setIsSubmitting(true);
    setFormError('');
    try {
      await updateSellerInventory(inventoryTarget.productId, nextQuantity);
      setInventoryTarget(null);
      setSuccessMessage('Đã cập nhật tồn kho.');
      await requestData();
    } catch (requestError: unknown) {
      setFormError(getApiErrorMessage(requestError, 'Không thể cập nhật tồn kho.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResubmit = async () => {
    if (!resubmitTarget || !canManageProducts) return;
    setIsSubmitting(true);
    setFormError('');
    try {
      await resubmitSellerProduct(resubmitTarget.productId);
      setResubmitTarget(null);
      setSuccessMessage('Đã gửi lại sản phẩm để Admin duyệt.');
      await requestData();
    } catch (requestError: unknown) {
      setFormError(getApiErrorMessage(requestError, 'Không thể gửi lại sản phẩm để duyệt.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="seller-product-page">
      <header className="seller-product-heading">
        <div>
          <span>Kênh người bán</span>
          <h1>Quản lý sản phẩm</h1>
          <p>Quản lý sản phẩm, trạng thái duyệt và tồn kho của gian hàng.</p>
        </div>
        <button type="button" disabled={!canManageProducts} onClick={openCreateForm}>
          <ProductIcon name="plus" /> Thêm sản phẩm
        </button>
      </header>

      {isLoading && !shop ? <SellerProductInitialSkeleton /> : null}

      {!isLoading && !shop && (
        <section className="seller-product-guard">
          <span aria-hidden="true"><ProductIcon name="store" /></span>
          <div><strong>Bạn cần tạo gian hàng trước khi đăng sản phẩm.</strong><p>Đi tới mục Gian hàng để tạo hồ sơ và gửi Admin duyệt.</p></div>
        </section>
      )}

      {!isLoading && shop && shop.status !== 'ACTIVE' && (
        <section className={`seller-product-guard seller-product-guard--${shop.status.toLowerCase()}`}>
          <span aria-hidden="true"><ProductIcon name="notice" /></span>
          <div><strong>Chưa thể thay đổi sản phẩm</strong><p>{SHOP_GUARD_MESSAGES[shop.status]}</p></div>
        </section>
      )}

      {shop && (
        <>
          <section className="seller-product-summary" aria-label="Tổng quan sản phẩm">
            <SummaryCard label="Tổng sản phẩm" value={statusCounts.total} icon="product" tone="neutral" />
            <SummaryCard label="Đang hiển thị" value={statusCounts.approved} icon="approved" tone="green" />
            <SummaryCard label="Chờ duyệt" value={statusCounts.pending} icon="pending" tone="amber" />
            <SummaryCard label="Cần xử lý" value={statusCounts.rejected} icon="rejected" tone="red" />
          </section>

          {successMessage && (
            <div className="seller-product-success" role="status">
              <span aria-hidden="true">✓</span>{successMessage}
              <button type="button" aria-label="Đóng thông báo" onClick={() => setSuccessMessage('')}>×</button>
            </div>
          )}

          <nav className="seller-product-tabs" aria-label="Lọc theo trạng thái sản phẩm">
            <StatusTab label="Tất cả" count={statusCounts.total} active={!status} onClick={() => changeStatus('')} />
            <StatusTab label="Đã duyệt" count={statusCounts.approved} active={status === 'APPROVED'} onClick={() => changeStatus('APPROVED')} />
            <StatusTab label="Chờ duyệt" count={statusCounts.pending} active={status === 'PENDING'} onClick={() => changeStatus('PENDING')} />
            <StatusTab label="Bị từ chối" count={statusCounts.rejected} active={status === 'REJECTED'} onClick={() => changeStatus('REJECTED')} />
          </nav>

          <section className="seller-product-panel">
            <div className="seller-product-toolbar">
              <form onSubmit={handleSearch}>
                <label className="seller-product-search" htmlFor="seller-product-search">
                  <ProductIcon name="search" />
                  <input
                    id="seller-product-search"
                    type="search"
                    value={searchInput}
                    placeholder="Tìm theo tên sản phẩm..."
                    onChange={(event) => setSearchInput(event.target.value)}
                  />
                  <button type="submit">Tìm</button>
                </label>
              </form>
              <label>
                <span>Danh mục</span>
                <select value={categoryId} onChange={(event) => changeCategory(event.target.value)}>
                  <option value="">Tất cả danh mục</option>
                  {categories.map((category) => <option value={category.categoryId} key={category.categoryId}>{category.name}</option>)}
                </select>
              </label>
              <button className="seller-product-reset" type="button" disabled={!hasFilters} onClick={resetFilters}>
                <ProductIcon name="reset" /> Thiết lập lại bộ lọc
              </button>
            </div>

            {hasFilters && (
              <div className="seller-product-filter-chips">
                <span>Đang lọc:</span>
                {search && <button type="button" onClick={() => { setSearchInput(''); setSearch(''); setPage(1); }}>Từ khóa: {search} ×</button>}
                {status && <button type="button" onClick={() => changeStatus('')}>Trạng thái: {PRODUCT_STATUS_LABELS[status]} ×</button>}
                {categoryId && <button type="button" onClick={() => changeCategory('')}>Danh mục: {selectedCategory?.name ?? categoryId} ×</button>}
              </div>
            )}

            {isRefreshing && <span className="seller-product-refreshing" role="status">Đang cập nhật trạng thái mới nhất...</span>}

            {isLoading ? (
              <div className="seller-product-skeleton">{Array.from({ length: 6 }, (_, index) => <span key={index} />)}</div>
            ) : error ? (
              <div className="seller-product-state seller-product-state--error">
                <strong>Không thể tải danh sách sản phẩm.</strong><p>{error}</p><button type="button" onClick={() => void requestData()}>Thử lại</button>
              </div>
            ) : !result?.data.length ? (
              <div className="seller-product-state">
                <span aria-hidden="true"><ProductIcon name="product" /></span>
                <strong>{hasFilters ? 'Không có sản phẩm phù hợp với bộ lọc.' : 'Chưa có sản phẩm nào.'}</strong>
                <p>{hasFilters ? 'Hãy thử thay đổi từ khóa, trạng thái hoặc danh mục.' : 'Thêm sản phẩm đầu tiên để bắt đầu xây dựng gian hàng.'}</p>
                {hasFilters
                  ? <button type="button" onClick={resetFilters}>Xóa bộ lọc</button>
                  : canManageProducts && <button type="button" onClick={openCreateForm}>Thêm sản phẩm</button>}
              </div>
            ) : (
              <>
                <div className="seller-product-table-wrap">
                  <table className="seller-product-table">
                    <thead><tr><th>Sản phẩm</th><th>Danh mục</th><th>Giá niêm yết</th><th>Kho khả dụng</th><th>Trạng thái</th><th>Ngày tạo</th><th>Thao tác</th></tr></thead>
                    <tbody>
                      {result.data.map((product) => {
                        const availableQuantity = product.inventory?.availableQuantity ?? 0;
                        return (
                          <tr key={product.productId} className={product.status === 'REJECTED' ? 'is-rejected' : ''}>
                            <td data-label="Sản phẩm">
                              <div className="seller-product-identity">
                                <ProductImage src={product.imageUrl} name={product.name} />
                                <div><strong>{product.name}</strong><small>ID: #{product.productId}</small>{product.status === 'REJECTED' && <p><b>Lý do:</b> {product.rejectionReason || 'Admin chưa cung cấp lý do.'}</p>}</div>
                              </div>
                            </td>
                            <td data-label="Danh mục">{product.category?.name ?? 'Không xác định'}</td>
                            <td data-label="Giá niêm yết"><strong className="seller-product-price">{formatCurrency(product.price)}</strong></td>
                            <td data-label="Kho khả dụng">
                              <strong className={availableQuantity === 0 ? 'seller-product-stock--empty' : ''}>{availableQuantity}</strong>
                              <small>{product.inventory?.quantity ?? 0} tổng · {product.inventory?.reservedQuantity ?? 0} giữ chỗ</small>
                            </td>
                            <td data-label="Trạng thái"><span className={`seller-product-status seller-product-status--${product.status.toLowerCase()}`}>{PRODUCT_STATUS_LABELS[product.status]}</span></td>
                            <td data-label="Ngày tạo">{formatDate(product.createdAt)}</td>
                            <td data-label="Thao tác">
                              <div className="seller-product-actions">
                                <button type="button" disabled={!canManageProducts || openingProductId === product.productId} onClick={() => void openEditForm(product.productId)}>{openingProductId === product.productId ? 'Đang tải...' : 'Xem / Chỉnh sửa'}</button>
                                <button type="button" disabled={!canManageProducts} onClick={() => openInventoryForm(product)}>Tồn kho</button>
                                {product.status === 'REJECTED' && <button className="is-primary" type="button" disabled={!canManageProducts} onClick={() => { setResubmitTarget(product); setFormError(''); }}>Gửi lại duyệt</button>}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <ProductPagination pagination={result.pagination} page={page} onPageChange={(nextPage) => { setIsLoading(true); setError(''); setPage(nextPage); }} />
              </>
            )}
          </section>

          <aside className="seller-product-policy">
            <ProductIcon name="notice" />
            <div><strong>Hiển thị sản phẩm trên MarketNest</strong><p>Sản phẩm chỉ xuất hiện với khách hàng sau khi được quản trị viên phê duyệt. Hãy duy trì tồn kho chính xác để đảm bảo khả năng đặt hàng.</p></div>
          </aside>
        </>
      )}

      {formMode && (
        <ProductFormModal
          mode={formMode}
          editingProduct={editingProduct}
          categories={categories}
          name={name}
          description={description}
          price={price}
          imageUrl={imageUrl}
          categoryId={formCategoryId}
          quantity={quantity}
          error={formError}
          isSubmitting={isSubmitting}
          onNameChange={setName}
          onDescriptionChange={setDescription}
          onPriceChange={setPrice}
          onImageUrlChange={setImageUrl}
          onCategoryChange={setFormCategoryId}
          onQuantityChange={setQuantity}
          onSubmit={handleProductSubmit}
          onClose={closeForm}
        />
      )}

      {inventoryTarget && (
        <div className="seller-product-modal-backdrop">
          <section className="seller-product-modal seller-inventory-modal" role="dialog" aria-modal="true" aria-labelledby="inventory-title">
            <header><div><span>Quản lý tồn kho</span><h2 id="inventory-title">{inventoryTarget.name}</h2></div><button type="button" disabled={isSubmitting} onClick={() => setInventoryTarget(null)}>×</button></header>
            <form onSubmit={(event) => void handleInventorySubmit(event)}>
              <div className="seller-inventory-facts"><div><span>Đang giữ chỗ</span><strong>{inventoryTarget.inventory?.reservedQuantity ?? 0}</strong></div><div><span>Có thể bán</span><strong>{inventoryTarget.inventory?.availableQuantity ?? 0}</strong></div></div>
              <label htmlFor="inventory-quantity">Tổng số lượng</label>
              <input id="inventory-quantity" type="number" min={inventoryTarget.inventory?.reservedQuantity ?? 0} step="1" value={inventoryQuantity} onChange={(event) => { setInventoryQuantity(event.target.value); setFormError(''); }} />
              {formError && <div className="seller-product-form-error">{formError}</div>}
              <footer><button type="button" disabled={isSubmitting} onClick={() => setInventoryTarget(null)}>Hủy</button><button className="is-primary" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Đang lưu...' : 'Cập nhật tồn kho'}</button></footer>
            </form>
          </section>
        </div>
      )}

      {resubmitTarget && (
        <div className="seller-product-modal-backdrop">
          <section className="seller-product-confirm" role="dialog" aria-modal="true" aria-labelledby="resubmit-title">
            <span aria-hidden="true">↗</span><h2 id="resubmit-title">Gửi lại sản phẩm để duyệt?</h2><p>Hãy chắc chắn bạn đã chỉnh sửa “{resubmitTarget.name}” theo phản hồi của Admin.</p>
            {formError && <div className="seller-product-form-error">{formError}</div>}
            <footer><button type="button" disabled={isSubmitting} onClick={() => setResubmitTarget(null)}>Quay lại</button><button className="is-primary" type="button" disabled={isSubmitting} onClick={() => void handleResubmit()}>{isSubmitting ? 'Đang gửi...' : 'Gửi lại duyệt'}</button></footer>
          </section>
        </div>
      )}
    </main>
  );
}

function SummaryCard({ label, value, icon, tone }: { label: string; value: number; icon: ProductIconName; tone: string }) {
  return <article className={`seller-product-summary-card is-${tone}`}><div><span>{label}</span><i aria-hidden="true"><ProductIcon name={icon} /></i></div><strong>{value.toLocaleString('vi-VN')}</strong><small>Sản phẩm trong gian hàng</small></article>;
}

function StatusTab({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return <button type="button" className={active ? 'is-active' : ''} onClick={onClick}>{label}<span>{count}</span></button>;
}

function ProductPagination({ pagination, page, onPageChange }: { pagination: SellerProductListResponse['pagination']; page: number; onPageChange: (page: number) => void }) {
  const totalPages = Math.max(pagination.totalPages, 1);
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1).filter((candidate) => Math.abs(candidate - page) <= 1);
  const firstItem = pagination.totalItems === 0 ? 0 : (page - 1) * pagination.limit + 1;
  const lastItem = Math.min(page * pagination.limit, pagination.totalItems);

  return (
    <footer className="seller-product-pagination">
      <span>Hiển thị {firstItem}–{lastItem} trong số {pagination.totalItems} sản phẩm</span>
      <div>
        <button type="button" aria-label="Trang trước" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>‹</button>
        {pages[0] > 1 && <><button type="button" onClick={() => onPageChange(1)}>1</button>{pages[0] > 2 && <span>…</span>}</>}
        {pages.map((pageNumber) => <button type="button" className={pageNumber === page ? 'is-active' : ''} disabled={pageNumber === page} onClick={() => onPageChange(pageNumber)} key={pageNumber}>{pageNumber}</button>)}
        {pages[pages.length - 1] < totalPages && <>{pages[pages.length - 1] < totalPages - 1 && <span>…</span>}<button type="button" onClick={() => onPageChange(totalPages)}>{totalPages}</button></>}
        <button type="button" aria-label="Trang sau" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>›</button>
      </div>
    </footer>
  );
}

function SellerProductInitialSkeleton() {
  return (
    <section className="seller-product-initial-skeleton" aria-label="Đang tải dữ liệu quản lý sản phẩm" aria-busy="true">
      <div className="seller-product-initial-skeleton__summary">{Array.from({ length: 4 }, (_, index) => <span key={index} />)}</div>
      <div className="seller-product-initial-skeleton__panel">
        <div className="seller-product-initial-skeleton__toolbar">{Array.from({ length: 3 }, (_, index) => <span key={index} />)}</div>
        <div className="seller-product-skeleton">{Array.from({ length: 6 }, (_, index) => <span key={index} />)}</div>
      </div>
    </section>
  );
}

function ProductImage({ src, name }: { src: string | null; name: string }) {
  const [hasError, setHasError] = useState(false);
  if (!src || hasError) return <span className="seller-product-image-placeholder" aria-hidden="true">{name.charAt(0).toLocaleUpperCase('vi')}</span>;
  return <img src={src} alt={name} loading="lazy" onError={() => setHasError(true)} />;
}

interface ProductFormModalProps {
  mode: FormMode;
  editingProduct: SellerProduct | null;
  categories: Category[];
  name: string;
  description: string;
  price: string;
  imageUrl: string;
  categoryId: string;
  quantity: string;
  error: string;
  isSubmitting: boolean;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onPriceChange: (value: string) => void;
  onImageUrlChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onQuantityChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}

function ProductFormModal(props: ProductFormModalProps) {
  const currentCategoryIsInactive = props.mode === 'edit' && props.editingProduct?.category?.status === 'INACTIVE';
  return (
    <div className="seller-product-modal-backdrop">
      <section className="seller-product-modal seller-product-form-modal" role="dialog" aria-modal="true" aria-labelledby="product-form-title">
        <header><div><span>{props.mode === 'create' ? 'Sản phẩm mới' : `#${props.editingProduct?.productId}`}</span><h2 id="product-form-title">{props.mode === 'create' ? 'Thêm sản phẩm' : 'Chỉnh sửa sản phẩm'}</h2></div><button type="button" aria-label="Đóng biểu mẫu" disabled={props.isSubmitting} onClick={props.onClose}>×</button></header>
        <form onSubmit={props.onSubmit}>
          <div className="seller-product-form-grid">
            <label>Tên sản phẩm <b>*</b><input value={props.name} maxLength={180} onChange={(event) => props.onNameChange(event.target.value)} /></label>
            <label>Danh mục <b>*</b><select value={props.categoryId} onChange={(event) => props.onCategoryChange(event.target.value)}><option value="">Chọn danh mục</option>{currentCategoryIsInactive && props.editingProduct?.category && <option value={props.editingProduct.categoryId}>{props.editingProduct.category.name} (đã tạm ngưng)</option>}{props.categories.map((category) => <option value={category.categoryId} key={category.categoryId}>{category.name}</option>)}</select></label>
            <label>Giá bán <b>*</b><input inputMode="decimal" value={props.price} placeholder="Ví dụ: 250000" onChange={(event) => props.onPriceChange(event.target.value)} /></label>
            {props.mode === 'create' && <label>Số lượng ban đầu <b>*</b><input type="number" min="0" step="1" value={props.quantity} onChange={(event) => props.onQuantityChange(event.target.value)} /></label>}
            <label className="is-wide">URL hình ảnh <small>Không bắt buộc</small><input type="url" value={props.imageUrl} placeholder="https://..." onChange={(event) => props.onImageUrlChange(event.target.value)} /></label>
            <label className="is-wide">Mô tả <small>Không bắt buộc</small><textarea rows={5} value={props.description} onChange={(event) => props.onDescriptionChange(event.target.value)} /></label>
          </div>
          {props.mode === 'edit' && props.editingProduct?.status === 'APPROVED' && <p className="seller-product-form-note">Sản phẩm đã duyệt sẽ chuyển về trạng thái chờ duyệt nếu nội dung thay đổi.</p>}
          {props.mode === 'edit' && props.editingProduct?.status === 'REJECTED' && <p className="seller-product-form-note">Sau khi chỉnh sửa, hãy dùng nút “Gửi lại duyệt” trong danh sách.</p>}
          {props.error && <div className="seller-product-form-error">{props.error}</div>}
          <footer><button type="button" disabled={props.isSubmitting} onClick={props.onClose}>Hủy</button><button className="is-primary" type="submit" disabled={props.isSubmitting}>{props.isSubmitting ? 'Đang lưu...' : props.mode === 'create' ? 'Tạo sản phẩm' : 'Lưu thay đổi'}</button></footer>
        </form>
      </section>
    </div>
  );
}

type ProductIconName = 'plus' | 'store' | 'notice' | 'product' | 'approved' | 'pending' | 'rejected' | 'search' | 'reset';

function ProductIcon({ name }: { name: ProductIconName }): ReactNode {
  const paths: Record<ProductIconName, ReactNode> = {
    plus: <><path d="M12 5v14M5 12h14" /></>,
    store: <><path d="M4 10v10h16V10M3 4h18l-2 6H5L3 4Z" /><path d="M9 20v-6h6v6" /></>,
    notice: <><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></>,
    product: <><path d="m4 7 8-4 8 4-8 4-8-4Z" /><path d="m4 7 8 4v10l-8-4V7ZM20 7l-8 4v10l8-4V7Z" /></>,
    approved: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>,
    pending: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    rejected: <><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6M15 9l-6 6" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    reset: <><path d="M4 7v5h5" /><path d="M5.5 16a8 8 0 1 0 1-9L4 9" /></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
