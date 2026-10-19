import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  createAdminCategory,
  getAdminCategories,
  updateAdminCategory,
  updateAdminCategoryStatus,
} from '../../api/admin-category.api';
import type {
  AdminCategoryListResponse,
  Category,
  CategoryStatus,
} from '../../types/category';
import { getApiErrorMessage } from '../../utils/auth';
import './admin-category.css';
import './admin-category-images.css';

const PAGE_SIZE = 10;

interface CategoryCounts {
  total: number;
  active: number;
  inactive: number;
}

type CategoryFormState =
  | { mode: 'create'; category: null }
  | { mode: 'edit'; category: Category };

function formatCategoryDate(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

export function AdminCategoryPage() {
  const [result, setResult] = useState<AdminCategoryListResponse | null>(null);
  const [counts, setCounts] = useState<CategoryCounts | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | CategoryStatus>('');
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [formState, setFormState] = useState<CategoryFormState | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusTarget, setStatusTarget] = useState<Category | null>(null);

  const requestData = useCallback(
    async (targetPage = page) => {
      setIsLoading(true);
      setError('');
      try {
        const [categories, all, active, inactive] = await Promise.all([
          getAdminCategories({
            search: search || undefined,
            status: status || undefined,
            page: targetPage,
            limit: PAGE_SIZE,
          }),
          getAdminCategories({ page: 1, limit: 1 }),
          getAdminCategories({ status: 'ACTIVE', page: 1, limit: 1 }),
          getAdminCategories({ status: 'INACTIVE', page: 1, limit: 1 }),
        ]);
        setResult(categories);
        setCounts({
          total: all.pagination.totalItems,
          active: active.pagination.totalItems,
          inactive: inactive.pagination.totalItems,
        });
      } catch (requestError) {
        setError(
          getApiErrorMessage(
            requestError,
            'Không thể tải danh sách danh mục.',
          ),
        );
      } finally {
        setIsLoading(false);
      }
    },
    [page, search, status],
  );

  useEffect(() => {
    let isCurrent = true;
    void Promise.all([
      getAdminCategories({
        search: search || undefined,
        status: status || undefined,
        page,
        limit: PAGE_SIZE,
      }),
      getAdminCategories({ page: 1, limit: 1 }),
      getAdminCategories({ status: 'ACTIVE', page: 1, limit: 1 }),
      getAdminCategories({ status: 'INACTIVE', page: 1, limit: 1 }),
    ])
      .then(([categories, all, active, inactive]) => {
        if (!isCurrent) return;
        setResult(categories);
        setCounts({
          total: all.pagination.totalItems,
          active: active.pagination.totalItems,
          inactive: inactive.pagination.totalItems,
        });
      })
      .catch((requestError: unknown) => {
        if (isCurrent) {
          setError(
            getApiErrorMessage(
              requestError,
              'Không thể tải danh sách danh mục.',
            ),
          );
        }
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [page, search, status]);

  const openCreateForm = () => {
    setFormState({ mode: 'create', category: null });
    setName('');
    setDescription('');
    setImageUrl('');
    setFormError('');
  };

  const openEditForm = (category: Category) => {
    setFormState({ mode: 'edit', category });
    setName(category.name);
    setDescription(category.description ?? '');
    setImageUrl(category.imageUrl ?? '');
    setFormError('');
  };

  const closeForm = () => {
    if (isSubmitting) return;
    setFormState(null);
    setFormError('');
  };

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedSearch = searchInput.trim();
    if (normalizedSearch === search && page === 1) {
      void requestData();
      return;
    }
    setIsLoading(true);
    setError('');
    setPage(1);
    setSearch(normalizedSearch);
  };

  const handleCategorySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formState) return;

    const normalizedName = name.trim();
    const normalizedDescription = description.trim();
    const normalizedImageUrl = imageUrl.trim();
    if (!normalizedName) {
      setFormError('Tên danh mục không được để trống.');
      return;
    }
    if (normalizedName.length > 100) {
      setFormError('Tên danh mục không được vượt quá 100 ký tự.');
      return;
    }

    setIsSubmitting(true);
    setFormError('');
    setSuccessMessage('');
    try {
      if (formState.mode === 'create') {
        await createAdminCategory({
          name: normalizedName,
          description: normalizedDescription || undefined,
          imageUrl: normalizedImageUrl || undefined,
        });
        setSuccessMessage('Đã tạo danh mục mới.');
        setPage(1);
        await requestData(1);
      } else {
        await updateAdminCategory(formState.category.categoryId, {
          name: normalizedName,
          description: normalizedDescription,
          imageUrl: normalizedImageUrl,
        });
        setSuccessMessage('Đã cập nhật danh mục.');
        await requestData();
      }
      setFormState(null);
    } catch (requestError) {
      setFormError(
        getApiErrorMessage(requestError, 'Không thể lưu danh mục.'),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusChange = async () => {
    if (!statusTarget) return;
    const nextStatus: CategoryStatus =
      statusTarget.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

    setIsSubmitting(true);
    setFormError('');
    setSuccessMessage('');
    try {
      await updateAdminCategoryStatus(statusTarget.categoryId, {
        status: nextStatus,
      });
      setSuccessMessage(
        nextStatus === 'ACTIVE'
          ? 'Đã kích hoạt danh mục.'
          : 'Đã tạm ngưng danh mục.',
      );
      setStatusTarget(null);
      await requestData();
    } catch (requestError) {
      setFormError(
        getApiErrorMessage(
          requestError,
          'Không thể cập nhật trạng thái danh mục.',
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="admin-category-page">
      <header className="admin-category-heading">
        <div>
          <span>Quản lý marketplace</span>
          <h1>Quản lý danh mục</h1>
          <p>Quản lý các danh mục được sử dụng khi người bán đăng sản phẩm.</p>
        </div>
        <button className="admin-category-add" type="button" onClick={openCreateForm}>
          <span aria-hidden="true">+</span> Thêm danh mục
        </button>
      </header>

      <section className="admin-category-metrics" aria-label="Thống kê danh mục">
        <article><span>Tổng danh mục</span><strong>{counts?.total ?? '—'}</strong></article>
        <article><span>Đang hoạt động</span><strong>{counts?.active ?? '—'}</strong></article>
        <article><span>Tạm ngưng</span><strong>{counts?.inactive ?? '—'}</strong></article>
      </section>

      {successMessage && (
        <div className="admin-category-success" role="status">
          <span aria-hidden="true">✓</span>{successMessage}
          <button type="button" aria-label="Đóng thông báo" onClick={() => setSuccessMessage('')}>×</button>
        </div>
      )}

      <section className="admin-category-panel" aria-label="Danh sách danh mục">
        <div className="admin-category-toolbar">
          <div className="admin-category-filters" role="group" aria-label="Lọc trạng thái">
            {([
              ['', 'Tất cả'],
              ['ACTIVE', 'Đang hoạt động'],
              ['INACTIVE', 'Tạm ngưng'],
            ] as const).map(([value, label]) => (
              <button
                className={status === value ? 'is-active' : ''}
                type="button"
                key={label}
                onClick={() => {
                  if (value === status) return;
                  setIsLoading(true);
                  setError('');
                  setPage(1);
                  setStatus(value);
                }}
              >{label}</button>
            ))}
          </div>
          <form className="admin-category-search" onSubmit={handleSearch}>
            <label htmlFor="category-search">Tìm danh mục</label>
            <div>
              <input
                id="category-search"
                type="search"
                value={searchInput}
                placeholder="Nhập tên danh mục..."
                onChange={(event) => setSearchInput(event.target.value)}
              />
              <button type="submit">Tìm kiếm</button>
            </div>
          </form>
        </div>

        {isLoading ? (
          <div className="admin-category-skeleton" aria-label="Đang tải">
            {Array.from({ length: 5 }, (_, index) => <span key={index} />)}
          </div>
        ) : error ? (
          <div className="admin-category-state admin-category-state--error">
            <strong>Không thể tải danh sách danh mục.</strong>
            <p>{error}</p>
            <button type="button" onClick={() => void requestData()}>Thử lại</button>
          </div>
        ) : !result?.data.length ? (
          <div className="admin-category-state">
            <span aria-hidden="true">▦</span>
            <strong>Chưa có danh mục nào.</strong>
            <p>Tạo danh mục mới hoặc thay đổi bộ lọc hiện tại.</p>
          </div>
        ) : (
          <>
            <div className="admin-category-table-wrap">
              <table className="admin-category-table">
                <thead><tr><th>Danh mục</th><th>Mô tả</th><th>Trạng thái</th><th>Ngày tạo</th><th>Thao tác</th></tr></thead>
                <tbody>
                  {result.data.map((category) => (
                    <tr key={category.categoryId}>
                      <td data-label="Danh mục">
                        <div className="admin-category-identity">
                          <CategoryImage key={category.imageUrl ?? 'placeholder'} imageUrl={category.imageUrl} name={category.name} />
                          <div><strong>{category.name}</strong><small>#{category.categoryId}</small></div>
                        </div>
                      </td>
                      <td data-label="Mô tả"><p>{category.description || 'Chưa có mô tả'}</p></td>
                      <td data-label="Trạng thái">
                        <span className={`category-status category-status--${category.status.toLowerCase()}`}>
                          {category.status === 'ACTIVE' ? 'Đang hoạt động' : 'Tạm ngưng'}
                        </span>
                      </td>
                      <td data-label="Ngày tạo">{formatCategoryDate(category.createdAt)}</td>
                      <td data-label="Thao tác">
                        <div className="admin-category-actions">
                          <button type="button" onClick={() => openEditForm(category)}>Chỉnh sửa</button>
                          <button
                            className={category.status === 'ACTIVE' ? 'is-danger' : 'is-success'}
                            type="button"
                            onClick={() => { setStatusTarget(category); setFormError(''); }}
                          >{category.status === 'ACTIVE' ? 'Tạm ngưng' : 'Kích hoạt'}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <footer className="admin-category-pagination">
              <span>Trang {result.pagination.page} / {Math.max(result.pagination.totalPages, 1)}</span>
              <div>
                <button type="button" disabled={page <= 1} onClick={() => { setIsLoading(true); setError(''); setPage((current) => current - 1); }}>Trước</button>
                <button type="button" disabled={page >= result.pagination.totalPages} onClick={() => { setIsLoading(true); setError(''); setPage((current) => current + 1); }}>Sau</button>
              </div>
            </footer>
          </>
        )}
      </section>

      {formState && (
        <div className="admin-category-modal-backdrop" role="presentation">
          <section className="admin-category-modal" role="dialog" aria-modal="true" aria-labelledby="category-form-title">
            <header><div><span>{formState.mode === 'create' ? 'Danh mục mới' : `#${formState.category.categoryId}`}</span><h2 id="category-form-title">{formState.mode === 'create' ? 'Thêm danh mục' : 'Chỉnh sửa danh mục'}</h2></div><button type="button" aria-label="Đóng" disabled={isSubmitting} onClick={closeForm}>×</button></header>
            <form onSubmit={(event) => void handleCategorySubmit(event)}>
              <label htmlFor="category-name">Tên danh mục <span>*</span></label>
              <input id="category-name" value={name} maxLength={100} onChange={(event) => { setName(event.target.value); setFormError(''); }} placeholder="Ví dụ: Điện tử" autoFocus />
              <div className="admin-category-character-count">{name.length}/100</div>
              <label htmlFor="category-description">Mô tả <small>Không bắt buộc</small></label>
              <textarea id="category-description" rows={5} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Mô tả ngắn về nhóm sản phẩm..." />
              <label htmlFor="category-image-url">URL ảnh danh mục <small>Không bắt buộc</small></label>
              <input id="category-image-url" type="url" value={imageUrl} onChange={(event) => { setImageUrl(event.target.value); setFormError(''); }} placeholder="https://example.com/category.jpg" />
              {imageUrl.trim() && (
                <div className="admin-category-image-preview">
                  <CategoryImage key={imageUrl.trim()} imageUrl={imageUrl.trim()} name={name || 'Danh mục'} />
                  <span>Xem trước ảnh danh mục</span>
                </div>
              )}
              {formError && <div className="admin-category-form-error" role="alert">{formError}</div>}
              <footer><button type="button" disabled={isSubmitting} onClick={closeForm}>Hủy</button><button className="is-primary" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Đang lưu...' : formState.mode === 'create' ? 'Tạo danh mục' : 'Lưu thay đổi'}</button></footer>
            </form>
          </section>
        </div>
      )}

      {statusTarget && (
        <div className="admin-category-modal-backdrop" role="presentation">
          <section className="admin-category-modal admin-category-confirm" role="dialog" aria-modal="true" aria-labelledby="category-status-title">
            <span className="admin-category-confirm__icon" aria-hidden="true">!</span>
            <h2 id="category-status-title">{statusTarget.status === 'ACTIVE' ? 'Tạm ngưng danh mục?' : 'Kích hoạt danh mục?'}</h2>
            <p>
              {statusTarget.status === 'ACTIVE'
                ? `Người bán sẽ không thể chọn “${statusTarget.name}” khi tạo sản phẩm mới.`
                : `Người bán sẽ có thể chọn “${statusTarget.name}” khi tạo sản phẩm mới.`}
            </p>
            {formError && <div className="admin-category-form-error" role="alert">{formError}</div>}
            <footer><button type="button" disabled={isSubmitting} onClick={() => { setStatusTarget(null); setFormError(''); }}>Quay lại</button><button className={statusTarget.status === 'ACTIVE' ? 'is-danger' : 'is-primary'} type="button" disabled={isSubmitting} onClick={() => void handleStatusChange()}>{isSubmitting ? 'Đang xử lý...' : statusTarget.status === 'ACTIVE' ? 'Xác nhận tạm ngưng' : 'Kích hoạt'}</button></footer>
          </section>
        </div>
      )}
    </main>
  );
}

function CategoryImage({ imageUrl, name }: { imageUrl: string | null; name: string }) {
  const [hasError, setHasError] = useState(false);

  if (!imageUrl || hasError) {
    return <span className="admin-category-image-placeholder" aria-hidden="true">◇</span>;
  }

  return <img className="admin-category-image" src={imageUrl} alt={name} onError={() => setHasError(true)} />;
}
