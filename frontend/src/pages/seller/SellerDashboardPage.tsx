import axios from 'axios';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  createShop,
  getMyShop,
  resubmitShop,
  updateMyShop,
} from '../../api/shop.api';
import { useAuth } from '../../hooks/useAuth';
import type { Shop, ShopStatus } from '../../types/shop';
import { getApiErrorMessage } from '../../utils/auth';
import './seller-dashboard.css';

type ShopFormMode = 'create' | 'edit' | null;

const statusPresentation: Record<ShopStatus, { label: string; message: string }> = {
  PENDING: {
    label: 'Đang chờ duyệt',
    message: 'Gian hàng đang được Admin xem xét. Bạn chưa thể chỉnh sửa trong thời gian này.',
  },
  ACTIVE: {
    label: 'Đang hoạt động',
    message: 'Gian hàng đang hiển thị và có thể tham gia bán hàng trên MarketNest.',
  },
  REJECTED: {
    label: 'Bị từ chối',
    message: 'Hãy cập nhật thông tin theo phản hồi rồi gửi lại để Admin duyệt.',
  },
  SUSPENDED: {
    label: 'Tạm ngưng',
    message: 'Gian hàng đang bị tạm ngưng. Chỉ Admin mới có thể kích hoạt lại.',
  },
};

interface NestErrorResponse {
  message?: string | string[];
}

function isShopNotFoundError(error: unknown): boolean {
  if (!axios.isAxiosError<NestErrorResponse>(error) || error.response?.status !== 404) {
    return false;
  }

  const message = error.response.data?.message;
  return message === 'Shop not found' ||
    (Array.isArray(message) && message.includes('Shop not found'));
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Không xác định'
    : new Intl.DateTimeFormat('vi-VN').format(date);
}

