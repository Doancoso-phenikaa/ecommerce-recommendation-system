import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import './dashboard.css';

interface DashboardLayoutProps { roleLabel: string; title: string; description: string; accentLabel: string; }

export function DashboardLayout({ roleLabel, title, description, accentLabel }: DashboardLayoutProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const handleLogout = () => { logout(); navigate('/login', { replace: true }); };
  return <main className="dashboard-page">
    <header className="dashboard-header"><div className="dashboard-brand"><span>M</span><strong>MarketNest</strong></div><div className="dashboard-user"><div><strong>{user?.fullName}</strong><span>{roleLabel}</span></div><button type="button" onClick={handleLogout}>Đăng xuất</button></div></header>
    <section className="dashboard-content"><div className="dashboard-hero"><p>{accentLabel}</p><h1>{title}</h1><span>{description}</span></div><div className="dashboard-placeholder"><div className="dashboard-placeholder__mark" aria-hidden="true">01</div><div><h2>Nền tảng đã sẵn sàng</h2><p>Các tính năng nghiệp vụ sẽ được xây dựng ở bước tiếp theo.</p></div></div></section>
  </main>;
}
