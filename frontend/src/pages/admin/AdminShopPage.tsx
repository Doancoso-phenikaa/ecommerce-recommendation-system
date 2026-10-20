import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AdminActionDialog } from '../../components/admin/AdminActionDialog';
import {
  activateAdminShop,
  approveAdminShop,
  approveAllAdminShops,
  getAdminShops,
  rejectAdminShop,
  suspendAdminShop,
} from '../../api/admin-shop.api';
import type {
  AdminShopListResponse,
  ShopStatus,
} from '../../types/shop';
import { getApiErrorMessage } from '../../utils/auth';
import { formatShopDate, SHOP_STATUS_LABELS } from '../../utils/shop';
import './admin-shop.css';
import './admin-list-actions.css';

const STATUS_FILTERS: Array<{ label: string; value: '' | ShopStatus }> = [
  { label: 'Tất cả', value: '' },
  { label: 'Chờ duyệt', value: 'PENDING' },
  { label: 'Đang hoạt động', value: 'ACTIVE' },
  { label: 'Đã từ chối', value: 'REJECTED' },
  { label: 'Tạm ngưng', value: 'SUSPENDED' },
];

const PAGE_SIZE = 10;

type ShopDialog =
  | { kind: 'all' }
  | {
    kind: 'shop';
    shopId: string;
    shopName: string;
    action: 'approve' | 'reject' | 'suspend' | 'activate';
  };

