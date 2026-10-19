import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getAdminUserDetail, updateAdminUserStatus } from '../../api/admin-user.api';
import { useAuth } from '../../hooks/useAuth';
import type { AdminUserDetail } from '../../types/user';
import { getApiErrorMessage } from '../../utils/auth';
import { SHOP_STATUS_LABELS } from '../../utils/shop';
import './admin-user.css';

export function AdminUserDetailPage() {
  const { userId = '' } = useParams();
  const { user: currentUser } = useAuth();
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const requestIdRef = useRef(0);

  const loadUser = useCallback(async (showLoading = true) => {
    const requestId = ++requestIdRef.current;
    if (showLoading) setIsLoading(true);
    try {
      const response = await getAdminUserDetail(userId);
      if (requestId !== requestIdRef.current) return;
      setUser(response);
      setError('');
    } catch (requestError: unknown) {
      if (requestId !== requestIdRef.current) return;
      setError(getApiErrorMessage(requestError, 'Không thể tải thông tin người dùng.'));
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadUser(), 0);
    const handleFocus = () => void loadUser(false);
    window.addEventListener('focus', handleFocus);
    return () => {
      window.clearTimeout(timer);
      requestIdRef.current += 1;
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadUser]);

  const handleStatusChange = async () => {
    if (!user) return;
    setIsUpdating(true);
    setActionError('');
    try {
      await updateAdminUserStatus(user.userId, !user.isActive);
      setIsConfirmOpen(false);
      await loadUser(false);
    } catch (requestError: unknown) {
      setActionError(getApiErrorMessage(requestError, 'Không thể cập nhật trạng thái tài khoản.'));
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) return <main className="admin-user-detail-page"><AdminUserDetailSkeleton /></main>;
  if (!user) return <main className="admin-user-detail-page"><Link className="admin-user-back" to="/admin/users">← Danh sách người dùng</Link><UserDetailError message={error} retry={() => void loadUser()} /></main>;

  const isSelf = user.userId === currentUser?.userId;
  const canManageStatus = user.role !== 'ADMIN' && !isSelf;

  return (
    <main className="admin-user-detail-page">
      <Link className="admin-user-back" to="/admin/users">← Danh sách người dùng</Link>
      <header className="admin-user-detail-heading">
        <div className="admin-user-avatar" aria-hidden="true">{user.fullName.charAt(0).toLocaleUpperCase('vi')}</div>
        <div><span className={`admin-user-status ${user.isActive ? 'is-active' : 'is-inactive'}`}>{user.isActive ? 'Đang hoạt động' : 'Đã khóa'}</span><h1>{user.fullName}</h1><p>{user.email} · ID #{user.userId}</p></div>
        {canManageStatus && <button className={user.isActive ? 'is-lock' : 'is-unlock'} type="button" onClick={() => { setActionError(''); setIsConfirmOpen(true); }}>{user.isActive ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}</button>}
      </header>

      {actionError && <div className="admin-user-action-error" role="alert">{actionError}</div>}

      <div className="admin-user-detail-grid">
        <div className="admin-user-detail-main">
          <section className="admin-user-detail-card"><header><span>01</span><div><h2>Thông tin tài khoản</h2><p>Thông tin xác thực và trạng thái truy cập hệ thống</p></div></header><dl><div><dt>Họ và tên</dt><dd>{user.fullName}</dd></div><div><dt>Email</dt><dd>{user.email}</dd></div><div><dt>Số điện thoại</dt><dd>{user.phone || 'Chưa cập nhật'}</dd></div><div><dt>Vai trò</dt><dd>{roleLabel(user.role)}</dd></div><div><dt>Ngày tạo</dt><dd>{formatDate(user.createdAt)}</dd></div><div><dt>Cập nhật gần nhất</dt><dd>{formatDate(user.updatedAt)}</dd></div></dl></section>
          <RoleProfile user={user} />
        </div>

        <aside className="admin-user-account-panel">
          <span>Trạng thái tài khoản</span><strong className={user.isActive ? 'is-active' : 'is-inactive'}>{user.isActive ? 'Đang hoạt động' : 'Đã khóa'}</strong><p>{user.isActive ? 'Người dùng có thể đăng nhập và sử dụng các chức năng theo vai trò.' : 'Người dùng không thể đăng nhập hoặc truy cập các API được bảo vệ.'}</p>
          {isSelf && <div>Đây là tài khoản Admin đang đăng nhập. Bạn không thể tự khóa tài khoản này.</div>}
          {user.role === 'ADMIN' && !isSelf && <div>Tài khoản quản trị được bảo vệ và không thể khóa từ chức năng này.</div>}
          {user.role === 'SELLER' && <small>Trạng thái tài khoản, Seller và gian hàng là ba trạng thái độc lập.</small>}
        </aside>
      </div>

      {isConfirmOpen && (
        <div className="admin-user-modal-backdrop" role="presentation">
          <section className="admin-user-modal" role="dialog" aria-modal="true" aria-labelledby="user-status-title">
            <span aria-hidden="true">!</span><h2 id="user-status-title">{user.isActive ? 'Khóa tài khoản?' : 'Mở khóa tài khoản?'}</h2>
            <p>{user.isActive ? 'Người dùng sẽ không thể tiếp tục sử dụng các chức năng yêu cầu đăng nhập.' : 'Người dùng sẽ có thể đăng nhập và sử dụng lại tài khoản.'}</p>
            {user.role === 'SELLER' && user.isActive && <div className="admin-user-modal-note">Gian hàng phải ngừng hoạt động và mọi đơn đang xử lý phải hoàn tất hoặc bị hủy trước khi khóa.</div>}
            {actionError && <div className="admin-user-action-error" role="alert">{actionError}</div>}
            <div><button type="button" disabled={isUpdating} onClick={() => setIsConfirmOpen(false)}>Quay lại</button><button className={user.isActive ? 'is-danger' : 'is-primary'} type="button" disabled={isUpdating} onClick={() => void handleStatusChange()}>{isUpdating ? 'Đang xử lý...' : user.isActive ? 'Xác nhận khóa' : 'Xác nhận mở khóa'}</button></div>
          </section>
        </div>
      )}
    </main>
  );
}

function RoleProfile({ user }: { user: AdminUserDetail }) {
  if (user.role === 'CUSTOMER') return <section className="admin-user-detail-card"><header><span>02</span><div><h2>Hồ sơ khách hàng</h2><p>Thông tin riêng của vai trò Customer</p></div></header>{user.profile ? <dl><div><dt>Customer ID</dt><dd>#{user.profile.customerId}</dd></div><div><dt>Địa chỉ giao hàng</dt><dd>{user.profile.shippingAddress || 'Chưa cập nhật'}</dd></div><div><dt>Ngày tạo hồ sơ</dt><dd>{formatDate(user.profile.createdAt)}</dd></div></dl> : <p className="admin-user-profile-empty">Không tìm thấy hồ sơ Customer.</p>}</section>;
  if (user.role === 'SELLER') return <section className="admin-user-detail-card"><header><span>02</span><div><h2>Hồ sơ người bán</h2><p>Seller và gian hàng được quản lý độc lập</p></div></header>{user.profile ? <><dl><div><dt>Seller ID</dt><dd>#{user.profile.sellerId}</dd></div><div><dt>Trạng thái Seller</dt><dd>{user.profile.status}</dd></div><div><dt>Ngày tạo hồ sơ</dt><dd>{formatDate(user.profile.createdAt)}</dd></div></dl>{user.profile.shop ? <div className="admin-user-shop"><span>Gian hàng</span><h3>{user.profile.shop.name}</h3><p>ID #{user.profile.shop.shopId}</p><strong className={`is-${user.profile.shop.status.toLowerCase()}`}>{SHOP_STATUS_LABELS[user.profile.shop.status]}</strong></div> : <p className="admin-user-profile-empty">Seller chưa đăng ký gian hàng.</p>}</> : <p className="admin-user-profile-empty">Không tìm thấy hồ sơ Seller.</p>}</section>;
  return <section className="admin-user-detail-card"><header><span>02</span><div><h2>Hồ sơ quản trị viên</h2><p>Thông tin riêng của vai trò Admin</p></div></header>{user.profile ? <dl><div><dt>Admin ID</dt><dd>#{user.profile.adminId}</dd></div><div><dt>Ngày tạo hồ sơ</dt><dd>{formatDate(user.profile.createdAt)}</dd></div></dl> : <p className="admin-user-profile-empty">Không tìm thấy hồ sơ Admin.</p>}</section>;
}

function UserDetailError({ message, retry }: { message: string; retry: () => void }) {
  return <div className="admin-user-detail-error"><span aria-hidden="true">!</span><h2>Không thể tải thông tin người dùng</h2><p>{message}</p><button type="button" onClick={retry}>Thử lại</button></div>;
}

function AdminUserDetailSkeleton() {
  return <div className="admin-user-detail-loading" aria-label="Đang tải thông tin người dùng" aria-busy="true"><div><span /><i /><i /></div><section><article /><aside /></section></div>;
}

function roleLabel(role: AdminUserDetail['role']): string {
  return { CUSTOMER: 'Khách hàng', SELLER: 'Người bán', ADMIN: 'Quản trị viên' }[role];
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(value));
}
