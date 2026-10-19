import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { registerCustomer } from '../../api/auth.api';
import { FormField } from '../../components/auth/FormField';
import { PasswordInput } from '../../components/auth/PasswordInput';
import { getApiErrorMessage } from '../../utils/auth';
import './login-page.css';
import './register-customer-page.css';

interface CustomerForm {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  shippingAddress: string;
}

type CustomerErrors = Partial<Record<keyof CustomerForm, string>>;

const initialForm: CustomerForm = {
  fullName: '',
  email: '',
  phone: '',
  password: '',
  shippingAddress: '',
};

export function RegisterCustomerPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState<CustomerErrors>({});
  const [apiError, setApiError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
    setApiError('');
  };

  const validate = () => {
    const nextErrors: CustomerErrors = {};
    const fullName = form.fullName.trim();
    const email = form.email.trim();
    const phone = form.phone.trim();

    if (!fullName) nextErrors.fullName = 'Vui lòng nhập họ và tên.';
    else if (fullName.length > 100) nextErrors.fullName = 'Họ tên tối đa 100 ký tự.';
    if (!email) nextErrors.email = 'Vui lòng nhập email.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      nextErrors.email = 'Email không đúng định dạng.';
    if (phone.length > 20) nextErrors.phone = 'Số điện thoại tối đa 20 ký tự.';
    if (!form.password) nextErrors.password = 'Vui lòng nhập mật khẩu.';
    else if (form.password.length < 6)
      nextErrors.password = 'Mật khẩu phải có ít nhất 6 ký tự.';
    else if (form.password.length > 255)
      nextErrors.password = 'Mật khẩu tối đa 255 ký tự.';

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
      const shippingAddress = form.shippingAddress.trim();
      await registerCustomer({
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        phone: phone || undefined,
        password: form.password,
        shippingAddress: shippingAddress || undefined,
      });
      navigate('/login', {
        replace: true,
        state: { success: 'Đăng ký thành công. Bạn có thể đăng nhập ngay.' },
      });
    } catch (error) {
      setApiError(getApiErrorMessage(error, 'Không thể đăng ký. Vui lòng thử lại.'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="login-page customer-register-page">
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
        <section className="login-card customer-register-card" aria-labelledby="register-customer-title">
          <aside className="login-promo customer-register-promo">
            <div className="customer-register-promo__badge"><span aria-hidden="true">◆</span> THÀNH VIÊN MARKETNEST</div>
            <div className="customer-register-promo__intro">
              <h2>Gia nhập cộng đồng <em>MarketNest</em></h2>
              <p>Tạo tài khoản để khám phá sản phẩm từ nhiều gian hàng và sử dụng các tiện ích mua sắm phù hợp.</p>
            </div>

            <div className="customer-register-benefits" aria-label="Tiện ích dành cho khách hàng">
              <article><span aria-hidden="true">%</span><div><strong>Mã giảm giá</strong><p>Áp dụng ưu đãi hợp lệ trong quá trình thanh toán.</p></div><small>Checkout</small></article>
              <article><span aria-hidden="true">▤</span><div><strong>Theo dõi đơn hàng</strong><p>Xem trạng thái đơn hàng trực tiếp trên hệ thống.</p></div><small>Trực tiếp</small></article>
              <article><span aria-hidden="true">☆</span><div><strong>Đánh giá sản phẩm</strong><p>Chia sẻ trải nghiệm sau khi hoàn thành đơn hàng.</p></div><small>Minh bạch</small></article>
            </div>

            <div className="customer-register-proof">
              <div className="login-social-proof__people" aria-hidden="true"><span>HN</span><span>NT</span><span>QA</span></div>
              <div><strong>Nhiều gian hàng, một tài khoản</strong><small>Mua sắm thuận tiện trên MarketNest</small></div>
              <div><span aria-hidden="true">★ ★ ★ ★ ★</span><strong>Marketplace</strong></div>
            </div>
          </aside>

          <section className="login-form-panel customer-register-form-panel">
            <div className="login-form-panel__inner customer-register-form-inner">
              <header className="login-heading customer-register-heading">
                <span>Tài khoản khách hàng</span>
                <h1 id="register-customer-title">Tạo tài khoản mới</h1>
                <p>Tạo tài khoản để bắt đầu mua sắm trên MarketNest.</p>
              </header>

              {apiError && <div className="auth-alert auth-alert--error" role="alert">{apiError}</div>}

              <form className="auth-form customer-register-form" onSubmit={handleSubmit} noValidate>
                <FormField label="Họ và tên" htmlFor="fullName" error={errors.fullName}>
                  <input id="fullName" name="fullName" value={form.fullName} onChange={handleChange} autoComplete="name" placeholder="Nguyễn Văn A" aria-invalid={Boolean(errors.fullName)} aria-describedby={errors.fullName ? 'fullName-error' : undefined} required />
                </FormField>
                <FormField label="Email" htmlFor="email" error={errors.email}>
                  <input id="email" name="email" type="email" value={form.email} onChange={handleChange} autoComplete="email" placeholder="ban@example.com" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'email-error' : undefined} required />
                </FormField>
                <div className="form-row customer-register-form-row">
                  <FormField label="Số điện thoại" htmlFor="phone" error={errors.phone} optional>
                    <input id="phone" name="phone" type="tel" value={form.phone} onChange={handleChange} autoComplete="tel" placeholder="09xx xxx xxx" aria-invalid={Boolean(errors.phone)} aria-describedby={errors.phone ? 'phone-error' : undefined} />
                  </FormField>
                  <FormField label="Mật khẩu" htmlFor="password" error={errors.password}>
                    <PasswordInput id="password" name="password" value={form.password} onChange={handleChange} autoComplete="new-password" placeholder="Tối thiểu 6 ký tự" hasError={Boolean(errors.password)} />
                  </FormField>
                </div>
                <FormField label="Địa chỉ giao hàng" htmlFor="shippingAddress" optional>
                  <textarea id="shippingAddress" name="shippingAddress" value={form.shippingAddress} onChange={handleChange} autoComplete="street-address" placeholder="Nhập địa chỉ nhận hàng" />
                </FormField>
                <button className="auth-submit login-submit customer-register-submit" type="submit" disabled={isLoading}>
                  {isLoading ? 'Đang tạo tài khoản…' : <><span>Tạo tài khoản ngay</span><b aria-hidden="true">→</b></>}
                </button>
              </form>

              <p className="customer-register-login-link">Đã có tài khoản? <Link to="/login">Đăng nhập ngay</Link></p>
            </div>
          </section>
        </section>

        <section className="login-feature-strip" aria-label="Tiện ích của MarketNest">
          <article><span aria-hidden="true">◇</span><div><strong>Đa dạng sản phẩm</strong><small>Mua sắm từ nhiều gian hàng</small></div></article>
          <article><span aria-hidden="true">%</span><div><strong>Mã giảm giá</strong><small>Áp dụng ưu đãi tại Checkout</small></div></article>
          <article><span aria-hidden="true">↻</span><div><strong>Theo dõi đơn hàng</strong><small>Cập nhật trạng thái trực tiếp</small></div></article>
          <article><span aria-hidden="true">☆</span><div><strong>Đánh giá sản phẩm</strong><small>Chia sẻ trải nghiệm mua sắm</small></div></article>
        </section>
      </div>

      <footer className="login-footer">
        <p><span aria-hidden="true">◇</span> © 2026 MarketNest. Nền tảng thương mại điện tử đa người bán.</p>
        <div><span>Điều khoản sử dụng</span><span>Quyền riêng tư</span><span>Tiêu chuẩn an toàn</span><span>Hỗ trợ</span></div>
      </footer>
    </main>
  );
}
