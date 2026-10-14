import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { registerCustomer } from '../../api/auth.api';
import { AuthLayout } from '../../components/auth/AuthLayout';
import { FormField } from '../../components/auth/FormField';
import { PasswordInput } from '../../components/auth/PasswordInput';
import { getApiErrorMessage } from '../../utils/auth';

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
    <AuthLayout
      eyebrow="Tài khoản khách hàng"
      title="Bắt đầu mua sắm"
      description="Tạo tài khoản để lưu sản phẩm yêu thích và theo dõi đơn hàng."
      footer={<p>Đã có tài khoản? <Link to="/login">Đăng nhập</Link></p>}
    >
      {apiError && <div className="auth-alert auth-alert--error" role="alert">{apiError}</div>}
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <FormField label="Họ và tên" htmlFor="fullName" error={errors.fullName}>
          <input id="fullName" name="fullName" value={form.fullName} onChange={handleChange} autoComplete="name" placeholder="Nguyễn Văn A" aria-invalid={Boolean(errors.fullName)} aria-describedby={errors.fullName ? 'fullName-error' : undefined} required />
        </FormField>
        <FormField label="Email" htmlFor="email" error={errors.email}>
          <input id="email" name="email" type="email" value={form.email} onChange={handleChange} autoComplete="email" placeholder="ban@example.com" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'email-error' : undefined} required />
        </FormField>
        <div className="form-row">
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
        <button className="auth-submit" type="submit" disabled={isLoading}>{isLoading ? 'Đang tạo tài khoản…' : 'Tạo tài khoản khách hàng'}</button>
      </form>
    </AuthLayout>
  );
}