export function SellerDashboardPage() {
  const { user } = useAuth();
  const [shop, setShop] = useState<Shop | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [actionError, setActionError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [formMode, setFormMode] = useState<ShopFormMode>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResubmitting, setIsResubmitting] = useState(false);

  const loadShop = useCallback(async (showLoading = true) => {
    try {
      const response = await getMyShop();
      setShop(response);
      setPageError('');
    } catch (error: unknown) {
      if (isShopNotFoundError(error)) {
        setShop(null);
        setPageError('');
      } else {
        setPageError(
          getApiErrorMessage(error, 'Không thể tải thông tin gian hàng.'),
        );
      }
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isCurrent = true;
    queueMicrotask(() => {
      if (isCurrent) void loadShop(true);
    });
    return () => {
      isCurrent = false;
    };
  }, [loadShop]);

  useEffect(() => {
    const handleFocus = () => {
      void loadShop(false);
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [loadShop]);

  const openCreateForm = () => {
    setName('');
    setDescription('');
    setFormError('');
    setActionError('');
    setSuccessMessage('');
    setFormMode('create');
  };

  const openEditForm = () => {
    if (!shop) return;
    setName(shop.name);
    setDescription(shop.description ?? '');
    setFormError('');
    setActionError('');
    setSuccessMessage('');
    setFormMode('edit');
  };

  const closeForm = () => {
    if (isSubmitting) return;
    setFormMode(null);
    setFormError('');
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formMode || isSubmitting) return;

    const normalizedName = name.trim();
    const normalizedDescription = description.trim();

    if (!normalizedName) {
      setFormError('Tên gian hàng không được để trống.');
      return;
    }

    if (normalizedName.length > 150) {
      setFormError('Tên gian hàng không được vượt quá 150 ký tự.');
      return;
    }

    setIsSubmitting(true);
    setFormError('');
    setSuccessMessage('');

    try {
      const response = formMode === 'create'
        ? await createShop({
            name: normalizedName,
            ...(normalizedDescription ? { description: normalizedDescription } : {}),
          })
        : await updateMyShop({
            name: normalizedName,
            description: normalizedDescription,
          });

      setShop(response);
      setFormMode(null);
      setSuccessMessage(
        formMode === 'create'
          ? 'Đã tạo gian hàng. Hồ sơ đang chờ Admin duyệt.'
          : 'Thông tin gian hàng đã được cập nhật.',
      );
    } catch (error: unknown) {
      setFormError(
        getApiErrorMessage(
          error,
          formMode === 'create'
            ? 'Không thể tạo gian hàng.'
            : 'Không thể cập nhật gian hàng.',
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResubmit = async () => {
    if (!shop || isResubmitting) return;

    setIsResubmitting(true);
    setActionError('');
    setSuccessMessage('');

    try {
      const response = await resubmitShop();
      setShop(response);
      setFormMode(null);
      setSuccessMessage('Đã gửi lại gian hàng để Admin duyệt.');
    } catch (error: unknown) {
      setActionError(
        getApiErrorMessage(error, 'Không thể gửi lại gian hàng để duyệt.'),
      );
    } finally {
      setIsResubmitting(false);
    }
  };

  const handleRetry = () => {
    setIsLoading(true);
    setPageError('');
    void loadShop(true);
  };

  return (
    <main className="seller-dashboard-page">
      <header className="seller-welcome">
        <div>
          <span>Trung tâm người bán</span>
          <h1>Chào {user?.fullName}</h1>
          <p>Theo dõi trạng thái và hoàn thiện gian hàng trước khi bắt đầu bán sản phẩm.</p>
        </div>
        <time>{new Intl.DateTimeFormat('vi-VN', { dateStyle: 'long' }).format(new Date())}</time>
      </header>

      {successMessage && <p className="seller-message seller-message--success" role="status">{successMessage}</p>}
      {actionError && <p className="seller-message seller-message--error" role="alert">{actionError}</p>}

      {isLoading ? (
        <section className="seller-shop-loading" aria-label="Đang tải thông tin gian hàng">
          <div><span /><i /><i /></div><aside><i /><i /><i /></aside>
        </section>
      ) : pageError && !shop ? (
        <section className="seller-page-error">
          <span aria-hidden="true">!</span>
          <h2>Không thể tải gian hàng</h2>
          <p>{pageError}</p>
          <button type="button" onClick={handleRetry}>Thử lại</button>
        </section>
      ) : !shop ? (
        <>
          <section className="seller-no-shop" id="shop-management">
            <div className="seller-no-shop__mark" aria-hidden="true">◇</div>
            <div>
              <span>Bắt đầu bán hàng</span>
              <h2>Bạn chưa tạo gian hàng</h2>
              <p>Tạo hồ sơ gian hàng để Admin xét duyệt. Bạn có thể thêm sản phẩm sau khi gian hàng được kích hoạt.</p>
            </div>
            {formMode !== 'create' && (
              <button type="button" onClick={openCreateForm}>Tạo gian hàng</button>
            )}
          </section>
          {formMode === 'create' && (
            <ShopForm
              mode="create"
              name={name}
              description={description}
              error={formError}
              isSubmitting={isSubmitting}
              onNameChange={setName}
              onDescriptionChange={setDescription}
              onSubmit={handleSubmit}
              onCancel={closeForm}
            />
          )}
        </>
      ) : (
        <>
          {pageError && <p className="seller-message seller-message--error" role="alert">{pageError}</p>}
          <section className="seller-shop-card" id="shop-management">
            <div className="seller-shop-card__topline">
              <div className="seller-shop-card__identity">
                <span aria-hidden="true">{shop.name.charAt(0).toLocaleUpperCase('vi')}</span>
                <div><small>Gian hàng của bạn</small><h2>{shop.name}</h2></div>
              </div>
              <span className={`seller-shop-status seller-shop-status--${shop.status.toLocaleLowerCase()}`}>
                {statusPresentation[shop.status].label}
              </span>
            </div>

            <p className="seller-shop-description">
              {shop.description || 'Gian hàng chưa có phần mô tả.'}
            </p>

            <dl className="seller-shop-metadata">
              <div><dt>Đánh giá</dt><dd>★ {shop.rating}/5</dd></div>
              <div><dt>Mã gian hàng</dt><dd>#{shop.shopId}</dd></div>
              <div><dt>Ngày tạo</dt><dd>{formatDate(shop.createdAt)}</dd></div>
              <div><dt>Cập nhật</dt><dd>{formatDate(shop.updatedAt)}</dd></div>
            </dl>

            <div className={`seller-shop-guidance seller-shop-guidance--${shop.status.toLocaleLowerCase()}`}>
              <strong>{statusPresentation[shop.status].label}</strong>
              <p>{statusPresentation[shop.status].message}</p>
            </div>

            {shop.status === 'REJECTED' && (
              <div className="seller-rejection-reason">
                <strong>Lý do từ chối</strong>
                <p>{shop.rejectionReason || 'Admin chưa cung cấp lý do cụ thể.'}</p>
              </div>
            )}

            <div className="seller-shop-actions">
              {(shop.status === 'ACTIVE' || shop.status === 'REJECTED') && (
                <button type="button" onClick={openEditForm}>Chỉnh sửa gian hàng</button>
              )}
              {shop.status === 'REJECTED' && (
                <button
                  className="seller-shop-actions__primary"
                  type="button"
                  onClick={() => void handleResubmit()}
                  disabled={isResubmitting || formMode === 'edit'}
                >
                  {isResubmitting ? 'Đang gửi...' : 'Gửi lại duyệt'}
                </button>
              )}
            </div>
          </section>

          {formMode === 'edit' && (
            <ShopForm
              mode="edit"
              name={name}
              description={description}
              error={formError}
              isSubmitting={isSubmitting}
              onNameChange={setName}
              onDescriptionChange={setDescription}
              onSubmit={handleSubmit}
              onCancel={closeForm}
            />
          )}

          {shop.status === 'ACTIVE' && (
            <section className="seller-quick-stats" aria-label="Tổng quan hoạt động gian hàng">
              <article><span>Sản phẩm</span><strong>0</strong><small>Sẽ kết nối ở bước tiếp theo</small></article>
              <article><span>Đơn hàng</span><strong>0</strong><small>Sẽ kết nối ở bước tiếp theo</small></article>
              <article><span>Doanh thu</span><strong>0 ₫</strong><small>Sẽ kết nối ở bước tiếp theo</small></article>
            </section>
          )}
        </>
      )}
    </main>
  );
}

interface ShopFormProps {
  mode: Exclude<ShopFormMode, null>;
  name: string;
  description: string;
  error: string;
  isSubmitting: boolean;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}

function ShopForm({
  mode,
  name,
  description,
  error,
  isSubmitting,
  onNameChange,
  onDescriptionChange,
  onSubmit,
  onCancel,
}: ShopFormProps) {
  return (
    <section className="seller-shop-form-section" aria-labelledby="shop-form-title">
      <div className="seller-shop-form-heading">
        <div>
          <span>{mode === 'create' ? 'Thiết lập gian hàng' : 'Cập nhật thông tin'}</span>
          <h2 id="shop-form-title">{mode === 'create' ? 'Tạo gian hàng' : 'Chỉnh sửa gian hàng'}</h2>
        </div>
        <button type="button" onClick={onCancel} disabled={isSubmitting} aria-label="Đóng biểu mẫu">×</button>
      </div>

      <form className="seller-shop-form" onSubmit={onSubmit} noValidate>
        <label>
          <span>Tên gian hàng <strong>*</strong></span>
          <input
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            maxLength={150}
            placeholder="Ví dụ: Góc Nhà Việt"
            disabled={isSubmitting}
            required
          />
          <small>{name.length}/150 ký tự</small>
        </label>
        <label>
          <span>Mô tả</span>
          <textarea
            value={description}
            onChange={(event) => onDescriptionChange(event.target.value)}
            rows={5}
            placeholder="Giới thiệu ngắn về sản phẩm và gian hàng của bạn"
            disabled={isSubmitting}
          />
        </label>
        {error && <p className="seller-shop-form__error" role="alert">{error}</p>}
        <div className="seller-shop-form__actions">
          <button type="button" onClick={onCancel} disabled={isSubmitting}>Hủy</button>
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? 'Đang lưu...'
              : mode === 'create'
                ? 'Tạo gian hàng'
                : 'Lưu thay đổi'}
          </button>
        </div>
      </form>
    </section>
  );
}
