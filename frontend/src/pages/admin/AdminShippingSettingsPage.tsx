import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  getAdminShippingConfig,
  updateAdminShippingConfig,
} from '../../api/admin-shipping-config.api';
import { getApiErrorMessage } from '../../utils/auth';
import { formatCurrency } from '../../utils/format-currency';
import './admin-shipping-settings.css';

const MONEY_PATTERN = /^\d{1,12}(?:\.\d{1,2})?$/;

export function AdminShippingSettingsPage() {
  const [currentFee, setCurrentFee] = useState('0.00');
  const [feeInput, setFeeInput] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let isCurrent = true;
    void getAdminShippingConfig()
      .then((config) => {
        if (!isCurrent) return;
        setCurrentFee(config.defaultShippingFee);
        setFeeInput(config.defaultShippingFee);
        setUpdatedAt(config.updatedAt);
      })
      .catch((requestError: unknown) => {
        if (isCurrent) {
          setError(
            getApiErrorMessage(
              requestError,
              'Không thể tải cấu hình phí vận chuyển.',
            ),
          );
        }
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedFee = feeInput.trim();

    if (!MONEY_PATTERN.test(normalizedFee)) {
      setError('Phí vận chuyển phải là số không âm, tối đa 2 chữ số thập phân.');
      return;
    }

    setIsSaving(true);
    setError('');
    setSuccess('');

    try {
      const config = await updateAdminShippingConfig({
        defaultShippingFee: normalizedFee,
      });
      setCurrentFee(config.defaultShippingFee);
      setFeeInput(config.defaultShippingFee);
      setUpdatedAt(config.updatedAt);
      setSuccess('Đã cập nhật phí vận chuyển mặc định.');
    } catch (requestError: unknown) {
      setError(
        getApiErrorMessage(
          requestError,
          'Không thể cập nhật phí vận chuyển.',
        ),
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="admin-shipping-settings">
      <header>
        <span>CẤU HÌNH HỆ THỐNG</span>
        <h1>Phí vận chuyển</h1>
        <p>Quản lý mức phí vận chuyển mặc định áp dụng một lần cho mỗi nhóm đơn hàng.</p>
      </header>

      <section className="admin-shipping-settings__card">
        <div className="admin-shipping-settings__summary">
          <span>Phí đang áp dụng</span>
          <strong>{isLoading ? '—' : formatCurrency(currentFee)}</strong>
          <small>
            {updatedAt
              ? `Cập nhật gần nhất ${new Intl.DateTimeFormat('vi-VN', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(updatedAt))}`
              : 'Chưa có thông tin cập nhật'}
          </small>
        </div>

        <form onSubmit={(event) => void handleSubmit(event)}>
          <label htmlFor="default-shipping-fee">Phí vận chuyển mặc định</label>
          <div>
            <input
              id="default-shipping-fee"
              value={feeInput}
              onChange={(event) => setFeeInput(event.target.value)}
              inputMode="decimal"
              placeholder="Ví dụ: 30000"
              disabled={isLoading || isSaving}
            />
            <span>VNĐ</span>
          </div>
          <p>Giá trị này được chụp lại tại thời điểm xác nhận đặt hàng và không làm thay đổi đơn cũ.</p>
          {error && <div className="admin-shipping-settings__message is-error" role="alert">{error}</div>}
          {success && <div className="admin-shipping-settings__message is-success" role="status">{success}</div>}
          <button type="submit" disabled={isLoading || isSaving}>
            {isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
          </button>
        </form>
      </section>
    </main>
  );
}
