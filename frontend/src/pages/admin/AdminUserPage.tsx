import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { getAdminUsers } from '../../api/admin-user.api';
import type { UserRole } from '../../types/auth';
import type { AdminUserListResponse } from '../../types/user';
import { getApiErrorMessage } from '../../utils/auth';
import './admin-user.css';

const PAGE_SIZE = 12;
const ROLE_OPTIONS: { value: '' | UserRole; label: string }[] = [
  { value: '', label: 'Tất cả vai trò' },
  { value: 'CUSTOMER', label: 'Khách hàng' },
  { value: 'SELLER', label: 'Người bán' },
  { value: 'ADMIN', label: 'Quản trị viên' },
];
const STATUS_OPTIONS: { value: '' | 'ACTIVE' | 'INACTIVE'; label: string }[] = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'ACTIVE', label: 'Đang hoạt động' },
  { value: 'INACTIVE', label: 'Đã khóa' },
];

export function AdminUserPage() {
  const [result, setResult] = useState<AdminUserListResponse | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<'' | UserRole>('');
  const [status, setStatus] = useState<'' | 'ACTIVE' | 'INACTIVE'>('');
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  const requestIdRef = useRef(0);

  const loadUsers = useCallback(async (showLoading = true) => {
    const requestId = ++requestIdRef.current;
    if (showLoading) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      const response = await getAdminUsers({
        search: search || undefined,
        role: role || undefined,
        isActive: status ? status === 'ACTIVE' : undefined,
        page,
        limit: PAGE_SIZE,
      });
      if (requestId !== requestIdRef.current) return;
      setResult(response);
      setError('');
    } catch (requestError: unknown) {
      if (requestId !== requestIdRef.current) return;
      setError(getApiErrorMessage(requestError, 'Không thể tải danh sách người dùng.'));
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [page, role, search, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadUsers(), 0);
    const handleFocus = () => void loadUsers(false);
    window.addEventListener('focus', handleFocus);
    return () => {
      window.clearTimeout(timer);
      requestIdRef.current += 1;
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadUsers]);

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = searchInput.trim();
    if (normalized === search && page === 1) void loadUsers();
    else {
      setPage(1);
      setSearch(normalized);
    }
  };

  return (
    <main className="admin-user-page">
      <header className="admin-user-heading">
        <div><span>Quản trị tài khoản</span><h1>Quản lý người dùng</h1><p>Quản lý tài khoản và trạng thái hoạt động của người dùng trên hệ thống.</p></div>
        <div><small>{isRefreshing ? 'Đang cập nhật...' : 'Kết quả phù hợp'}</small><strong>{result?.pagination.totalItems ?? '—'}</strong></div>
      </header>

      {result && (
        <section className="admin-user-summary" aria-label="Tổng quan người dùng">
          <SummaryCard label="Tổng người dùng" value={result.summary.totalUsers} />
          <SummaryCard label="Khách hàng" value={result.summary.totalCustomers} />
          <SummaryCard label="Người bán" value={result.summary.totalSellers} />
          <SummaryCard label="Quản trị viên" value={result.summary.totalAdmins} />
          <SummaryCard label="Tài khoản bị khóa" value={result.summary.inactiveUsers} danger />
        </section>
      )}

      <section className="admin-user-panel">
        <div className="admin-user-toolbar">
          <form onSubmit={handleSearch}><label htmlFor="admin-user-search">Tìm người dùng</label><div><input id="admin-user-search" type="search" value={searchInput} placeholder="Tìm theo email hoặc họ tên..." onChange={(event) => setSearchInput(event.target.value)} /><button type="submit">Tìm kiếm</button></div></form>
          <label>Vai trò<select value={role} onChange={(event) => { setRole(event.target.value as '' | UserRole); setPage(1); }}><option value="">Tất cả</option>{ROLE_OPTIONS.slice(1).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label>Trạng thái<select value={status} onChange={(event) => { setStatus(event.target.value as '' | 'ACTIVE' | 'INACTIVE'); setPage(1); }}>{STATUS_OPTIONS.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}</select></label>
        </div>

        {error && result && <div className="admin-user-inline-error" role="alert"><span>{error}</span><button type="button" onClick={() => void loadUsers(false)}>Thử lại</button></div>}

        {isLoading ? <AdminUserSkeleton /> : error && !result ? (
          <UserState title="Không thể tải danh sách người dùng" description={error} action={() => void loadUsers()} />
        ) : !result?.data.length ? (
          <UserState title="Không có người dùng phù hợp" description="Hãy thử thay đổi từ khóa hoặc bộ lọc đang sử dụng." />
        ) : (
          <>
            <div className="admin-user-table-wrap"><table className="admin-user-table"><thead><tr><th>Người dùng</th><th>Vai trò</th><th>Liên hệ</th><th>Trạng thái</th><th>Ngày tạo</th><th aria-label="Thao tác" /></tr></thead><tbody>{result.data.map((user) => <tr key={user.userId}><td data-label="Người dùng"><strong>{user.fullName}</strong><small>ID #{user.userId}</small></td><td data-label="Vai trò"><span className={`admin-user-role is-${user.role.toLowerCase()}`}>{roleLabel(user.role)}</span></td><td data-label="Liên hệ"><strong>{user.email}</strong><small>{user.phone || 'Chưa có số điện thoại'}</small></td><td data-label="Trạng thái"><span className={`admin-user-status ${user.isActive ? 'is-active' : 'is-inactive'}`}>{user.isActive ? 'Đang hoạt động' : 'Đã khóa'}</span></td><td data-label="Ngày tạo"><time dateTime={user.createdAt}>{formatDate(user.createdAt)}</time></td><td><Link to={`/admin/users/${user.userId}`}>Xem chi tiết</Link></td></tr>)}</tbody></table></div>
            <div className="admin-user-pagination"><span>Trang {result.pagination.page} / {Math.max(result.pagination.totalPages, 1)}</span><div><button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Trước</button><button type="button" disabled={page >= result.pagination.totalPages} onClick={() => setPage((current) => current + 1)}>Sau</button></div></div>
          </>
        )}
      </section>
    </main>
  );
}

function SummaryCard({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return <article className={danger ? 'is-danger' : ''}><span>{label}</span><strong>{value.toLocaleString('vi-VN')}</strong></article>;
}

function UserState({ title, description, action }: { title: string; description: string; action?: () => void }) {
  return <div className="admin-user-state"><span aria-hidden="true">◎</span><h2>{title}</h2><p>{description}</p>{action && <button type="button" onClick={action}>Thử lại</button>}</div>;
}

function AdminUserSkeleton() {
  return <div className="admin-user-loading" aria-label="Đang tải danh sách người dùng" aria-busy="true">{Array.from({ length: 6 }, (_, index) => <div key={index}><span /><i /><i /><i /></div>)}</div>;
}

function roleLabel(role: UserRole): string {
  return { CUSTOMER: 'Khách hàng', SELLER: 'Người bán', ADMIN: 'Quản trị viên' }[role];
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' }).format(new Date(value));
}
