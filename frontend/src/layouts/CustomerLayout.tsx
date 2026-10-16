import { useState, type ChangeEvent, type FormEvent } from 'react';
import { createSearchParams, Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { CustomerFooter } from '../components/customer/CustomerFooter';
import { useAuth } from '../hooks/useAuth';
import './customer-layout.css';

export function CustomerLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const currentSearchKeyword = location.pathname === '/search'
    ? (new URLSearchParams(location.search).get('q') ?? '').trim()
    : '';

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const handleSearch = (keyword: string) => {
    navigate({ pathname: '/search', search: createSearchParams({ q: keyword }).toString() });
  };

  return (
    <div className="customer-shell">
      <header className="customer-header">
        <div className="customer-header__inner">
          <Link className="customer-brand" to="/" aria-label="MarketNest trang chủ">
            <span aria-hidden="true">M</span>
            <strong>MarketNest</strong>
          </Link>

          <CustomerSearchForm
            key={`${location.pathname}:${currentSearchKeyword}`}
            initialValue={currentSearchKeyword}
            onSearch={handleSearch}
          />

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
      <Outlet />
      <CustomerFooter />
    </div>
  );
}

function CustomerSearchForm({
  initialValue,
  onSearch,
}: {
  initialValue: string;
  onSearch: (keyword: string) => void;
}) {
  const [searchTerm, setSearchTerm] = useState(initialValue);

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const keyword = searchTerm.trim();
    if (!keyword) return;
    onSearch(keyword);
  };

  return (
    <form className="customer-search" role="search" onSubmit={handleSubmit}>
      <label className="customer-search__label" htmlFor="customer-product-search">Tìm kiếm sản phẩm</label>
      <input
        id="customer-product-search"
        type="search"
        value={searchTerm}
        onChange={handleSearchChange}
        placeholder="Tìm sản phẩm, thương hiệu hoặc danh mục"
      />
      <button type="submit" aria-label="Tìm kiếm"><span aria-hidden="true">⌕</span></button>
    </form>
  );
}
