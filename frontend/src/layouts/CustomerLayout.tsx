import { useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { createSearchParams, Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { CustomerFooter } from '../components/customer/CustomerFooter';
import { useAuth } from '../hooks/useAuth';
import './customer-layout.css';

export function CustomerLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const currentSearchKeyword = location.pathname === '/search' ? (new URLSearchParams(location.search).get('q') ?? '').trim() : '';

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const handleSearch = (keyword: string) => {
    navigate({ pathname: '/search', search: createSearchParams({ q: keyword }).toString() });
  };

  return (
    <div className="customer-shell">
      <div className="customer-utility-bar">
        <div><span><HeaderIcon name="store" /> Kênh người bán</span><span><HeaderIcon name="support" /> Hỗ trợ 24/7</span></div>
        <div><span><HeaderIcon name="bell" /> Thông báo</span><span>Tiếng Việt / VND</span></div>
      </div>
      <header className="customer-header">
        <div className="customer-header__inner">
          <Link className="customer-brand" to="/" aria-label="MarketNest trang chủ">
            <span aria-hidden="true"><HeaderIcon name="bag" /></span>
            <div><strong>MarketNest</strong><small>Mua sắm thông minh mỗi ngày</small></div>
          </Link>
          <CustomerSearchForm key={`${location.pathname}:${currentSearchKeyword}`} initialValue={currentSearchKeyword} onSearch={handleSearch} />
          <div className="customer-actions">
            <CustomerAction to="/cart" label="Giỏ hàng" icon="cart" />
            <CustomerAction to="/wishlist" label="Yêu thích" icon="heart" />
            <CustomerAction to="/orders" label="Đơn hàng" icon="order" />
            <Link className="customer-account-link" to="/profile" aria-label="Hồ sơ của tôi">
              <CustomerHeaderAvatar key={user?.avatarUrl ?? 'fallback'} avatarUrl={user?.avatarUrl ?? null} fullName={user?.fullName ?? ''} />
              <span className="customer-account__identity"><span>Tài khoản</span><strong>{user?.fullName}</strong></span>
            </Link>
            <button className="customer-logout" type="button" onClick={handleLogout}>Đăng xuất</button>
          </div>
        </div>
      </header>
      <Outlet />
      <CustomerFooter />
    </div>
  );
}

function CustomerAction({ to, label, icon }: { to: string; label: string; icon: HeaderIconName }) {
  return <Link className="customer-action" to={to} aria-label={label}><span aria-hidden="true"><HeaderIcon name={icon} /></span><small>{label}</small></Link>;
}

function CustomerHeaderAvatar({ avatarUrl, fullName }: { avatarUrl: string | null; fullName: string }) {
  const [hasImageError, setHasImageError] = useState(false);
  const initial = fullName.trim().charAt(0).toLocaleUpperCase('vi') || 'M';
  if (!avatarUrl || hasImageError) return <span className="customer-account-avatar" aria-hidden="true">{initial}</span>;
  return <img className="customer-account-avatar" src={avatarUrl} alt="" onError={() => setHasImageError(true)} />;
}

function CustomerSearchForm({ initialValue, onSearch }: { initialValue: string; onSearch: (keyword: string) => void }) {
  const [searchTerm, setSearchTerm] = useState(initialValue);
  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => setSearchTerm(event.target.value);
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const keyword = searchTerm.trim();
    if (keyword) onSearch(keyword);
  };

  return (
    <form className="customer-search" role="search" onSubmit={handleSubmit}>
      <label className="customer-search__label" htmlFor="customer-product-search">Tìm kiếm sản phẩm</label>
      <span aria-hidden="true"><HeaderIcon name="search" /></span>
      <input id="customer-product-search" type="search" value={searchTerm} onChange={handleSearchChange} placeholder="Tìm kiếm sản phẩm, thương hiệu, danh mục..." />
      <button type="submit"><HeaderIcon name="search" /> Tìm kiếm</button>
    </form>
  );
}

type HeaderIconName = 'store' | 'support' | 'bell' | 'bag' | 'search' | 'cart' | 'heart' | 'order';

function HeaderIcon({ name }: { name: HeaderIconName }): ReactNode {
  if (name === 'search') return <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>;
  if (name === 'cart') return <svg viewBox="0 0 24 24"><path d="M3 4h2l2 11h10l2-8H6" /><circle cx="9" cy="19" r="1" /><circle cx="17" cy="19" r="1" /></svg>;
  if (name === 'heart') return <svg viewBox="0 0 24 24"><path d="M20 8.5c0 5-8 10-8 10s-8-5-8-10a4.5 4.5 0 0 1 8-2.6A4.5 4.5 0 0 1 20 8.5Z" /></svg>;
  if (name === 'order') return <svg viewBox="0 0 24 24"><path d="M7 4h10l2 17H5L7 4Z" /><path d="M9 8a3 3 0 0 0 6 0" /></svg>;
  if (name === 'bag') return <svg viewBox="0 0 24 24"><path d="M5 8h14l1 13H4L5 8Z" /><path d="M9 9V6a3 3 0 0 1 6 0v3" /></svg>;
  if (name === 'bell') return <svg viewBox="0 0 24 24"><path d="M6 17h12l-1.5-2V10a4.5 4.5 0 0 0-9 0v5L6 17Z" /><path d="M10 20h4" /></svg>;
  if (name === 'support') return <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 4.3 1.7c-1.2 1.1-1.8 1.4-1.8 3M12 17h.01" /></svg>;
  return <svg viewBox="0 0 24 24"><path d="M4 10h16M5 10l1-6h12l1 6v10H5V10Z" /></svg>;
}
