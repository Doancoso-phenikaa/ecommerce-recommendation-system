import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import './admin-dashboard.css';

export function AdminDashboardPage() {
  const { user } = useAuth();

  return (
    <main className="admin-overview-page">
      <section className="admin-overview-hero">
        <span>Bảng điều khiển quản trị</span>
        <h1>Chào {user?.fullName}, cùng giữ marketplace vận hành an toàn.</h1>
        <p>Kiểm duyệt gian hàng và theo dõi trạng thái vận hành từ một không gian quản trị thống nhất.</p>
      </section>
      <section className="admin-overview-modules">
        <h2>Công cụ đang hoạt động</h2>
        <p>Các phân hệ quản trị sẽ được bổ sung tuần tự.</p>
        <Link className="admin-overview-shop-link" to="/admin/shops">
          <span aria-hidden="true">◇</span>
          <div><strong>Quản lý gian hàng</strong><small>Xem, duyệt, từ chối và điều chỉnh trạng thái gian hàng</small></div>
          <strong aria-hidden="true">→</strong>
        </Link>
      </section>
    </main>
  );
}
