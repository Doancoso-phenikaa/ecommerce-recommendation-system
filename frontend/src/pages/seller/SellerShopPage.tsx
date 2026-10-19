import axios from 'axios';
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { getSellerProducts } from '../../api/seller-product.api';
import { getSellerStatistics } from '../../api/seller-statistics.api';
import {
  createShop,
  getMyShop,
  resubmitShop,
  updateMyShop,
} from '../../api/shop.api';
import { useAuth } from '../../hooks/useAuth';
import type { Shop, ShopStatus } from '../../types/shop';
import type { SellerStatisticsOverview } from '../../types/statistics';
import { getApiErrorMessage } from '../../utils/auth';
import './seller-dashboard.css';

type ShopFormMode = 'create' | 'edit' | null;

interface StatusPresentation {
  label: string;
  title: string;
  message: string;
}

const statusPresentation: Record<ShopStatus, StatusPresentation> = {
  PENDING: {
    label: 'Chờ duyệt',
    title: 'Đang chờ duyệt',
    message: 'Gian hàng đang chờ quản trị viên xem xét. Bạn chưa thể chỉnh sửa trong thời gian này.',
  },
  ACTIVE: {
    label: 'Đang hoạt động',
    title: 'Đang hoạt động',
    message: 'Gian hàng đang hiển thị và đủ điều kiện tham gia bán hàng trên MarketNest.',
  },
  REJECTED: {
    label: 'Bị từ chối',
    title: 'Cần cập nhật thông tin',
    message: 'Hãy chỉnh sửa gian hàng theo phản hồi của Admin, sau đó gửi lại để được xét duyệt.',
  },
  SUSPENDED: {
    label: 'Đã đình chỉ',
    title: 'Gian hàng đang bị đình chỉ',
    message: 'Gian hàng hiện ở chế độ chỉ đọc. Chỉ Admin mới có thể khôi phục trạng thái hoạt động.',
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

function formatCurrency(value: string): string {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return '—';
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(numericValue);
}

function formatShopCode(shopId: string): string {
  return `#SHOP-${shopId.padStart(4, '0')}`;
}

function isValidLogoUrl(value: string): boolean {
  if (!value) return true;
  try {
    const parsedUrl = new URL(value);
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch {
    return false;
  }
}

export function SellerShopPage() {
  const { user } = useAuth();
  const [shop, setShop] = useState<Shop | null>(null);
  const [statistics, setStatistics] = useState<SellerStatisticsOverview | null>(null);
  const [totalProducts, setTotalProducts] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStatisticsLoading, setIsStatisticsLoading] = useState(false);
  const [statisticsError, setStatisticsError] = useState('');
  const [pageError, setPageError] = useState('');
  const [actionError, setActionError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [formMode, setFormMode] = useState<ShopFormMode>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
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
        setPageError(getApiErrorMessage(error, 'Không thể tải thông tin gian hàng.'));
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
    const handleFocus = () => void loadShop(false);
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [loadShop]);

  useEffect(() => {
    if (!shop) return;

    let isCurrent = true;
    queueMicrotask(() => {
      if (!isCurrent) return;
      setIsStatisticsLoading(true);
      setStatisticsError('');

      void Promise.allSettled([
        getSellerStatistics('30d'),
        getSellerProducts({ page: 1, limit: 1 }),
      ]).then(([statisticsResult, productsResult]) => {
        if (!isCurrent) return;

        if (statisticsResult.status === 'fulfilled') {
          setStatistics(statisticsResult.value.overview);
        } else {
          setStatistics(null);
        }

        if (productsResult.status === 'fulfilled') {
          setTotalProducts(productsResult.value.pagination.totalItems);
        } else {
          setTotalProducts(null);
        }

        if (statisticsResult.status === 'rejected' || productsResult.status === 'rejected') {
          setStatisticsError('Một số số liệu chưa thể cập nhật. Bạn có thể tải lại trang để thử lại.');
        }
        setIsStatisticsLoading(false);
      });
    });

    return () => {
      isCurrent = false;
    };
  }, [shop]);

  const openCreateForm = () => {
    setName('');
    setDescription('');
    setLogoUrl('');
    setFormError('');
    setActionError('');
    setSuccessMessage('');
    setFormMode('create');
  };

  const openEditForm = () => {
    if (!shop) return;
    setName(shop.name);
    setDescription(shop.description ?? '');
    setLogoUrl(shop.logoUrl ?? '');
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
    const normalizedLogoUrl = logoUrl.trim();

    if (!normalizedName) {
      setFormError('Tên gian hàng không được để trống.');
      return;
    }

    if (normalizedName.length > 150) {
      setFormError('Tên gian hàng không được vượt quá 150 ký tự.');
      return;
    }

    if (normalizedLogoUrl.length > 2048 || !isValidLogoUrl(normalizedLogoUrl)) {
      setFormError('Logo phải là URL hợp lệ bắt đầu bằng http:// hoặc https://.');
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
            ...(normalizedLogoUrl ? { logoUrl: normalizedLogoUrl } : {}),
          })
        : await updateMyShop({
            name: normalizedName,
            description: normalizedDescription,
            logoUrl: normalizedLogoUrl,
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
      setActionError(getApiErrorMessage(error, 'Không thể gửi lại gian hàng để duyệt.'));
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
          <h1>Chào {user?.fullName ?? 'bạn'}</h1>
          <p>Theo dõi trạng thái và quản lý gian hàng của bạn.</p>
        </div>
        <time dateTime={new Date().toISOString()}>
          <DashboardIcon name="calendar" />
          {new Intl.DateTimeFormat('vi-VN', { dateStyle: 'long' }).format(new Date())}
        </time>
      </header>

      {successMessage && <p className="seller-message seller-message--success" role="status">{successMessage}</p>}
      {actionError && <p className="seller-message seller-message--error" role="alert">{actionError}</p>}

      {isLoading ? (
        <DashboardSkeleton />
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
            <div className="seller-no-shop__mark" aria-hidden="true"><DashboardIcon name="store" /></div>
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
              logoUrl={logoUrl}
              error={formError}
              isSubmitting={isSubmitting}
              onNameChange={setName}
              onDescriptionChange={setDescription}
              onLogoUrlChange={setLogoUrl}
              onSubmit={handleSubmit}
              onCancel={closeForm}
            />
          )}
        </>
      ) : (
        <>
          {pageError && <p className="seller-message seller-message--error" role="alert">{pageError}</p>}
          <section className="seller-shop-card" id="shop-management">
            <div className="seller-shop-card__accent" aria-hidden="true" />
            <div className="seller-shop-card__header">
              <div className="seller-shop-card__identity">
                <ShopLogo key={`${shop.logoUrl}-${shop.name}`} logoUrl={shop.logoUrl} name={shop.name} />
                <div>
                  <small>Gian hàng của bạn</small>
                  <h2>{shop.name}</h2>
                  <p>{shop.description || 'Gian hàng chưa có phần mô tả.'}</p>
                </div>
              </div>
              <div className="seller-shop-card__controls">
                <span className={`seller-shop-status seller-shop-status--${shop.status.toLowerCase()}`}>
                  <i aria-hidden="true" />
                  {statusPresentation[shop.status].label}
                </span>
                {(shop.status === 'ACTIVE' || shop.status === 'REJECTED') && (
                  <button type="button" onClick={openEditForm}>
                    <DashboardIcon name="edit" />
                    Chỉnh sửa gian hàng
                  </button>
                )}
                {shop.status === 'REJECTED' && (
                  <button
                    className="seller-shop-card__resubmit"
                    type="button"
                    onClick={() => void handleResubmit()}
                    disabled={isResubmitting || formMode === 'edit'}
                  >
                    <DashboardIcon name="send" />
                    {isResubmitting ? 'Đang gửi...' : 'Gửi lại duyệt'}
                  </button>
                )}
              </div>
            </div>

            <dl className="seller-shop-metadata">
              <div><dt>Đánh giá</dt><dd className="seller-shop-rating"><span aria-hidden="true">★</span> {Number(shop.rating).toFixed(1)} <small>/5</small></dd></div>
              <div><dt>Mã gian hàng</dt><dd>{formatShopCode(shop.shopId)}</dd></div>
              <div><dt>Ngày tạo</dt><dd>{formatDate(shop.createdAt)}</dd></div>
              <div><dt>Cập nhật gần nhất</dt><dd>{formatDate(shop.updatedAt)}</dd></div>
            </dl>

            <div className={`seller-shop-guidance seller-shop-guidance--${shop.status.toLowerCase()}`}>
              <span aria-hidden="true"><DashboardIcon name={shop.status === 'ACTIVE' ? 'check' : 'notice'} /></span>
              <div>
                <strong>{statusPresentation[shop.status].title}</strong>
                <p>{statusPresentation[shop.status].message}</p>
              </div>
            </div>

            {shop.status === 'REJECTED' && (
              <div className="seller-rejection-reason">
                <strong>Lý do từ chối</strong>
                <p>{shop.rejectionReason || 'Admin chưa cung cấp lý do cụ thể.'}</p>
              </div>
            )}
          </section>

          {formMode === 'edit' && (
            <ShopForm
              mode="edit"
              name={name}
              description={description}
              logoUrl={logoUrl}
              error={formError}
              isSubmitting={isSubmitting}
              onNameChange={setName}
              onDescriptionChange={setDescription}
              onLogoUrlChange={setLogoUrl}
              onSubmit={handleSubmit}
              onCancel={closeForm}
            />
          )}

          <section className="seller-activity" aria-labelledby="seller-activity-title">
            <div className="seller-activity__heading">
              <h2 id="seller-activity-title">Thống kê hoạt động</h2>
              <span>Dữ liệu thực tế từ gian hàng</span>
            </div>
            {statisticsError && <p className="seller-activity__warning" role="status">{statisticsError}</p>}
            <div className="seller-quick-stats" aria-busy={isStatisticsLoading}>
              <QuickStatCard
                icon="product"
                tone="red"
                label="Sản phẩm"
                value={isStatisticsLoading ? null : totalProducts?.toLocaleString('vi-VN')}
                note="Mặt hàng trong gian hàng"
                linkLabel="Quản lý sản phẩm"
                to="/seller/products"
              />
              <QuickStatCard
                icon="order"
                tone="blue"
                label="Đơn hàng"
                value={isStatisticsLoading ? null : statistics?.processingOrders.toLocaleString('vi-VN')}
                note="Đơn đang xử lý"
                linkLabel="Xem đơn hàng"
                to="/seller/orders"
              />
              <QuickStatCard
                icon="revenue"
                tone="green"
                label="Doanh thu"
                value={isStatisticsLoading ? null : statistics ? formatCurrency(statistics.totalRevenue) : undefined}
                note="Từ đơn đã hoàn thành"
                linkLabel="Xem thống kê"
                to="/seller/statistics"
              />
            </div>
          </section>
        </>
      )}
    </main>
  );
}

interface ShopFormProps {
  mode: Exclude<ShopFormMode, null>;
  name: string;
  description: string;
  logoUrl: string;
  error: string;
  isSubmitting: boolean;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onLogoUrlChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}

function ShopForm({
  mode,
  name,
  description,
  logoUrl,
  error,
  isSubmitting,
  onNameChange,
  onDescriptionChange,
  onLogoUrlChange,
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
        <div className="seller-shop-form__fields">
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
            <span>URL logo <small>Không bắt buộc</small></span>
            <input
              type="url"
              value={logoUrl}
              onChange={(event) => onLogoUrlChange(event.target.value)}
              maxLength={2048}
              placeholder="https://..."
              disabled={isSubmitting}
            />
          </label>
          <label className="seller-shop-form__description">
            <span>Mô tả <small>Không bắt buộc</small></span>
            <textarea
              value={description}
              onChange={(event) => onDescriptionChange(event.target.value)}
              rows={5}
              placeholder="Giới thiệu ngắn về sản phẩm và gian hàng của bạn"
              disabled={isSubmitting}
            />
          </label>
        </div>
        <aside className="seller-shop-form__preview">
          <span>Xem trước logo</span>
          <ShopLogo key={logoUrl} logoUrl={logoUrl.trim() || null} name={name.trim() || 'MarketNest'} />
          <strong>{name.trim() || 'Tên gian hàng'}</strong>
          <small>Logo hiển thị trên trang quản lý gian hàng</small>
        </aside>
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

function ShopLogo({ logoUrl, name }: { logoUrl: string | null; name: string }) {
  const [hasError, setHasError] = useState(false);
  const fallback = name.charAt(0).toLocaleUpperCase('vi') || 'M';

  return (
    <span className="seller-shop-logo">
      {logoUrl && !hasError
        ? <img src={logoUrl} alt={`Logo ${name}`} onError={() => setHasError(true)} />
        : <b aria-hidden="true">{fallback}</b>}
    </span>
  );
}

interface QuickStatCardProps {
  icon: DashboardIconName;
  tone: 'red' | 'blue' | 'green';
  label: string;
  value: string | null | undefined;
  note: string;
  linkLabel: string;
  to: string;
}

function QuickStatCard({ icon, tone, label, value, note, linkLabel, to }: QuickStatCardProps) {
  return (
    <article className={`seller-quick-stat seller-quick-stat--${tone}`}>
      <div className="seller-quick-stat__top">
        <span>{label}</span>
        <i aria-hidden="true"><DashboardIcon name={icon} /></i>
      </div>
      {value === null ? <span className="seller-quick-stat__skeleton" /> : <strong>{value ?? '—'}</strong>}
      <small>{note}</small>
      <Link to={to}>{linkLabel}<span aria-hidden="true">→</span></Link>
    </article>
  );
}

function DashboardSkeleton() {
  return (
    <div className="seller-dashboard-skeleton" aria-label="Đang tải dữ liệu gian hàng" aria-busy="true">
      <section><div><i /><span /><span /></div><aside><span /><span /></aside><footer>{Array.from({ length: 4 }, (_, index) => <span key={index} />)}</footer></section>
      <div>{Array.from({ length: 3 }, (_, index) => <article key={index}><span /><i /><i /></article>)}</div>
    </div>
  );
}

type DashboardIconName = 'calendar' | 'store' | 'edit' | 'send' | 'check' | 'notice' | 'product' | 'order' | 'revenue';

function DashboardIcon({ name }: { name: DashboardIconName }): ReactNode {
  const paths: Record<DashboardIconName, ReactNode> = {
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    store: <><path d="M4 10v10h16V10M3 4h18l-2 6H5L3 4Z" /><path d="M9 20v-6h6v6" /></>,
    edit: <><path d="m4 20 4.3-1 10.9-10.9a2.1 2.1 0 0 0-3-3L5.3 16 4 20Z" /><path d="m14.8 6.5 3 3" /></>,
    send: <><path d="m22 2-7 20-4-9-9-4 20-7Z" /><path d="M22 2 11 13" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>,
    notice: <><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></>,
    product: <><path d="m4 7 8-4 8 4-8 4-8-4Z" /><path d="m4 7 8 4v10l-8-4V7ZM20 7l-8 4v10l8-4V7Z" /></>,
    order: <><path d="M6 8h12l1 13H5L6 8Z" /><path d="M9 9V6a3 3 0 0 1 6 0v3" /></>,
    revenue: <><circle cx="12" cy="12" r="9" /><path d="M15 8.5c-.7-.6-1.7-1-3-1-1.7 0-3 .8-3 2s1 1.8 3 2.2 3 1 3 2.3-1.3 2.5-3 2.5c-1.3 0-2.5-.5-3.2-1.2M12 5.5v13" /></>,
  };

  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
