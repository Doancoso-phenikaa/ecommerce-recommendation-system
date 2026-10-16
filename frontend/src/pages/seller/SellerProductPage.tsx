import axios from 'axios';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
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
  SUSPENDED: 'Gian hàng đang bị tạm ngưng.',
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
  const [totalProducts, setTotalProducts] = useState<number | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | ProductStatus>('');
  const [categoryId, setCategoryId] = useState('');
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
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
    async (targetPage = page) => {
      setIsLoading(true);
      setError('');
      try {
        const currentShop = await getMyShop();
        const [activeCategories, products, allProducts] = await Promise.all([
          getActiveCategories(),
          getSellerProducts({
            search: search || undefined,
            status: status || undefined,
            categoryId: categoryId || undefined,
            page: targetPage,
            limit: PAGE_SIZE,
          }),
          getSellerProducts({ page: 1, limit: 1 }),
        ]);
        setError('');
        setShop(currentShop);
        setCategories(activeCategories);
        setResult(products);
        setTotalProducts(allProducts.pagination.totalItems);
      } catch (requestError) {
        if (isShopNotFound(requestError)) {
          setShop(null);
          setResult(null);
          setTotalProducts(0);
        } else {
          setError(getApiErrorMessage(requestError, 'Không thể tải danh sách sản phẩm.'));
        }
      } finally {
        setIsLoading(false);
      }
    },
    [categoryId, page, search, status],
  );

  useEffect(() => {
    let isCurrent = true;
    getMyShop()
      .then(async (currentShop) => {
        const [activeCategories, products, allProducts] = await Promise.all([
          getActiveCategories(),
          getSellerProducts({
            search: search || undefined,
            status: status || undefined,
            categoryId: categoryId || undefined,
            page,
            limit: PAGE_SIZE,
          }),
          getSellerProducts({ page: 1, limit: 1 }),
        ]);
        if (!isCurrent) return;
        setShop(currentShop);
        setCategories(activeCategories);
        setResult(products);
        setTotalProducts(allProducts.pagination.totalItems);
      })
      .catch((requestError: unknown) => {
        if (!isCurrent) return;
        if (isShopNotFound(requestError)) {
          setShop(null);
          setResult(null);
          setTotalProducts(0);
        } else {
          setError(getApiErrorMessage(requestError, 'Không thể tải danh sách sản phẩm.'));
        }
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [categoryId, page, search, status]);

  const canManageProducts = shop?.status === 'ACTIVE';

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
    } catch (requestError) {
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
    } catch (requestError) {
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
    } catch (requestError) {
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
    } catch (requestError) {
      setFormError(getApiErrorMessage(requestError, 'Không thể gửi lại sản phẩm để duyệt.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="seller-product-page">
      <header className="seller-product-heading">
        <div><span>Kênh người bán</span><h1>Quản lý sản phẩm</h1><p>Theo dõi kiểm duyệt, nội dung và tồn kho của sản phẩm trong gian hàng.</p></div>
        <button type="button" disabled={!canManageProducts} onClick={openCreateForm}><span aria-hidden="true">+</span> Thêm sản phẩm</button>
      </header>

      {!isLoading && !shop && (
        <section className="seller-product-guard"><span aria-hidden="true">◇</span><div><strong>Bạn cần tạo gian hàng trước khi đăng sản phẩm.</strong><p>Đi tới mục Gian hàng để tạo hồ sơ và gửi Admin duyệt.</p></div></section>
      )}
      {!isLoading && shop && shop.status !== 'ACTIVE' && (
        <section className={`seller-product-guard seller-product-guard--${shop.status.toLowerCase()}`}><span aria-hidden="true">!</span><div><strong>Chưa thể thay đổi sản phẩm</strong><p>{SHOP_GUARD_MESSAGES[shop.status]}</p></div></section>
      )}

      {shop && (
        <>
          <section className="seller-product-summary"><div><span>Tổng sản phẩm</span><strong>{totalProducts ?? '—'}</strong></div><div><span>Gian hàng</span><strong>{shop.name}</strong></div><div><span>Quyền thao tác</span><strong>{canManageProducts ? 'Đang mở' : 'Tạm khóa'}</strong></div></section>
          {successMessage && <div className="seller-product-success" role="status"><span>✓</span>{successMessage}<button type="button" aria-label="Đóng thông báo" onClick={() => setSuccessMessage('')}>×</button></div>}

          <section className="seller-product-panel">
            <div className="seller-product-toolbar">
              <form onSubmit={handleSearch}><label htmlFor="seller-product-search">Tìm sản phẩm</label><div><input id="seller-product-search" type="search" value={searchInput} placeholder="Nhập tên sản phẩm..." onChange={(event) => setSearchInput(event.target.value)} /><button type="submit">Tìm</button></div></form>
              <label>Trạng thái<select value={status} onChange={(event) => { setIsLoading(true); setError(''); setPage(1); setStatus(event.target.value as '' | ProductStatus); }}><option value="">Tất cả</option><option value="PENDING">Chờ duyệt</option><option value="APPROVED">Đã duyệt</option><option value="REJECTED">Bị từ chối</option></select></label>
              <label>Danh mục<select value={categoryId} onChange={(event) => { setIsLoading(true); setError(''); setPage(1); setCategoryId(event.target.value); }}><option value="">Tất cả</option>{categories.map((category) => <option value={category.categoryId} key={category.categoryId}>{category.name}</option>)}</select></label>
            </div>

            {isLoading ? (
              <div className="seller-product-skeleton">{Array.from({ length: 5 }, (_, index) => <span key={index} />)}</div>
            ) : error ? (
              <div className="seller-product-state seller-product-state--error"><strong>Không thể tải danh sách sản phẩm.</strong><p>{error}</p><button type="button" onClick={() => void requestData()}>Thử lại</button></div>
            ) : !result?.data.length ? (
              <div className="seller-product-state"><span aria-hidden="true">▦</span><strong>Bạn chưa có sản phẩm nào.</strong><p>{canManageProducts ? 'Thêm sản phẩm đầu tiên để bắt đầu xây dựng gian hàng.' : 'Không có sản phẩm phù hợp với bộ lọc hiện tại.'}</p>{canManageProducts && <button type="button" onClick={openCreateForm}>Thêm sản phẩm</button>}</div>
            ) : (
              <>
                <div className="seller-product-table-wrap"><table className="seller-product-table"><thead><tr><th>Sản phẩm</th><th>Danh mục</th><th>Giá</th><th>Tồn kho</th><th>Trạng thái</th><th>Ngày tạo</th><th>Thao tác</th></tr></thead><tbody>
                  {result.data.map((product) => (
                    <tr key={product.productId} className={product.status === 'REJECTED' ? 'is-rejected' : ''}>
                      <td data-label="Sản phẩm"><div className="seller-product-identity"><ProductImage src={product.imageUrl} name={product.name} /><div><strong>{product.name}</strong><small>#{product.productId}</small>{product.status === 'REJECTED' && <p><b>Lý do từ chối:</b> {product.rejectionReason || 'Admin chưa cung cấp lý do.'}</p>}</div></div></td>
                      <td data-label="Danh mục">{product.category?.name ?? 'Không xác định'}</td>
                      <td data-label="Giá"><strong className="seller-product-price">{formatCurrency(product.price)}</strong></td>
                      <td data-label="Tồn kho"><strong>{product.inventory?.quantity ?? 0}</strong><small>{product.inventory?.availableQuantity ?? 0} có thể bán · {product.inventory?.reservedQuantity ?? 0} giữ chỗ</small></td>
                      <td data-label="Trạng thái"><span className={`seller-product-status seller-product-status--${product.status.toLowerCase()}`}>{PRODUCT_STATUS_LABELS[product.status]}</span></td>
                      <td data-label="Ngày tạo">{formatDate(product.createdAt)}</td>
                      <td data-label="Thao tác"><div className="seller-product-actions"><button type="button" disabled={!canManageProducts || openingProductId === product.productId} onClick={() => void openEditForm(product.productId)}>{openingProductId === product.productId ? 'Đang tải...' : 'Xem / Chỉnh sửa'}</button><button type="button" disabled={!canManageProducts} onClick={() => openInventoryForm(product)}>Cập nhật tồn kho</button>{product.status === 'REJECTED' && <button className="is-primary" type="button" disabled={!canManageProducts} onClick={() => { setResubmitTarget(product); setFormError(''); }}>Gửi lại duyệt</button>}</div></td>
                    </tr>
                  ))}
                </tbody></table></div>
                <footer className="seller-product-pagination"><span>Trang {result.pagination.page} / {Math.max(result.pagination.totalPages, 1)}</span><div><button type="button" disabled={page <= 1} onClick={() => { setIsLoading(true); setError(''); setPage((current) => current - 1); }}>Trước</button><button type="button" disabled={page >= result.pagination.totalPages} onClick={() => { setIsLoading(true); setError(''); setPage((current) => current + 1); }}>Sau</button></div></footer>
              </>
            )}
          </section>
        </>
      )}

      {formMode && (
        <ProductFormModal mode={formMode} editingProduct={editingProduct} categories={categories} name={name} description={description} price={price} imageUrl={imageUrl} categoryId={formCategoryId} quantity={quantity} error={formError} isSubmitting={isSubmitting} onNameChange={setName} onDescriptionChange={setDescription} onPriceChange={setPrice} onImageUrlChange={setImageUrl} onCategoryChange={setFormCategoryId} onQuantityChange={setQuantity} onSubmit={handleProductSubmit} onClose={closeForm} />
      )}

      {inventoryTarget && (
        <div className="seller-product-modal-backdrop"><section className="seller-product-modal seller-inventory-modal" role="dialog" aria-modal="true" aria-labelledby="inventory-title"><header><div><span>Quản lý tồn kho</span><h2 id="inventory-title">{inventoryTarget.name}</h2></div><button type="button" disabled={isSubmitting} onClick={() => setInventoryTarget(null)}>×</button></header><form onSubmit={(event) => void handleInventorySubmit(event)}><div className="seller-inventory-facts"><div><span>Đang giữ chỗ</span><strong>{inventoryTarget.inventory?.reservedQuantity ?? 0}</strong></div><div><span>Có thể bán</span><strong>{inventoryTarget.inventory?.availableQuantity ?? 0}</strong></div></div><label htmlFor="inventory-quantity">Tổng số lượng</label><input id="inventory-quantity" type="number" min={inventoryTarget.inventory?.reservedQuantity ?? 0} step="1" value={inventoryQuantity} onChange={(event) => { setInventoryQuantity(event.target.value); setFormError(''); }} />{formError && <div className="seller-product-form-error">{formError}</div>}<footer><button type="button" disabled={isSubmitting} onClick={() => setInventoryTarget(null)}>Hủy</button><button className="is-primary" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Đang lưu...' : 'Cập nhật tồn kho'}</button></footer></form></section></div>
      )}

      {resubmitTarget && (
        <div className="seller-product-modal-backdrop"><section className="seller-product-confirm" role="dialog" aria-modal="true" aria-labelledby="resubmit-title"><span aria-hidden="true">↗</span><h2 id="resubmit-title">Gửi lại sản phẩm để duyệt?</h2><p>Hãy chắc chắn bạn đã chỉnh sửa “{resubmitTarget.name}” theo phản hồi của Admin.</p>{formError && <div className="seller-product-form-error">{formError}</div>}<footer><button type="button" disabled={isSubmitting} onClick={() => setResubmitTarget(null)}>Quay lại</button><button className="is-primary" type="button" disabled={isSubmitting} onClick={() => void handleResubmit()}>{isSubmitting ? 'Đang gửi...' : 'Gửi lại duyệt'}</button></footer></section></div>
      )}
    </main>
  );
}

function ProductImage({ src, name }: { src: string | null; name: string }) {
  const [hasError, setHasError] = useState(false);
  if (!src || hasError) return <span className="seller-product-image-placeholder" aria-hidden="true">▦</span>;
  return <img src={src} alt={name} onError={() => setHasError(true)} />;
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
    <div className="seller-product-modal-backdrop"><section className="seller-product-modal seller-product-form-modal" role="dialog" aria-modal="true" aria-labelledby="product-form-title"><header><div><span>{props.mode === 'create' ? 'Sản phẩm mới' : `#${props.editingProduct?.productId}`}</span><h2 id="product-form-title">{props.mode === 'create' ? 'Thêm sản phẩm' : 'Chỉnh sửa sản phẩm'}</h2></div><button type="button" disabled={props.isSubmitting} onClick={props.onClose}>×</button></header><form onSubmit={props.onSubmit}><div className="seller-product-form-grid"><label>Tên sản phẩm <b>*</b><input value={props.name} maxLength={180} onChange={(event) => props.onNameChange(event.target.value)} /></label><label>Danh mục <b>*</b><select value={props.categoryId} onChange={(event) => props.onCategoryChange(event.target.value)}><option value="">Chọn danh mục</option>{currentCategoryIsInactive && props.editingProduct?.category && <option value={props.editingProduct.categoryId}>{props.editingProduct.category.name} (đã tạm ngưng)</option>}{props.categories.map((category) => <option value={category.categoryId} key={category.categoryId}>{category.name}</option>)}</select></label><label>Giá bán <b>*</b><input inputMode="decimal" value={props.price} placeholder="Ví dụ: 250000" onChange={(event) => props.onPriceChange(event.target.value)} /></label>{props.mode === 'create' && <label>Số lượng ban đầu <b>*</b><input type="number" min="0" step="1" value={props.quantity} onChange={(event) => props.onQuantityChange(event.target.value)} /></label>}<label className="is-wide">URL hình ảnh <small>Không bắt buộc</small><input type="url" value={props.imageUrl} placeholder="https://..." onChange={(event) => props.onImageUrlChange(event.target.value)} /></label><label className="is-wide">Mô tả <small>Không bắt buộc</small><textarea rows={5} value={props.description} onChange={(event) => props.onDescriptionChange(event.target.value)} /></label></div>{props.mode === 'edit' && props.editingProduct?.status === 'APPROVED' && <p className="seller-product-form-note">Sản phẩm đã duyệt sẽ chuyển về trạng thái chờ duyệt nếu nội dung thay đổi.</p>}{props.mode === 'edit' && props.editingProduct?.status === 'REJECTED' && <p className="seller-product-form-note">Sau khi chỉnh sửa, hãy dùng nút “Gửi lại duyệt” trong danh sách.</p>}{props.error && <div className="seller-product-form-error">{props.error}</div>}<footer><button type="button" disabled={props.isSubmitting} onClick={props.onClose}>Hủy</button><button className="is-primary" type="submit" disabled={props.isSubmitting}>{props.isSubmitting ? 'Đang lưu...' : props.mode === 'create' ? 'Tạo sản phẩm' : 'Lưu thay đổi'}</button></footer></form></section></div>
  );
}