export function AdminShopPage() {
  const [result, setResult] = useState<AdminShopListResponse | null>(null);
  const [status, setStatus] = useState<'' | ShopStatus>('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [activeAction, setActiveAction] = useState('');
  const [dialog, setDialog] = useState<ShopDialog | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionError, setRejectionError] = useState('');

  const loadShops = useCallback(async (showLoading = true) => {
    try {
      const data = await getAdminShops({
        status: status || undefined,
        search: search || undefined,
        page,
        limit: PAGE_SIZE,
      });
      setResult(data);
      setError('');
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Không thể tải danh sách gian hàng.'));
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => {
    let isCurrent = true;
    queueMicrotask(() => {
      if (isCurrent) void loadShops(true);
    });
    return () => {
      isCurrent = false;
    };
  }, [loadShops]);

  useEffect(() => {
    const handleFocus = () => {
      void loadShops(false);
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [loadShops]);

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedSearch = searchInput.trim();
    if (normalizedSearch === search && page === 1) {
      void loadShops();
      return;
    }
    setIsLoading(true);
    setError('');
    setPage(1);
    setSearch(normalizedSearch);
  };

  const handleShopAction = async (
    shopId: string,
    action: 'approve' | 'reject' | 'suspend' | 'activate',
  ): Promise<boolean> => {
    setActiveAction(`${action}:${shopId}`);
    setActionError('');
    setActionMessage('');
    try {
      if (action === 'approve') await approveAdminShop(shopId);
      if (action === 'reject') await rejectAdminShop(shopId, rejectionReason);
      if (action === 'suspend') await suspendAdminShop(shopId);
      if (action === 'activate') await activateAdminShop(shopId);
      setActionMessage('Đã cập nhật trạng thái gian hàng.');
      await loadShops(false);
      return true;
    } catch (requestError: unknown) {
      setActionError(
        getApiErrorMessage(requestError, 'Không thể cập nhật trạng thái gian hàng.'),
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
      const response = await approveAllAdminShops();
      setActionMessage(
        response.approvedCount > 0
          ? `Đã duyệt ${response.approvedCount} gian hàng.`
          : 'Không có gian hàng nào đang chờ duyệt.',
      );
      await loadShops(false);
      return true;
    } catch (requestError: unknown) {
      setActionError(
        getApiErrorMessage(requestError, 'Không thể duyệt tất cả gian hàng.'),
      );
      return false;
    } finally {
      setActiveAction('');
    }
  };

  const handleDialogConfirm = async () => {
    if (!dialog) return;
    if (dialog.kind === 'all') {
      if (await handleApproveAll()) setDialog(null);
      return;
    }
    if (dialog.action === 'reject' && !rejectionReason.trim()) {
      setRejectionError('Vui lòng nhập lý do từ chối gian hàng.');
      return;
    }
    if (await handleShopAction(dialog.shopId, dialog.action)) {
      setDialog(null);
      setRejectionReason('');
      setRejectionError('');
    }
  };

  const openShopDialog = (
    shopId: string,
    shopName: string,
    action: 'approve' | 'reject' | 'suspend' | 'activate',
  ) => {
    setRejectionReason('');
    setRejectionError('');
    setDialog({ kind: 'shop', shopId, shopName, action });
  };

  return (
    <main className="admin-shop-page">
      <header className="admin-page-heading">
        <div>
          <span className="admin-page-eyebrow">Quản lý marketplace</span>
          <h1>Gian hàng</h1>
          <p>Theo dõi hồ sơ, trạng thái và yêu cầu duyệt của tất cả gian hàng.</p>
        </div>
        <div className="admin-page-count">
          <strong>{result?.pagination.totalItems ?? '—'}</strong>
          <span>gian hàng phù hợp</span>
        </div>
      </header>

      <section className="admin-shop-panel" aria-label="Danh sách gian hàng">
        <div className="admin-shop-toolbar">
          <div className="admin-status-tabs" role="group" aria-label="Lọc theo trạng thái">
            {STATUS_FILTERS.map((filter) => (
              <button
                className={status === filter.value ? 'is-active' : ''}
                type="button"
                key={filter.label}
                onClick={() => {
                  if (filter.value === status) return;
                  setIsLoading(true);
                  setError('');
                  setStatus(filter.value);
                  setPage(1);
                }}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="admin-shop-search-actions">
            <form className="admin-shop-search" onSubmit={handleSearch}>
              <label htmlFor="admin-shop-search">Tìm gian hàng</label>
              <div>
                <input
                  id="admin-shop-search"
                  type="search"
                  value={searchInput}
                  placeholder="Tên shop, seller..."
                  onChange={(event) => setSearchInput(event.target.value)}
                />
                <button type="submit">Tìm kiếm</button>
              </div>
            </form>
            <button
              className="admin-bulk-approve"
              type="button"
              disabled={Boolean(activeAction)}
              onClick={() => setDialog({ kind: 'all' })}
            >
              {activeAction === 'approve-all' ? 'Đang duyệt...' : 'Duyệt tất cả'}
            </button>
          </div>
        </div>

        {actionMessage && <div className="admin-list-success" role="status">{actionMessage}</div>}
        {actionError && <div className="admin-action-error" role="alert">{actionError}</div>}
        {error && result && <div className="admin-action-error" role="alert">{error}</div>}

        {isLoading ? (
          <div className="admin-shop-skeleton" aria-label="Đang tải">
            {Array.from({ length: 5 }, (_, index) => <span key={index} />)}
          </div>
        ) : error && !result ? (
          <div className="admin-shop-state admin-shop-state--error">
            <strong>Không tải được dữ liệu</strong>
            <p>{error}</p>
            <button type="button" onClick={() => { setIsLoading(true); setError(''); void loadShops(true); }}>Thử lại</button>
          </div>
        ) : !result?.data.length ? (
          <div className="admin-shop-state">
            <span aria-hidden="true">◇</span>
            <strong>Không tìm thấy gian hàng</strong>
            <p>Hãy thử một trạng thái hoặc từ khóa khác.</p>
          </div>
        ) : (
          <>
            <div className="admin-shop-table-wrap">
              <table className="admin-shop-table">
                <thead>
                  <tr>
                    <th>Gian hàng</th>
                    <th>Người bán</th>
                    <th>Trạng thái</th>
                    <th>Đánh giá</th>
                    <th>Ngày tạo</th>
                    <th><span className="sr-only">Thao tác</span></th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((shop) => (
                    <tr key={shop.shopId}>
                      <td data-label="Gian hàng">
                        <strong>{shop.name}</strong>
                        <small>#{shop.shopId}</small>
                      </td>
                      <td data-label="Người bán">
                        <strong>{shop.seller.fullName}</strong>
                        <small>{shop.seller.email}</small>
                      </td>
                      <td data-label="Trạng thái">
                        <span className={`shop-status shop-status--${shop.status.toLowerCase()}`}>
                          {SHOP_STATUS_LABELS[shop.status]}
                        </span>
                      </td>
                      <td data-label="Đánh giá"><span className="admin-shop-rating">★ {shop.rating}</span></td>
                      <td data-label="Ngày tạo">{formatShopDate(shop.createdAt)}</td>
                      <td>
                        <div className="admin-list-row-actions">
                          {shop.status === 'PENDING' && <>
                            <button type="button" disabled={Boolean(activeAction)} onClick={() => openShopDialog(shop.shopId, shop.name, 'approve')}>Duyệt</button>
                            <button className="is-danger" type="button" disabled={Boolean(activeAction)} onClick={() => openShopDialog(shop.shopId, shop.name, 'reject')}>Từ chối</button>
                          </>}
                          {shop.status === 'ACTIVE' && <button className="is-warning" type="button" disabled={Boolean(activeAction)} onClick={() => openShopDialog(shop.shopId, shop.name, 'suspend')}>Tạm ngưng</button>}
                          {shop.status === 'SUSPENDED' && <button type="button" disabled={Boolean(activeAction)} onClick={() => openShopDialog(shop.shopId, shop.name, 'activate')}>Kích hoạt lại</button>}
                          <Link className="admin-shop-detail-link" to={`/admin/shops/${shop.shopId}`}>
                            Xem chi tiết <span aria-hidden="true">→</span>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="admin-pagination">
              <span>
                Trang {result.pagination.page} / {Math.max(result.pagination.totalPages, 1)}
              </span>
              <div>
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => {
                    setIsLoading(true);
                    setError('');
                    setPage((current) => current - 1);
                  }}
                >Trước</button>
                <button
                  type="button"
                  disabled={page >= result.pagination.totalPages}
                  onClick={() => {
                    setIsLoading(true);
                    setError('');
                    setPage((current) => current + 1);
                  }}
                >Sau</button>
              </div>
            </div>
          </>
        )}
      </section>
      <AdminActionDialog
        open={Boolean(dialog)}
        title={getShopDialogTitle(dialog)}
        description={getShopDialogDescription(dialog)}
        confirmLabel={getShopDialogConfirmLabel(dialog)}
        tone={dialog?.kind === 'shop' && dialog.action === 'suspend' ? 'warning' : dialog?.kind === 'shop' && dialog.action === 'reject' ? 'danger' : 'primary'}
        isLoading={Boolean(activeAction)}
        onClose={() => {
          setDialog(null);
          setRejectionReason('');
          setRejectionError('');
        }}
        onConfirm={() => void handleDialogConfirm()}
      >
        {dialog?.kind === 'shop' && dialog.action === 'reject' && (
          <>
            <label htmlFor="shop-rejection-reason">Lý do từ chối</label>
            <textarea
              id="shop-rejection-reason"
              value={rejectionReason}
              placeholder="Nêu rõ nội dung người bán cần điều chỉnh..."
              onChange={(event) => {
                setRejectionReason(event.target.value);
                setRejectionError('');
              }}
            />
            {rejectionError && <span className="admin-action-dialog__field-error">{rejectionError}</span>}
          </>
        )}
      </AdminActionDialog>
    </main>
  );
}

function getShopDialogTitle(dialog: ShopDialog | null): string {
  if (!dialog) return '';
  if (dialog.kind === 'all') return 'Duyệt tất cả gian hàng?';
  return {
    approve: `Duyệt gian hàng ${dialog.shopName}?`,
    reject: `Từ chối gian hàng ${dialog.shopName}?`,
    suspend: `Tạm ngưng gian hàng ${dialog.shopName}?`,
    activate: `Kích hoạt lại gian hàng ${dialog.shopName}?`,
  }[dialog.action];
}

function getShopDialogDescription(dialog: ShopDialog | null): string {
  if (!dialog) return '';
  if (dialog.kind === 'all') return 'Tất cả gian hàng đang chờ duyệt sẽ được kiểm tra điều kiện và kích hoạt trong cùng một lần xử lý.';
  return {
    approve: 'Gian hàng sẽ được kích hoạt và có thể đưa các sản phẩm đủ điều kiện lên marketplace.',
    reject: 'Người bán sẽ nhìn thấy lý do để chỉnh sửa hồ sơ và gửi duyệt lại.',
    suspend: 'Sản phẩm của gian hàng sẽ tạm thời không hiển thị với khách hàng.',
    activate: 'Gian hàng sẽ hoạt động trở lại sau khi xác nhận.',
  }[dialog.action];
}

function getShopDialogConfirmLabel(dialog: ShopDialog | null): string {
  if (!dialog) return '';
  if (dialog.kind === 'all') return 'Duyệt tất cả';
  return {
    approve: 'Xác nhận duyệt',
    reject: 'Xác nhận từ chối',
    suspend: 'Xác nhận tạm ngưng',
    activate: 'Xác nhận kích hoạt',
  }[dialog.action];
}
