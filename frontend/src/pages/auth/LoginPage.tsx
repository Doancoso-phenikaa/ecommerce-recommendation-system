import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { login as loginRequest } from '../../api/auth.api';
import { AuthLayout } from '../../components/auth/AuthLayout';
import { FormField } from '../../components/auth/FormField';
import { PasswordInput } from '../../components/auth/PasswordInput';
import { useAuth } from '../../hooks/useAuth';
import { getApiErrorMessage, getRoleHomePath } from '../../utils/auth';

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
    <AuthLayout
      eyebrow="Chào mừng trở lại"
      title="Đăng nhập tài khoản"
      description="Tiếp tục hành trình mua sắm hoặc quản lý gian hàng của bạn."
      footer={
        <>
          <p>
            Chưa có tài khoản? <Link to="/register">Đăng ký khách hàng</Link>
          </p>
          <p>
            Muốn kinh doanh? <Link to="/register/seller">Đăng ký người bán</Link>
          </p>
        </>
      }
    >
      {successMessage && (
        <div className="auth-alert auth-alert--success" role="status">
          {successMessage}
        </div>
      )}
      {apiError && (
        <div className="auth-alert auth-alert--error" role="alert">
          {apiError}
        </div>
      )}

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
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

        <button className="auth-submit" type="submit" disabled={isLoading}>
          {isLoading ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
      </form>
    </AuthLayout>
  );
}
