import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import './seller-layout.css';

const futureNavigation = ['Sản phẩm', 'Đơn hàng', 'Thống kê'];

export function SellerLayout() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);

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
          <NavLink end to="/seller" onClick={() => setIsNavigationOpen(false)}>
            <span aria-hidden="true">⌂</span>Tổng quan
          </NavLink>
          <NavLink to="/seller/shop" onClick={() => setIsNavigationOpen(false)}>
            <span aria-hidden="true">◇</span>Gian hàng
          </NavLink>
          {futureNavigation.map((item, index) => (
            <span className="seller-navigation__disabled" aria-disabled="true" key={item}>
              <span aria-hidden="true">{index === 0 ? '▦' : index === 1 ? '▤' : '↗'}</span>
              {item}<small>Sắp có</small>
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
        <button
          className="seller-sidebar-backdrop"
          type="button"
          aria-label="Đóng menu"
          onClick={() => setIsNavigationOpen(false)}
        />
      )}

      <div className="seller-workspace">
        <header className="seller-topbar">
          <button
            className="seller-menu-button"
            type="button"
            aria-label="Mở menu"
            aria-expanded={isNavigationOpen}
            onClick={() => setIsNavigationOpen((current) => !current)}
          >☰</button>
          <div><span>Kênh người bán</span><strong>{user?.fullName}</strong></div>
          <button className="seller-logout" type="button" onClick={handleLogout}>Đăng xuất</button>
        </header>
        <Outlet />
      </div>
    </div>
  );
}
