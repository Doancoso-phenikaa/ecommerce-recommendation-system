import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { login as loginRequest } from '../../api/auth.api';
import { FormField } from '../../components/auth/FormField';
import { PasswordInput } from '../../components/auth/PasswordInput';
import { useAuth } from '../../hooks/useAuth';
import { getApiErrorMessage, getRoleHomePath } from '../../utils/auth';
import './login-page.css';

interface LoginForm {
  email: string;
  password: string;
}

type LoginErrors = Partial<Record<keyof LoginForm, string>>;

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [form, setForm] = useState<LoginForm>({ email: '', password: '' });
  const [errors, setErrors] = useState<LoginErrors>({});
  const [apiError, setApiError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const successMessage = (location.state as { success?: string } | null)?.success;

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
    setApiError('');
  };

  const validate = () => {
    const nextErrors: LoginErrors = {};
    const email = form.email.trim();

    if (!email) {
      nextErrors.email = 'Vui lòng nhập email.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      nextErrors.email = 'Email không đúng định dạng.';
    }

    if (!form.password) {
      nextErrors.password = 'Vui lòng nhập mật khẩu.';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLoading || !validate()) return;

    setIsLoading(true);
    setApiError('');

    try {
      const response = await loginRequest({
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });
      login(response);
      navigate(getRoleHomePath(response.user.role), { replace: true });
    } catch (error) {
      setApiError(getApiErrorMessage(error, 'Không thể đăng nhập. Vui lòng thử lại.'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="login-page">
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

      <div className="login-workspace">
        <section className="login-card" aria-labelledby="login-title">
          <aside className="login-promo">
            <div className="login-promo__badge"><span aria-hidden="true">◆</span> MARKETNEST SELECT</div>
            <div className="login-promo__intro">
              <h2>Chào mừng trở lại với MarketNest</h2>
              <p>Khám phá hàng nghìn sản phẩm từ các gian hàng uy tín, trong một trải nghiệm mua sắm an toàn và thuận tiện.</p>
            </div>

            <div className="login-benefits" aria-label="Quyền lợi tại MarketNest">
              <article><span aria-hidden="true">▣</span><div><strong>Giao hàng thuận tiện</strong><p>Nhiều lựa chọn vận chuyển phù hợp cho từng đơn hàng.</p></div></article>
              <article><span aria-hidden="true">◇</span><div><strong>Ưu đãi toàn sàn</strong><p>Sử dụng mã giảm giá hợp lệ ngay khi xác nhận đơn.</p></div></article>
              <article><span aria-hidden="true">✓</span><div><strong>Mua sắm an tâm</strong><p>Sản phẩm và gian hàng đều được kiểm duyệt trước khi hiển thị.</p></div></article>
            </div>

            <div className="login-social-proof">
              <div className="login-social-proof__people" aria-hidden="true"><span>AN</span><span>MH</span><span>TL</span></div>
              <div><strong>Marketplace đa người bán</strong><small>Kết nối khách hàng và gian hàng</small></div>
              <div className="login-social-proof__rating"><span aria-hidden="true">★</span><strong>4.9/5</strong></div>
            </div>
          </aside>

          <section className="login-form-panel">
            <div className="login-form-panel__inner">
              <header className="login-heading">
                <span>Tài khoản MarketNest</span>
                <h1 id="login-title">Đăng nhập tài khoản</h1>
                <p>Nhập thông tin xác thực để tiếp tục mua sắm hoặc quản lý gian hàng.</p>
              </header>

              {successMessage && <div className="auth-alert auth-alert--success" role="status">{successMessage}</div>}
              {apiError && <div className="auth-alert auth-alert--error" role="alert">{apiError}</div>}

              <form className="auth-form login-form" onSubmit={handleSubmit} noValidate>
                <FormField label="Email" htmlFor="email" error={errors.email}>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={handleChange}
                    autoComplete="email"
                    placeholder="ban@example.com"
                    aria-invalid={Boolean(errors.email)}
                    aria-describedby={errors.email ? 'email-error' : undefined}
                    required
                  />
                </FormField>

                <FormField label="Mật khẩu" htmlFor="password" error={errors.password}>
                  <PasswordInput
                    id="password"
                    name="password"
                    value={form.password}
                    onChange={handleChange}
                    autoComplete="current-password"
                    placeholder="Nhập mật khẩu"
                    hasError={Boolean(errors.password)}
                  />
                </FormField>

                <button className="auth-submit login-submit" type="submit" disabled={isLoading}>
                  {isLoading ? 'Đang đăng nhập…' : <><span>Đăng nhập ngay</span><b aria-hidden="true">→</b></>}
                </button>
              </form>

              <div className="login-register-options" aria-label="Các lựa chọn đăng ký">
                <Link className="login-register-card login-register-card--customer" to="/register">
                  <span className="login-register-card__icon" aria-hidden="true">◎</span>
                  <div><strong>Khách hàng mới?</strong><small>Tạo tài khoản để bắt đầu mua sắm</small></div>
                  <b>Đăng ký ngay <i aria-hidden="true">→</i></b>
                </Link>
                <Link className="login-register-card login-register-card--seller" to="/register/seller">
                  <span className="login-register-card__icon" aria-hidden="true">▤</span>
                  <div><strong>Bạn là nhà bán hàng?</strong><small>Tiếp cận khách hàng trên MarketNest</small></div>
                  <b>Đăng ký Seller <i aria-hidden="true">→</i></b>
                </Link>
              </div>
            </div>
          </section>
        </section>

        <section className="login-feature-strip" aria-label="Cam kết của MarketNest">
          <article><span aria-hidden="true">♙</span><div><strong>Sản phẩm kiểm duyệt</strong><small>Minh bạch thông tin</small></div></article>
          <article><span aria-hidden="true">ϟ</span><div><strong>Giao hàng linh hoạt</strong><small>Nhiều phương thức lựa chọn</small></div></article>
          <article><span aria-hidden="true">↻</span><div><strong>Mua sắm an toàn</strong><small>Quy trình rõ ràng</small></div></article>
          <article><span aria-hidden="true">◉</span><div><strong>Hỗ trợ tài khoản</strong><small>Dành cho khách và seller</small></div></article>
        </section>
      </div>

      <footer className="login-footer">
        <p><span aria-hidden="true">◇</span> © 2026 MarketNest. Nền tảng thương mại điện tử đa người bán.</p>
        <div><span>Điều khoản sử dụng</span><span>Quyền riêng tư</span><span>Tiêu chuẩn an toàn</span><span>Hỗ trợ</span></div>
      </footer>
    </main>
  );
}
