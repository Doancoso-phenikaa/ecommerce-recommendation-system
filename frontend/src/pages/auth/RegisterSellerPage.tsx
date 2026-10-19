import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { registerSeller } from '../../api/auth.api';
import { FormField } from '../../components/auth/FormField';
import { PasswordInput } from '../../components/auth/PasswordInput';
import { getApiErrorMessage } from '../../utils/auth';
import './login-page.css';
import './register-customer-page.css';

interface SellerForm {
  fullName: string;
  email: string;
  phone: string;
  password: string;
}

type SellerErrors = Partial<Record<keyof SellerForm, string>>;

export function RegisterSellerPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<SellerForm>({ fullName: '', email: '', phone: '', password: '' });
  const [errors, setErrors] = useState<SellerErrors>({});
  const [apiError, setApiError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
    setApiError('');
  };

  const validate = () => {
    const nextErrors: SellerErrors = {};
    const fullName = form.fullName.trim();
    const email = form.email.trim();
    const phone = form.phone.trim();
    if (!fullName) nextErrors.fullName = 'Vui lòng nhập họ và tên.';
    else if (fullName.length > 100) nextErrors.fullName = 'Họ tên tối đa 100 ký tự.';
    if (!email) nextErrors.email = 'Vui lòng nhập email.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) nextErrors.email = 'Email không đúng định dạng.';
    if (phone.length > 20) nextErrors.phone = 'Số điện thoại tối đa 20 ký tự.';
    if (!form.password) nextErrors.password = 'Vui lòng nhập mật khẩu.';
    else if (form.password.length < 6) nextErrors.password = 'Mật khẩu phải có ít nhất 6 ký tự.';
    else if (form.password.length > 255) nextErrors.password = 'Mật khẩu tối đa 255 ký tự.';
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLoading || !validate()) return;
    setIsLoading(true);
    setApiError('');
    try {
      const phone = form.phone.trim();
      await registerSeller({
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        phone: phone || undefined,
        password: form.password,
      });
      navigate('/login', {
        replace: true,
        state: { success: 'Đăng ký người bán thành công. Hãy đăng nhập để tiếp tục.' },
      });
    } catch (error) {
      setApiError(getApiErrorMessage(error, 'Không thể đăng ký. Vui lòng thử lại.'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="login-page customer-register-page seller-register-page">
      <header className="login-topbar">
        <Link className="login-brand" to="/login" aria-label="MarketNest - Trang đăng nhập">
          <span className="login-brand__mark" aria-hidden="true">M</span>
          <strong>MarketNest</strong>
        </Link>
        <div className="login-topbar__meta" aria-label="Thông tin hỗ trợ">
          <span><i aria-hidden="true">●</i> Tiếng Việt</span>
          <span><i aria-hidden="true">?</i> Hỗ trợ</span>
        </div>
      </header>

      <div className="login-workspace customer-register-workspace">
        <section className="login-card customer-register-card" aria-labelledby="register-seller-title">
          <aside className="login-promo customer-register-promo">
            <div className="customer-register-promo__badge"><span aria-hidden="true">◆</span> ĐỐI TÁC MARKETNEST</div>
            <div className="customer-register-promo__intro">
              <h2>Bắt đầu kinh doanh cùng <em>MarketNest</em></h2>
              <p>Đăng ký tài khoản người bán để xây dựng gian hàng và quản lý hoạt động kinh doanh trên một hệ thống thống nhất.</p>
            </div>

            <div className="customer-register-benefits" aria-label="Công cụ dành cho người bán">
              <article><span aria-hidden="true">◇</span><div><strong>Xây dựng gian hàng</strong><p>Đăng ký và quản lý thông tin gian hàng của riêng bạn.</p></div><small>Shop</small></article>
              <article><span aria-hidden="true">▦</span><div><strong>Quản lý sản phẩm</strong><p>Theo dõi nội dung, kiểm duyệt và tồn kho sản phẩm.</p></div><small>Sản phẩm</small></article>
              <article><span aria-hidden="true">▤</span><div><strong>Xử lý đơn hàng</strong><p>Tiếp nhận và cập nhật đơn hàng thuộc gian hàng của bạn.</p></div><small>Đơn hàng</small></article>
            </div>

            <div className="customer-register-proof">
              <div className="login-social-proof__people" aria-hidden="true"><span>SH</span><span>SP</span><span>DH</span></div>
              <div><strong>Một tài khoản quản lý tập trung</strong><small>Shop, sản phẩm và đơn hàng</small></div>
              <div><span aria-hidden="true">◆ ◆ ◆</span><strong>Kênh người bán</strong></div>
            </div>
          </aside>

          <section className="login-form-panel customer-register-form-panel">
            <div className="login-form-panel__inner customer-register-form-inner">
              <header className="login-heading customer-register-heading">
                <span>Tài khoản người bán</span>
                <h1 id="register-seller-title">Tạo tài khoản Seller</h1>
                <p>Đăng ký tài khoản trước, sau đó bạn có thể tạo gian hàng trong khu vực người bán.</p>
              </header>

              {apiError && <div className="auth-alert auth-alert--error" role="alert">{apiError}</div>}

              <form className="auth-form customer-register-form" onSubmit={handleSubmit} noValidate>
                <FormField label="Họ và tên" htmlFor="fullName" error={errors.fullName}>
                  <input id="fullName" name="fullName" value={form.fullName} onChange={handleChange} autoComplete="name" placeholder="Nguyễn Văn A" aria-invalid={Boolean(errors.fullName)} aria-describedby={errors.fullName ? 'fullName-error' : undefined} required />
                </FormField>
                <FormField label="Email" htmlFor="email" error={errors.email}>
                  <input id="email" name="email" type="email" value={form.email} onChange={handleChange} autoComplete="email" placeholder="seller@example.com" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'email-error' : undefined} required />
                </FormField>
                <div className="form-row customer-register-form-row">
                  <FormField label="Số điện thoại" htmlFor="phone" error={errors.phone} optional>
                    <input id="phone" name="phone" type="tel" value={form.phone} onChange={handleChange} autoComplete="tel" placeholder="09xx xxx xxx" aria-invalid={Boolean(errors.phone)} aria-describedby={errors.phone ? 'phone-error' : undefined} />
                  </FormField>
                  <FormField label="Mật khẩu" htmlFor="password" error={errors.password}>
                    <PasswordInput id="password" name="password" value={form.password} onChange={handleChange} autoComplete="new-password" placeholder="Tối thiểu 6 ký tự" hasError={Boolean(errors.password)} />
                  </FormField>
                </div>
                <button className="auth-submit login-submit customer-register-submit" type="submit" disabled={isLoading}>
                  {isLoading ? 'Đang tạo tài khoản…' : <><span>Tạo tài khoản Seller</span><b aria-hidden="true">→</b></>}
                </button>
              </form>

              <div className="seller-register-links">
                <p className="customer-register-login-link">Đã có tài khoản? <Link to="/login">Đăng nhập ngay</Link></p>
                <p className="customer-register-login-link">Chỉ muốn mua sắm? <Link to="/register">Đăng ký khách hàng</Link></p>
              </div>
            </div>
          </section>
        </section>

        <section className="login-feature-strip" aria-label="Công cụ dành cho người bán">
          <article><span aria-hidden="true">◇</span><div><strong>Gian hàng riêng</strong><small>Quản lý hồ sơ kinh doanh</small></div></article>
          <article><span aria-hidden="true">▦</span><div><strong>Quản lý sản phẩm</strong><small>Nội dung và tồn kho tập trung</small></div></article>
          <article><span aria-hidden="true">▤</span><div><strong>Theo dõi đơn hàng</strong><small>Xử lý đúng quy trình trạng thái</small></div></article>
          <article><span aria-hidden="true">↗</span><div><strong>Thống kê bán hàng</strong><small>Theo dõi hiệu suất gian hàng</small></div></article>
        </section>
      </div>

      <footer className="login-footer">
        <p><span aria-hidden="true">◇</span> © 2026 MarketNest. Nền tảng thương mại điện tử đa người bán.</p>
        <div><span>Điều khoản sử dụng</span><span>Quyền riêng tư</span><span>Tiêu chuẩn an toàn</span><span>Hỗ trợ</span></div>
      </footer>
    </main>
  );
}
