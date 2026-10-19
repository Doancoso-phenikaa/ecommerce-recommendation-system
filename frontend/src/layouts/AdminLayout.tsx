import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import './admin-layout.css';
import '../pages/admin/admin-management-readability.css';
import '../pages/admin/admin-catalog-theme.css';

export function AdminLayout() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const closeNavigation = () => setIsNavigationOpen(false);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="admin-shell">
      <aside className={`admin-sidebar${isNavigationOpen ? ' admin-sidebar--open' : ''}`}>
        <div className="admin-brand">
          <span aria-hidden="true">M</span>
          <div><strong>MarketNest</strong><small>Trung tâm quản trị</small></div>
        </div>

        <nav className="admin-navigation" aria-label="Điều hướng quản trị">
          <NavLink end to="/admin" onClick={closeNavigation}><AdminNavIcon name="dashboard" />Tổng quan</NavLink>
          <NavLink to="/admin/shops" onClick={closeNavigation}><AdminNavIcon name="shop" />Gian hàng</NavLink>
          <NavLink to="/admin/categories" onClick={closeNavigation}><AdminNavIcon name="category" />Danh mục</NavLink>
          <NavLink to="/admin/products" onClick={closeNavigation}><AdminNavIcon name="product" />Sản phẩm</NavLink>
          <NavLink to="/admin/orders" onClick={closeNavigation}><AdminNavIcon name="order" />Đơn hàng</NavLink>
          <NavLink to="/admin/discounts" onClick={closeNavigation}><AdminNavIcon name="discount" />Mã giảm giá</NavLink>
          <NavLink to="/admin/shipping" onClick={closeNavigation}><AdminNavIcon name="shipping" />Phí vận chuyển</NavLink>
          <NavLink to="/admin/users" onClick={closeNavigation}><AdminNavIcon name="user" />Người dùng</NavLink>
          <NavLink to="/admin/statistics" onClick={closeNavigation}><AdminNavIcon name="statistics" />Thống kê</NavLink>
        </nav>

      </aside>

      {isNavigationOpen && <button className="admin-sidebar-backdrop" type="button" aria-label="Đóng menu" onClick={closeNavigation} />}

      <div className="admin-workspace">
        <header className="admin-topbar">
          <button
            className="admin-menu-button"
            type="button"
            aria-label="Mở menu"
            aria-expanded={isNavigationOpen}
            onClick={() => setIsNavigationOpen((current) => !current)}
          >
            <span /><span /><span />
          </button>
          <div className="admin-topbar-context">
            <strong>Trung tâm quản trị</strong>
            <span>Giám sát hoạt động toàn hệ thống</span>
          </div>
          <div className="admin-topbar-account">
            <AdminAccountAvatar
              key={`top-${user?.avatarUrl ?? 'fallback'}`}
              avatarUrl={user?.avatarUrl ?? null}
              fullName={user?.fullName ?? ''}
            />
            <span><small>Quản trị viên</small><strong>{user?.fullName}</strong></span>
          </div>
          <button className="admin-logout" type="button" onClick={handleLogout}>Đăng xuất</button>
        </header>
        <Outlet />
      </div>
    </div>
  );
}

type AdminNavIconName = 'dashboard' | 'shop' | 'category' | 'product' | 'order' | 'discount' | 'shipping' | 'user' | 'statistics';

function AdminNavIcon({ name }: { name: AdminNavIconName }) {
  if (name === 'shop') return <span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 10h16M5 10l1-6h12l1 6v10H5V10Z" /><path d="M9 20v-6h6v6M4 10a3 3 0 0 0 5 0 3 3 0 0 0 6 0 3 3 0 0 0 5 0" /></svg></span>;
  if (name === 'category') return <span aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></svg></span>;
  if (name === 'product') return <span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /></svg></span>;
  if (name === 'order') return <span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 3h12l1 18H5L6 3Z" /><path d="M9 8a3 3 0 0 0 6 0" /></svg></span>;
  if (name === 'discount') return <span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 7a3 3 0 0 0 3-3h10a3 3 0 0 0 3 3v10a3 3 0 0 0-3 3H7a3 3 0 0 0-3-3V7Z" /><path d="m9 15 6-6M9 9h.01M15 15h.01" /></svg></span>;
  if (name === 'shipping') return <span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z" /><circle cx="7" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></svg></span>;
  if (name === 'user') return <span aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg></span>;
  if (name === 'statistics') return <span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 20V10M12 20V4M19 20v-7" /></svg></span>;
  return <span aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></svg></span>;
}

function AdminAccountAvatar({
  avatarUrl,
  fullName,
}: {
  avatarUrl: string | null;
  fullName: string;
}) {
  const [hasImageError, setHasImageError] = useState(false);
  const initial = fullName.trim().charAt(0).toLocaleUpperCase('vi') || 'M';

  if (!avatarUrl || hasImageError) {
    return <span className="admin-account-avatar" aria-hidden="true">{initial}</span>;
  }

  return (
    <img
      className="admin-account-avatar"
      src={avatarUrl}
      alt=""
      onError={() => setHasImageError(true)}
    />
  );
}
