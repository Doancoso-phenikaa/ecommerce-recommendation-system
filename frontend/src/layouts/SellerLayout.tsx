import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import './seller-layout.css';

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
            <span aria-hidden="true">⌂</span>Tổng quan
          </NavLink>
          <NavLink to="/seller/shop" onClick={closeNavigation}>
            <span aria-hidden="true">◇</span>Gian hàng
          </NavLink>
          <NavLink to="/seller/products" onClick={closeNavigation}>
            <span aria-hidden="true">▦</span>Sản phẩm
          </NavLink>
          <NavLink to="/seller/orders" onClick={closeNavigation}>
            <span aria-hidden="true">▤</span>Đơn hàng
          </NavLink>
          <NavLink to="/seller/reviews" onClick={closeNavigation}>
            <span aria-hidden="true">★</span>Đánh giá
          </NavLink>
          <NavLink to="/seller/statistics" onClick={closeNavigation}>
            <span aria-hidden="true">↗</span>Thống kê
          </NavLink>
        </nav>

      </aside>

      {isNavigationOpen && (
        <button className="seller-sidebar-backdrop" type="button" aria-label="Đóng menu" onClick={closeNavigation} />
      )}

      <div className="seller-workspace">
        <header className="seller-topbar">
          <button className="seller-menu-button" type="button" aria-label="Mở menu" aria-expanded={isNavigationOpen} onClick={() => setIsNavigationOpen((current) => !current)}>☰</button>
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
