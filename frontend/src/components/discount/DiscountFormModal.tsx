import { useState, type FormEvent } from 'react';
import type {
  CreateDiscountRequest,
  Discount,
  DiscountType,
  UpdateDiscountRequest,
} from '../../types/discount';

type DiscountFormPayload = CreateDiscountRequest | UpdateDiscountRequest;

interface DiscountFormModalProps {
  discount: Discount | null;
  isSubmitting: boolean;
  serverError: string;
  onClose: () => void;
  onSubmit: (payload: DiscountFormPayload) => Promise<void>;
}

function toLocalDateTime(value: string): string {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function DiscountFormModal({
  discount,
  isSubmitting,
  serverError,
  onClose,
  onSubmit,
}: DiscountFormModalProps) {
  const [code, setCode] = useState(discount?.code ?? '');
  const [type, setType] = useState<DiscountType>(discount?.type ?? 'PERCENT');
  const [value, setValue] = useState(discount?.value ?? '');
  const [minOrderAmount, setMinOrderAmount] = useState(discount?.minOrderAmount ?? '0');
  const [startDate, setStartDate] = useState(discount ? toLocalDateTime(discount.startDate) : '');
  const [endDate, setEndDate] = useState(discount ? toLocalDateTime(discount.endDate) : '');
  const [hasUsageLimit, setHasUsageLimit] = useState(discount?.usageLimit != null);
  const [usageLimit, setUsageLimit] = useState(discount?.usageLimit?.toString() ?? '');
  const [validationError, setValidationError] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedCode = code.trim().toUpperCase();
    const numericValue = Number(value);
    const numericMinimum = Number(minOrderAmount || '0');
    const numericUsageLimit = Number(usageLimit);
    const startsAt = new Date(startDate);
    const endsAt = new Date(endDate);

    if (!normalizedCode) return setValidationError('Mã giảm giá không được để trống.');
    if (normalizedCode.length > 50) return setValidationError('Mã giảm giá không được vượt quá 50 ký tự.');
    if (!Number.isFinite(numericValue) || numericValue <= 0) return setValidationError('Giá trị giảm phải lớn hơn 0.');
    if (type === 'PERCENT' && numericValue > 100) return setValidationError('Phần trăm giảm không được vượt quá 100%.');
    if (!Number.isFinite(numericMinimum) || numericMinimum < 0) return setValidationError('Đơn hàng tối thiểu không được âm.');
    if (!startDate || !endDate || Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) return setValidationError('Vui lòng nhập thời gian bắt đầu và kết thúc hợp lệ.');
    if (endsAt <= startsAt) return setValidationError('Thời gian kết thúc phải sau thời gian bắt đầu.');
    if (hasUsageLimit && (!Number.isInteger(numericUsageLimit) || numericUsageLimit <= 0)) return setValidationError('Giới hạn lượt dùng phải là số nguyên lớn hơn 0.');
    if (discount && hasUsageLimit && numericUsageLimit < discount.usedCount) return setValidationError(`Giới hạn lượt dùng không thể nhỏ hơn ${discount.usedCount} lượt đã sử dụng.`);

    setValidationError('');
    await onSubmit({
      code: normalizedCode,
      type,
      value: value.trim(),
      minOrderAmount: minOrderAmount.trim() || '0',
      startDate: startsAt.toISOString(),
      endDate: endsAt.toISOString(),
      usageLimit: hasUsageLimit ? numericUsageLimit : discount ? null : undefined,
    });
  };

  return (
    <div className="admin-discount-modal-backdrop" role="presentation">
      <section className="admin-discount-modal" role="dialog" aria-modal="true" aria-labelledby="discount-form-title">
        <header>
          <div><span>{discount ? `#${discount.discountId}` : 'Voucher mới'}</span><h2 id="discount-form-title">{discount ? 'Chỉnh sửa mã giảm giá' : 'Tạo mã giảm giá'}</h2></div>
          <button type="button" aria-label="Đóng" disabled={isSubmitting} onClick={onClose}>×</button>
        </header>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <div className="admin-discount-form-grid">
            <label className="admin-discount-field admin-discount-field--wide">
              <span>Mã giảm giá *</span>
              <input value={code} maxLength={50} autoFocus placeholder="Ví dụ: SALE10" onChange={(event) => { setCode(event.target.value.toUpperCase()); setValidationError(''); }} />
              <small>Mã sẽ được chuẩn hóa thành chữ in hoa.</small>
            </label>
            <label className="admin-discount-field">
              <span>Loại giảm *</span>
              <select value={type} onChange={(event) => setType(event.target.value as DiscountType)}><option value="PERCENT">Theo phần trăm</option><option value="FIXED">Số tiền cố định</option></select>
            </label>
            <label className="admin-discount-field">
              <span>{type === 'PERCENT' ? 'Phần trăm giảm *' : 'Số tiền giảm *'}</span>
              <input type="number" min="0.01" max={type === 'PERCENT' ? 100 : undefined} step="0.01" value={value} onChange={(event) => setValue(event.target.value)} />
            </label>
            <label className="admin-discount-field admin-discount-field--wide">
              <span>Giá trị đơn hàng tối thiểu</span>
              <input type="number" min="0" step="0.01" value={minOrderAmount} onChange={(event) => setMinOrderAmount(event.target.value)} />
            </label>
            <label className="admin-discount-field"><span>Bắt đầu *</span><input type="datetime-local" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
            <label className="admin-discount-field"><span>Kết thúc *</span><input type="datetime-local" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
          </div>
          <label className="admin-discount-limit-toggle"><input type="checkbox" checked={hasUsageLimit} onChange={(event) => setHasUsageLimit(event.target.checked)} /><span>Giới hạn số lượt sử dụng</span></label>
          {hasUsageLimit && <label className="admin-discount-field"><span>Số lượt tối đa *</span><input type="number" min="1" step="1" value={usageLimit} onChange={(event) => setUsageLimit(event.target.value)} />{discount && <small>Đã sử dụng {discount.usedCount} lượt.</small>}</label>}
          {(validationError || serverError) && <div className="admin-discount-form-error" role="alert">{validationError || serverError}</div>}
          <footer><button type="button" disabled={isSubmitting} onClick={onClose}>Hủy</button><button className="is-primary" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Đang lưu...' : discount ? 'Lưu thay đổi' : 'Tạo mã giảm giá'}</button></footer>
        </form>
      </section>
    </div>
  );
}
