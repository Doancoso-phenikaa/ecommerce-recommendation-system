import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import './seller-layout.css';
import '../pages/seller/seller-management-readability.css';

export function SellerLayout() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const closeNavigation = () => setIsNavigationOpen(false);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="seller-shell">
      <aside className={`seller-sidebar${isNavigationOpen ? ' seller-sidebar--open' : ''}`}>
        <div className="seller-brand">
          <span aria-hidden="true">M</span>
          <div><strong>MarketNest</strong><small>Kênh người bán</small></div>
        </div>

        <nav className="seller-navigation" aria-label="Điều hướng người bán">
          <NavLink end to="/seller" onClick={closeNavigation}>
            <SellerNavIcon name="dashboard" />Tổng quan
          </NavLink>
          <NavLink to="/seller/shop" onClick={closeNavigation}>
            <SellerNavIcon name="shop" />Gian hàng
          </NavLink>
          <NavLink to="/seller/products" onClick={closeNavigation}>
            <SellerNavIcon name="product" />Sản phẩm
          </NavLink>
          <NavLink to="/seller/orders" onClick={closeNavigation}>
            <SellerNavIcon name="order" />Đơn hàng
          </NavLink>
          <NavLink to="/seller/reviews" onClick={closeNavigation}>
            <SellerNavIcon name="review" />Đánh giá
          </NavLink>
          <NavLink to="/seller/statistics" onClick={closeNavigation}>
            <SellerNavIcon name="statistics" />Thống kê
          </NavLink>
        </nav>
      </aside>

      {isNavigationOpen && (
        <button className="seller-sidebar-backdrop" type="button" aria-label="Đóng menu" onClick={closeNavigation} />
      )}

      <div className="seller-workspace">
        <header className="seller-topbar">
          <button
            className="seller-menu-button"
            type="button"
            aria-label="Mở menu"
            aria-expanded={isNavigationOpen}
            onClick={() => setIsNavigationOpen((current) => !current)}
          >
            <span /><span /><span />
          </button>
          <div className="seller-topbar-context">
            <strong>Trung tâm người bán</strong>
            <span>Quản lý hoạt động gian hàng</span>
          </div>
          <NavLink className="seller-topbar-profile" to="/seller/profile" aria-label="Hồ sơ cá nhân">
            <SellerAccountAvatar
              key={user?.avatarUrl ?? 'fallback'}
              avatarUrl={user?.avatarUrl ?? null}
              fullName={user?.fullName ?? ''}
            />
            <span className="seller-topbar-profile__identity">
              <span>Kênh người bán</span>
              <strong>{user?.fullName}</strong>
            </span>
          </NavLink>
          <button className="seller-logout" type="button" onClick={handleLogout}>Đăng xuất</button>
        </header>
        <Outlet />
      </div>
    </div>
  );
}

type SellerNavIconName = 'dashboard' | 'shop' | 'product' | 'order' | 'review' | 'statistics';

function SellerNavIcon({ name }: { name: SellerNavIconName }) {
  if (name === 'shop') return <span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 10h16M5 10l1-6h12l1 6v10H5V10Z" /><path d="M9 20v-6h6v6M4 10a3 3 0 0 0 5 0 3 3 0 0 0 6 0 3 3 0 0 0 5 0" /></svg></span>;
  if (name === 'product') return <span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /></svg></span>;
  if (name === 'order') return <span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 3h12l1 18H5L6 3Z" /><path d="M9 8a3 3 0 0 0 6 0" /></svg></span>;
  if (name === 'review') return <span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 5h14v10H9l-4 4V5Z" /><path d="m12 8 .8 1.7 1.9.3-1.4 1.3.3 1.9-1.6-.9-1.6.9.3-1.9L9.3 10l1.9-.3L12 8Z" /></svg></span>;
  if (name === 'statistics') return <span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 20V10M12 20V4M19 20v-7" /></svg></span>;
  return <span aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></svg></span>;
}

function SellerAccountAvatar({
  avatarUrl,
  fullName,
}: {
  avatarUrl: string | null;
  fullName: string;
}) {
  const [hasImageError, setHasImageError] = useState(false);
  const initial = fullName.trim().charAt(0).toLocaleUpperCase('vi') || 'M';

  if (!avatarUrl || hasImageError) {
    return <span className="seller-account-avatar" aria-hidden="true">{initial}</span>;
  }

  return (
    <img
      className="seller-account-avatar"
      src={avatarUrl}
      alt=""
      onError={() => setHasImageError(true)}
    />
  );
}
