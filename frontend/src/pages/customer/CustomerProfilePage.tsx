import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  getCustomerProfile,
  updateCustomerProfile,
} from '../../api/customer-profile.api';
import { useAuth } from '../../hooks/useAuth';
import type { CustomerProfile } from '../../types/customer-profile';
import { getApiErrorMessage } from '../../utils/auth';
import './customer-profile.css';

interface ProfileFormState {
  fullName: string;
  phone: string;
  shippingAddress: string;
  avatarUrl: string;
}

const emptyForm: ProfileFormState = {
  fullName: '',
  phone: '',
  shippingAddress: '',
  avatarUrl: '',
};

export function CustomerProfilePage() {
  const { updateUser } = useAuth();
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [form, setForm] = useState<ProfileFormState>(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAvatarEditorOpen, setIsAvatarEditorOpen] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const applyProfile = useCallback((nextProfile: CustomerProfile) => {
    setProfile(nextProfile);
    setForm(toFormState(nextProfile));
  }, []);

  const loadProfile = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');

    try {
      applyProfile(await getCustomerProfile());
    } catch (error) {
      setLoadError(
        getApiErrorMessage(error, 'Không thể tải thông tin hồ sơ.'),
      );
    } finally {
      setIsLoading(false);
    }
  }, [applyProfile]);

  useEffect(() => {
    let isCurrent = true;

    getCustomerProfile()
      .then((loadedProfile) => {
        if (isCurrent) applyProfile(loadedProfile);
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setLoadError(
            getApiErrorMessage(error, 'Không thể tải thông tin hồ sơ.'),
          );
        }
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [applyProfile]);

  const setField = (field: keyof ProfileFormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFormError('');
    setSuccessMessage('');
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profile || isSaving) return;

    const fullName = form.fullName.trim();
    const phone = form.phone.trim();
    const shippingAddress = form.shippingAddress.trim();
    const avatarUrl = form.avatarUrl.trim();

    if (!fullName) {
      setFormError('Họ và tên không được để trống.');
      return;
    }

    if (fullName.length > 100) {
      setFormError('Họ và tên tối đa 100 ký tự.');
      return;
    }

    if (phone.length > 20) {
      setFormError('Số điện thoại tối đa 20 ký tự.');
      return;
    }

    if (avatarUrl && !isValidWebUrl(avatarUrl)) {
      setFormError('URL ảnh đại diện phải bắt đầu bằng http:// hoặc https://.');
      setIsAvatarEditorOpen(true);
      return;
    }

    setIsSaving(true);
    setFormError('');
    setSuccessMessage('');

    try {
      const updatedProfile = await updateCustomerProfile({
        fullName,
        phone,
        shippingAddress,
        avatarUrl,
      });

      applyProfile(updatedProfile);
      updateUser({
        fullName: updatedProfile.fullName,
        phone: updatedProfile.phone,
        avatarUrl: updatedProfile.avatarUrl,
      });
      setSuccessMessage('Cập nhật hồ sơ thành công.');
    } catch (error) {
      setFormError(getApiErrorMessage(error, 'Không thể cập nhật hồ sơ.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (!profile || isSaving) return;
    setForm(toFormState(profile));
    setFormError('');
    setSuccessMessage('');
    setIsAvatarEditorOpen(false);
  };

  if (isLoading) {
    return <ProfileSkeleton />;
  }

  if (!profile) {
    return (
      <main className="customer-profile-page">
        <section className="customer-profile-load-error" role="alert">
          <span aria-hidden="true">!</span>
          <h1>Không thể mở hồ sơ</h1>
          <p>{loadError || 'Không thể tải thông tin hồ sơ.'}</p>
          <button type="button" onClick={() => void loadProfile()}>
            Thử lại
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="customer-profile-page">
      <section className="customer-profile-card">
        <header className="customer-profile-heading">
          <div>
            <span>Thông tin tài khoản</span>
            <h1>Hồ sơ của tôi</h1>
            <p>Quản lý và cập nhật thông tin hồ sơ của bạn tại MarketNest.</p>
          </div>
          <i aria-hidden="true" />
        </header>

        <form className="customer-profile-form" onSubmit={handleSubmit} noValidate>
          <div className="customer-profile-fields">
            <ProfileField label="Họ và tên" htmlFor="profile-full-name" icon="user">
              <input
                id="profile-full-name"
                value={form.fullName}
                maxLength={100}
                autoComplete="name"
                onChange={(event) => setField('fullName', event.target.value)}
                disabled={isSaving}
              />
            </ProfileField>

            <ProfileField label="Địa chỉ email" htmlFor="profile-email" icon="email" readOnly>
              <input
                id="profile-email"
                value={profile.email}
                type="email"
                readOnly
                aria-readonly="true"
              />
            </ProfileField>

            <ProfileField label="Số điện thoại liên lạc" htmlFor="profile-phone" icon="phone">
              <input
                id="profile-phone"
                value={form.phone}
                maxLength={20}
                type="tel"
                autoComplete="tel"
                placeholder="Nhập số điện thoại"
                onChange={(event) => setField('phone', event.target.value)}
                disabled={isSaving}
              />
            </ProfileField>

            <ProfileField label="Địa chỉ" htmlFor="profile-address" icon="location">
              <textarea
                id="profile-address"
                value={form.shippingAddress}
                rows={2}
                autoComplete="street-address"
                placeholder="Nhập địa chỉ giao hàng mặc định"
                onChange={(event) =>
                  setField('shippingAddress', event.target.value)
                }
                disabled={isSaving}
              />
            </ProfileField>

            {formError && (
              <p className="customer-profile-message is-error" role="alert">
                {formError}
              </p>
            )}
            {successMessage && (
              <p className="customer-profile-message is-success" role="status">
                {successMessage}
              </p>
            )}

            <div className="customer-profile-actions">
              <button className="customer-profile-save" type="submit" disabled={isSaving}>
                {isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
              <button type="button" onClick={handleCancel} disabled={isSaving}>
                Hủy bỏ
              </button>
            </div>
          </div>

          <aside className="customer-profile-summary" aria-label="Ảnh đại diện">
            <div className="customer-profile-avatar-wrap">
              <ProfileAvatar
                key={form.avatarUrl}
                avatarUrl={form.avatarUrl}
                fullName={form.fullName}
              />
              <button
                className="customer-profile-avatar-edit"
                type="button"
                aria-label="Chỉnh sửa URL ảnh đại diện"
                aria-expanded={isAvatarEditorOpen}
                onClick={() => setIsAvatarEditorOpen((current) => !current)}
                disabled={isSaving}
              >
                <PencilIcon />
              </button>
            </div>
            <strong>{form.fullName.trim() || profile.fullName}</strong>
            <small>Khách hàng MarketNest</small>

            {isAvatarEditorOpen && (
              <label className="customer-profile-avatar-url">
                <span>URL ảnh đại diện</span>
                <input
                  type="url"
                  value={form.avatarUrl}
                  maxLength={2048}
                  placeholder="https://example.com/avatar.jpg"
                  onChange={(event) => setField('avatarUrl', event.target.value)}
                  disabled={isSaving}
                  autoFocus
                />
                <small>Để trống nếu bạn muốn xóa ảnh hiện tại.</small>
              </label>
            )}
          </aside>
        </form>
      </section>
    </main>
  );
}

function ProfileField({
  label,
  htmlFor,
  icon,
  readOnly = false,
  children,
}: {
  label: string;
  htmlFor: string;
  icon: ProfileIconName;
  readOnly?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={`customer-profile-field${readOnly ? ' is-readonly' : ''}`} htmlFor={htmlFor}>
      <span>{label}</span>
      <div>
        <ProfileIcon name={icon} />
        {children}
        {readOnly && <small>Chỉ đọc</small>}
      </div>
    </label>
  );
}

function ProfileAvatar({ avatarUrl, fullName }: { avatarUrl: string; fullName: string }) {
  const [hasError, setHasError] = useState(false);
  const initial = fullName.trim().charAt(0).toLocaleUpperCase('vi') || 'M';

  if (!avatarUrl.trim() || hasError) {
    return <span className="customer-profile-avatar-fallback" aria-hidden="true">{initial}</span>;
  }

  return (
    <img
      key={avatarUrl}
      src={avatarUrl}
      alt={`Ảnh đại diện của ${fullName.trim() || 'khách hàng'}`}
      onError={() => setHasError(true)}
    />
  );
}

function ProfileSkeleton() {
  return (
    <main className="customer-profile-page" aria-label="Đang tải hồ sơ">
      <section className="customer-profile-skeleton" aria-hidden="true">
        <header><i /><i /><i /></header>
        <div>
          <article>{Array.from({ length: 4 }, (_, index) => <span key={index} />)}</article>
          <aside><i /><i /></aside>
        </div>
      </section>
    </main>
  );
}

type ProfileIconName = 'user' | 'email' | 'phone' | 'location';

function ProfileIcon({ name }: { name: ProfileIconName }) {
  const paths: Record<ProfileIconName, ReactNode> = {
    user: <><circle cx="12" cy="8" r="3" /><path d="M5.5 19c.5-4 2.7-6 6.5-6s6 2 6.5 6" /></>,
    email: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></>,
    phone: <><rect x="7" y="2.5" width="10" height="19" rx="2" /><path d="M10.5 18.5h3" /></>,
    location: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
  };

  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m4 20 4.2-1 10.6-10.6a2 2 0 0 0 0-2.8l-.4-.4a2 2 0 0 0-2.8 0L5 15.8 4 20Z" />
      <path d="m14.5 6.5 3 3" />
    </svg>
  );
}

function toFormState(profile: CustomerProfile): ProfileFormState {
  return {
    fullName: profile.fullName,
    phone: profile.phone ?? '',
    shippingAddress: profile.shippingAddress ?? '',
    avatarUrl: profile.avatarUrl ?? '',
  };
}

function isValidWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
