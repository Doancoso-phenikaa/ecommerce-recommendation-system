import { useState, type ChangeEvent } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { CustomerFooter } from '../components/customer/CustomerFooter';
import { useAuth } from '../hooks/useAuth';
import './customer-layout.css';

export function CustomerLayout() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  return (
    <div className="customer-shell">
      <header className="customer-header">
        <div className="customer-header__inner">
          <Link className="customer-brand" to="/" aria-label="MarketNest trang chủ">
            <span aria-hidden="true">M</span>
            <strong>MarketNest</strong>
          </Link>

          <label className="customer-search">
            <span className="customer-search__label">Tìm kiếm sản phẩm</span>
            <input type="search" value={searchTerm} onChange={handleSearchChange} placeholder="Tìm sản phẩm, thương hiệu hoặc danh mục" />
            <button type="button" aria-label="Tìm kiếm"><span aria-hidden="true">⌕</span></button>
          </label>

          <div className="customer-actions">
            <Link className="customer-action" to="/wishlist" aria-label="Danh sách yêu thích" data-count="">
              <span aria-hidden="true">♡</span><small>Yêu thích</small>
            </Link>
            <Link className="customer-action" to="/cart" aria-label="Giỏ hàng" data-count="">
              <span aria-hidden="true">▢</span><small>Giỏ hàng</small>
            </Link>
            <div className="customer-account__identity">
              <span>Xin chào</span>
              <strong>{user?.fullName}</strong>
            </div>
            <button className="customer-logout" type="button" onClick={handleLogout}>Đăng xuất</button>
          </div>
        </div>
      </header>
      <Outlet context={{ searchTerm, setSearchTerm }} />
      <CustomerFooter />
    </div>
  );
}
