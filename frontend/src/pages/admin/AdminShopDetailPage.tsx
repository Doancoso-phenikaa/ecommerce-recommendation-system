import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  activateAdminShop,
  approveAdminShop,
  getAdminShopDetail,
  rejectAdminShop,
  suspendAdminShop,
} from '../../api/admin-shop.api';
import type { AdminShopDetail } from '../../types/shop';
import { getApiErrorMessage } from '../../utils/auth';
import { formatShopDate, SHOP_STATUS_LABELS } from '../../utils/shop';
import './admin-shop.css';

type ConfirmAction = 'approve' | 'suspend' | 'activate';

const ACTION_COPY: Record<ConfirmAction, { title: string; description: string; button: string }> = {
  approve: {
    title: 'Duyệt gian hàng?',
    description: 'Gian hàng sẽ được kích hoạt và có thể bắt đầu hoạt động trên marketplace.',
    button: 'Duyệt gian hàng',
  },
  suspend: {
    title: 'Tạm ngưng gian hàng?',
    description: 'Sản phẩm của gian hàng sẽ không còn khả dụng với khách hàng mới.',
    button: 'Xác nhận tạm ngưng',
  },
  activate: {
    title: 'Kích hoạt lại gian hàng?',
    description: 'Gian hàng sẽ trở lại trạng thái hoạt động.',
    button: 'Kích hoạt lại',
  },
};

const SHOP_LOGO_SIZE: CSSProperties = {
  width: 'clamp(4.5rem, 7vw, 5.75rem)',
  height: 'clamp(4.5rem, 7vw, 5.75rem)',
};

