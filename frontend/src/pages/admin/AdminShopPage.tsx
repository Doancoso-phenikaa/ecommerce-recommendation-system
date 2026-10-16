import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { getAdminShops } from '../../api/admin-shop.api';
import type {
  AdminShopListResponse,
  ShopStatus,
} from '../../types/shop';
import { getApiErrorMessage } from '../../utils/auth';
import { formatShopDate, SHOP_STATUS_LABELS } from '../../utils/shop';
import './admin-shop.css';

const STATUS_FILTERS: Array<{ label: string; value: '' | ShopStatus }> = [
  { label: 'Tất cả', value: '' },
  { label: 'Chờ duyệt', value: 'PENDING' },
  { label: 'Đang hoạt động', value: 'ACTIVE' },
  { label: 'Đã từ chối', value: 'REJECTED' },
  { label: 'Tạm ngưng', value: 'SUSPENDED' },
];

const PAGE_SIZE = 10;

export function AdminShopPage() {
  const [result, setResult] = useState<AdminShopListResponse | null>(null);
  const [status, setStatus] = useState<'' | ShopStatus>('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadShops = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const data = await getAdminShops({
        status: status || undefined,
        search: search || undefined,
        page,
        limit: PAGE_SIZE,
      });
      setResult(data);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Không thể tải danh sách gian hàng.'));
    } finally {
      setIsLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => {
    let isCurrent = true;

    void getAdminShops({
      status: status || undefined,
      search: search || undefined,
      page,
      limit: PAGE_SIZE,
    })
      .then((data) => {
        if (isCurrent) setResult(data);
      })
      .catch((requestError: unknown) => {
        if (isCurrent) {
          setError(getApiErrorMessage(requestError, 'Không thể tải danh sách gian hàng.'));
        }
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [page, search, status]);

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
        </div>

        {isLoading ? (
          <div className="admin-shop-skeleton" aria-label="Đang tải">
            {Array.from({ length: 5 }, (_, index) => <span key={index} />)}
          </div>
        ) : error ? (
          <div className="admin-shop-state admin-shop-state--error">
            <strong>Không tải được dữ liệu</strong>
            <p>{error}</p>
            <button type="button" onClick={() => void loadShops()}>Thử lại</button>
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
                        <Link className="admin-shop-detail-link" to={`/admin/shops/${shop.shopId}`}>
                          Xem chi tiết <span aria-hidden="true">→</span>
                        </Link>
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
    </main>
  );
}
