import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import './seller-layout.css';

const futureNavigation = [
  { label: 'Thống kê', icon: '↗' },
];

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
          {futureNavigation.map((item) => (
            <span className="seller-navigation__disabled" aria-disabled="true" key={item.label}>
              <span aria-hidden="true">{item.icon}</span>
              {item.label}<small>Sắp có</small>
            </span>
          ))}
        </nav>

        <div className="seller-sidebar__account">
          <div className="seller-account-avatar" aria-hidden="true">
            {user?.fullName.charAt(0).toLocaleUpperCase('vi')}
          </div>
          <div><strong>{user?.fullName}</strong><span>Tài khoản người bán</span></div>
        </div>
      </aside>

      {isNavigationOpen && (
        <button className="seller-sidebar-backdrop" type="button" aria-label="Đóng menu" onClick={closeNavigation} />
      )}

      <div className="seller-workspace">
        <header className="seller-topbar">
          <button className="seller-menu-button" type="button" aria-label="Mở menu" aria-expanded={isNavigationOpen} onClick={() => setIsNavigationOpen((current) => !current)}>☰</button>
          <div><span>Kênh người bán</span><strong>{user?.fullName}</strong></div>
          <button className="seller-logout" type="button" onClick={handleLogout}>Đăng xuất</button>
        </header>
        <Outlet />
      </div>
    </div>
  );
}
