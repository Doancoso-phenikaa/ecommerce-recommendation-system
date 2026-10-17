import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import './admin-layout.css';

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
          <NavLink end to="/admin" onClick={closeNavigation}><span aria-hidden="true">⌂</span>Tổng quan</NavLink>
          <NavLink to="/admin/shops" onClick={closeNavigation}><span aria-hidden="true">◇</span>Gian hàng</NavLink>
          <NavLink to="/admin/categories" onClick={closeNavigation}><span aria-hidden="true">▦</span>Danh mục</NavLink>
          <NavLink to="/admin/products" onClick={closeNavigation}><span aria-hidden="true">▣</span>Sản phẩm</NavLink>
          <NavLink to="/admin/orders" onClick={closeNavigation}><span aria-hidden="true">▤</span>Đơn hàng</NavLink>
          <NavLink to="/admin/discounts" onClick={closeNavigation}><span aria-hidden="true">%</span>Mã giảm giá</NavLink>
          <NavLink to="/admin/users" onClick={closeNavigation}><span aria-hidden="true">◎</span>Người dùng</NavLink>
          <NavLink to="/admin/statistics" onClick={closeNavigation}><span aria-hidden="true">↗</span>Thống kê</NavLink>
        </nav>
        <div className="admin-sidebar__account">
          <div className="admin-account-avatar" aria-hidden="true">{user?.fullName.charAt(0).toLocaleUpperCase('vi')}</div>
          <div><strong>{user?.fullName}</strong><span>Quản trị viên</span></div>
        </div>
      </aside>
      {isNavigationOpen && <button className="admin-sidebar-backdrop" type="button" aria-label="Đóng menu" onClick={closeNavigation} />}
      <div className="admin-workspace">
        <header className="admin-topbar">
          <button className="admin-menu-button" type="button" aria-label="Mở menu" aria-expanded={isNavigationOpen} onClick={() => setIsNavigationOpen((current) => !current)}>☰</button>
          <div><span>Trung tâm quản trị</span><strong>{user?.fullName}</strong></div>
          <button className="admin-logout" type="button" onClick={handleLogout}>Đăng xuất</button>
        </header>
        <Outlet />
      </div>
    </div>
  );
}