export function AdminShopDetailPage() {
  const { shopId = '' } = useParams();
  const [shop, setShop] = useState<AdminShopDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [activeAction, setActiveAction] = useState<ConfirmAction | 'reject' | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectValidation, setRejectValidation] = useState('');

  const loadDetail = useCallback(async (showLoading = true) => {
    try {
      setShop(await getAdminShopDetail(shopId));
      setError('');
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Không thể tải thông tin gian hàng.'));
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    let isCurrent = true;
    queueMicrotask(() => {
      if (isCurrent) void loadDetail(true);
    });
    return () => {
      isCurrent = false;
    };
  }, [loadDetail]);

  useEffect(() => {
    const handleFocus = () => {
      void loadDetail(false);
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [loadDetail]);

  const executeAction = async (action: ConfirmAction) => {
    setActiveAction(action);
    setActionError('');
    try {
      if (action === 'approve') await approveAdminShop(shopId);
      if (action === 'suspend') await suspendAdminShop(shopId);
      if (action === 'activate') await activateAdminShop(shopId);
      setConfirmAction(null);
      await loadDetail(false);
    } catch (requestError) {
      setActionError(getApiErrorMessage(requestError, 'Không thể cập nhật trạng thái gian hàng.'));
    } finally {
      setActiveAction(null);
    }
  };

  const handleReject = async () => {
    const normalizedReason = rejectionReason.trim();
    if (!normalizedReason) {
      setRejectValidation('Vui lòng nhập lý do từ chối.');
      return;
    }

    setActiveAction('reject');
    setActionError('');
    setRejectValidation('');
    try {
      await rejectAdminShop(shopId, normalizedReason);
      setIsRejectOpen(false);
      setRejectionReason('');
      await loadDetail(false);
    } catch (requestError) {
      setActionError(getApiErrorMessage(requestError, 'Không thể từ chối gian hàng.'));
    } finally {
      setActiveAction(null);
    }
  };

  if (isLoading) {
    return <main className="admin-shop-detail-page"><div className="admin-detail-loading">Đang tải thông tin gian hàng...</div></main>;
  }

  if (!shop) {
    return (
      <main className="admin-shop-detail-page">
        <Link className="admin-back-link" to="/admin/shops">← Danh sách gian hàng</Link>
        <div className="admin-shop-state admin-shop-state--error">
          <strong>Không tải được gian hàng</strong><p>{error}</p>
          <button type="button" onClick={() => { setIsLoading(true); setError(''); void loadDetail(true); }}>Thử lại</button>
        </div>
      </main>
    );
  }

  return (
    <main className="admin-shop-detail-page">
      <Link className="admin-back-link" to="/admin/shops">← Danh sách gian hàng</Link>

      <header className="admin-detail-hero">
        <AdminShopLogo logoUrl={shop.logoUrl} shopName={shop.name} />
        <div className="admin-detail-title">
          <span className={`shop-status shop-status--${shop.status.toLowerCase()}`}>
            {SHOP_STATUS_LABELS[shop.status]}
          </span>
          <h1>{shop.name}</h1>
          <p>Mã gian hàng #{shop.shopId} · Tạo ngày {formatShopDate(shop.createdAt)}</p>
        </div>
        <div className="admin-detail-actions">
          {shop.status === 'PENDING' && (
            <>
              <button className="admin-action admin-action--primary" type="button" onClick={() => setConfirmAction('approve')}>Duyệt</button>
              <button className="admin-action admin-action--danger" type="button" onClick={() => setIsRejectOpen(true)}>Từ chối</button>
            </>
          )}
          {shop.status === 'ACTIVE' && (
            <button className="admin-action admin-action--warning" type="button" onClick={() => setConfirmAction('suspend')}>Tạm ngưng</button>
          )}
          {shop.status === 'SUSPENDED' && (
            <button className="admin-action admin-action--primary" type="button" onClick={() => setConfirmAction('activate')}>Kích hoạt lại</button>
          )}
        </div>
      </header>

      {actionError && <div className="admin-action-error" role="alert">{actionError}</div>}
      {error && <div className="admin-action-error" role="alert">{error}</div>}

      <div className="admin-detail-grid">
        <section className="admin-detail-card">
          <div className="admin-detail-card__heading"><span>01</span><div><h2>Thông tin gian hàng</h2><p>Hồ sơ được người bán cung cấp</p></div></div>
          <dl className="admin-detail-list">
            <div><dt>Tên gian hàng</dt><dd>{shop.name}</dd></div>
            <div><dt>Mô tả</dt><dd>{shop.description || 'Chưa có mô tả'}</dd></div>
            <div><dt>Đánh giá</dt><dd className="admin-shop-rating">★ {shop.rating}</dd></div>
            <div><dt>Cập nhật gần nhất</dt><dd>{formatShopDate(shop.updatedAt)}</dd></div>
          </dl>
          {shop.rejectionReason && (
            <div className="admin-rejection-note"><strong>Lý do từ chối</strong><p>{shop.rejectionReason}</p></div>
          )}
        </section>

        <section className="admin-detail-card">
          <div className="admin-detail-card__heading"><span>02</span><div><h2>Thông tin người bán</h2><p>Tài khoản sở hữu gian hàng</p></div></div>
          <dl className="admin-detail-list">
            <div><dt>Họ và tên</dt><dd>{shop.seller.user.fullName}</dd></div>
            <div><dt>Email</dt><dd>{shop.seller.user.email}</dd></div>
            <div><dt>Số điện thoại</dt><dd>{shop.seller.user.phone || 'Chưa cập nhật'}</dd></div>
            <div><dt>Trạng thái seller</dt><dd>{shop.seller.status}</dd></div>
            <div><dt>Tài khoản</dt><dd><span className={`account-state ${shop.seller.user.isActive ? 'is-active' : ''}`}>{shop.seller.user.isActive ? 'Đang hoạt động' : 'Đã khóa'}</span></dd></div>
          </dl>
        </section>
      </div>

      {confirmAction && (
        <div className="admin-modal-backdrop" role="presentation">
          <section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
            <span className="admin-modal__icon" aria-hidden="true">!</span>
            <h2 id="confirm-title">{ACTION_COPY[confirmAction].title}</h2>
            <p>{ACTION_COPY[confirmAction].description}</p>
            {actionError && <div className="admin-modal__error" role="alert">{actionError}</div>}
            <div className="admin-modal__actions">
              <button type="button" disabled={Boolean(activeAction)} onClick={() => setConfirmAction(null)}>Quay lại</button>
              <button className="admin-action--primary" type="button" disabled={Boolean(activeAction)} onClick={() => void executeAction(confirmAction)}>
                {activeAction ? 'Đang xử lý...' : ACTION_COPY[confirmAction].button}
              </button>
            </div>
          </section>
        </div>
      )}

      {isRejectOpen && (
        <div className="admin-modal-backdrop" role="presentation">
          <section className="admin-modal admin-modal--reject" role="dialog" aria-modal="true" aria-labelledby="reject-title">
            <h2 id="reject-title">Từ chối gian hàng</h2>
            <p>Lý do sẽ được hiển thị cho người bán để họ chỉnh sửa và gửi duyệt lại.</p>
            <label htmlFor="rejection-reason">Lý do từ chối</label>
            <textarea id="rejection-reason" rows={5} value={rejectionReason} onChange={(event) => { setRejectionReason(event.target.value); setRejectValidation(''); }} placeholder="Mô tả rõ nội dung cần điều chỉnh..." />
            {rejectValidation && <span className="admin-field-error">{rejectValidation}</span>}
            {actionError && <div className="admin-modal__error" role="alert">{actionError}</div>}
            <div className="admin-modal__actions">
              <button type="button" disabled={Boolean(activeAction)} onClick={() => { setIsRejectOpen(false); setRejectValidation(''); }}>Quay lại</button>
              <button className="admin-action--danger" type="button" disabled={Boolean(activeAction)} onClick={() => void handleReject()}>{activeAction ? 'Đang xử lý...' : 'Xác nhận từ chối'}</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function AdminShopLogo({
  logoUrl,
  shopName,
}: {
  logoUrl: string | null;
  shopName: string;
}) {
  const [hasImageError, setHasImageError] = useState(false);

  if (!logoUrl || hasImageError) {
    return (
      <div
        className="admin-detail-shop-mark"
        style={SHOP_LOGO_SIZE}
        aria-hidden="true"
      >
        {shopName.charAt(0).toLocaleUpperCase('vi')}
      </div>
    );
  }

  return (
    <img
      className="admin-detail-shop-mark admin-detail-shop-mark--image"
      src={logoUrl}
      alt={`Logo ${shopName}`}
      style={{
        ...SHOP_LOGO_SIZE,
        display: 'block',
        objectFit: 'cover',
        background: '#ffffff',
      }}
      onError={() => setHasImageError(true)}
    />
  );
}
