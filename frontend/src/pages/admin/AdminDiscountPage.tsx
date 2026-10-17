import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createAdminDiscount,
  getAdminDiscounts,
  updateAdminDiscount,
  updateAdminDiscountStatus,
} from '../../api/admin-discount.api';
import { DiscountFormModal } from '../../components/discount/DiscountFormModal';
import type { CreateDiscountRequest, Discount, DiscountStatus, DiscountType, UpdateDiscountRequest } from '../../types/discount';
import { getApiErrorMessage } from '../../utils/auth';
import { formatCurrency } from '../../utils/format-currency';
import './admin-discount.css';

type FormPayload = CreateDiscountRequest | UpdateDiscountRequest;

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}

function getValidity(discount: Discount) {
  const now = Date.now();
  if (discount.usageLimit != null && discount.usedCount >= discount.usageLimit) return { label: 'Đã hết lượt', modifier: 'exhausted' };
  if (now < new Date(discount.startDate).getTime()) return { label: 'Sắp diễn ra', modifier: 'upcoming' };
  if (now > new Date(discount.endDate).getTime()) return { label: 'Đã hết hạn', modifier: 'expired' };
  if (discount.status === 'INACTIVE') return { label: 'Đã tắt', modifier: 'inactive' };
  return { label: 'Có thể sử dụng', modifier: 'available' };
}

export function AdminDiscountPage() {
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | DiscountStatus>('');
  const [type, setType] = useState<'' | DiscountType>('');
  const [formDiscount, setFormDiscount] = useState<Discount | null | undefined>(undefined);
  const [formError, setFormError] = useState('');
  const [statusTarget, setStatusTarget] = useState<Discount | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const requestId = useRef(0);

  const loadDiscounts = useCallback(async (showLoading = true) => {
    const currentRequest = ++requestId.current;
    if (showLoading) setIsLoading(true);
    setError('');
    try {
      const data = await getAdminDiscounts();
      if (currentRequest === requestId.current) setDiscounts(data);
    } catch (requestError) {
      if (currentRequest === requestId.current) setError(getApiErrorMessage(requestError, 'Không thể tải danh sách mã giảm giá.'));
    } finally {
      if (currentRequest === requestId.current && showLoading) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const currentRequest = ++requestId.current;
    void getAdminDiscounts()
      .then((data) => {
        if (currentRequest === requestId.current) setDiscounts(data);
      })
      .catch((requestError: unknown) => {
        if (currentRequest === requestId.current) {
          setError(getApiErrorMessage(requestError, 'Không thể tải danh sách mã giảm giá.'));
        }
      })
      .finally(() => {
        if (currentRequest === requestId.current) setIsLoading(false);
      });
    const refresh = () => void loadDiscounts(false);
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [loadDiscounts]);

  const summary = useMemo(() => discounts.reduce((result, discount) => ({
    total: result.total + 1,
    active: result.active + Number(discount.status === 'ACTIVE'),
    inactive: result.inactive + Number(discount.status === 'INACTIVE'),
    used: result.used + discount.usedCount,
  }), { total: 0, active: 0, inactive: 0, used: 0 }), [discounts]);

  const filteredDiscounts = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('vi');
    return [...discounts]
      .filter((discount) => (!keyword || discount.code.toLocaleLowerCase('vi').includes(keyword)) && (!status || discount.status === status) && (!type || discount.type === type))
      .sort((a, b) => {
        const dateDifference = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        return dateDifference || (BigInt(b.discountId) > BigInt(a.discountId) ? 1 : -1);
      });
  }, [discounts, search, status, type]);

  const handleFormSubmit = async (payload: FormPayload) => {
    setIsSubmitting(true);
    setFormError('');
    setSuccessMessage('');
    try {
      if (formDiscount) {
        await updateAdminDiscount(formDiscount.discountId, payload as UpdateDiscountRequest);
        setSuccessMessage('Đã cập nhật mã giảm giá.');
      } else {
        await createAdminDiscount(payload as CreateDiscountRequest);
        setSuccessMessage('Đã tạo mã giảm giá mới.');
      }
      setFormDiscount(undefined);
      await loadDiscounts(false);
    } catch (requestError) {
      setFormError(getApiErrorMessage(requestError, 'Không thể lưu mã giảm giá.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusChange = async () => {
    if (!statusTarget) return;
    const nextStatus: DiscountStatus = statusTarget.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    setIsSubmitting(true);
    setFormError('');
    setSuccessMessage('');
    try {
      await updateAdminDiscountStatus(statusTarget.discountId, { status: nextStatus });
      setSuccessMessage(nextStatus === 'ACTIVE' ? 'Đã bật mã giảm giá.' : 'Đã tắt mã giảm giá.');
      setStatusTarget(null);
      await loadDiscounts(false);
    } catch (requestError) {
      setFormError(getApiErrorMessage(requestError, 'Không thể cập nhật trạng thái mã giảm giá.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return <main className="admin-discount-page">
    <header className="admin-discount-heading">
      <div><span>Khuyến mãi toàn sàn</span><h1>Quản lý mã giảm giá</h1><p>Tạo và kiểm soát voucher áp dụng cho đơn hàng trên toàn hệ thống.</p></div>
      <button type="button" onClick={() => { setFormDiscount(null); setFormError(''); }}><span aria-hidden="true">+</span> Tạo mã giảm giá</button>
    </header>
    <section className="admin-discount-metrics" aria-label="Thống kê mã giảm giá">
      <article><span>Tổng mã</span><strong>{summary.total}</strong></article><article><span>Đang bật</span><strong>{summary.active}</strong></article><article><span>Đã tắt</span><strong>{summary.inactive}</strong></article><article><span>Tổng lượt dùng</span><strong>{summary.used.toLocaleString('vi-VN')}</strong></article>
    </section>
    {successMessage && <div className="admin-discount-notice" role="status"><span>✓</span>{successMessage}<button type="button" aria-label="Đóng" onClick={() => setSuccessMessage('')}>×</button></div>}
    <section className="admin-discount-panel">
      <div className="admin-discount-toolbar">
        <label><span>Tìm theo mã</span><input type="search" placeholder="Ví dụ: SALE10" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <label><span>Trạng thái</span><select value={status} onChange={(event) => setStatus(event.target.value as '' | DiscountStatus)}><option value="">Tất cả</option><option value="ACTIVE">Đang bật</option><option value="INACTIVE">Đã tắt</option></select></label>
        <label><span>Loại giảm</span><select value={type} onChange={(event) => setType(event.target.value as '' | DiscountType)}><option value="">Tất cả</option><option value="PERCENT">Phần trăm</option><option value="FIXED">Cố định</option></select></label>
      </div>
      {isLoading ? <div className="admin-discount-skeleton" aria-label="Đang tải">{Array.from({ length: 6 }, (_, index) => <span key={index} />)}</div>
        : error ? <div className="admin-discount-state admin-discount-state--error"><strong>Không thể tải danh sách.</strong><p>{error}</p><button type="button" onClick={() => void loadDiscounts()}>Thử lại</button></div>
        : !filteredDiscounts.length ? <div className="admin-discount-state"><span aria-hidden="true">%</span><strong>Không tìm thấy mã giảm giá.</strong><p>Hãy thay đổi bộ lọc hoặc tạo voucher đầu tiên.</p></div>
        : <div className="admin-discount-table-wrap"><table className="admin-discount-table"><thead><tr><th>Mã giảm giá</th><th>Giá trị</th><th>Đơn tối thiểu</th><th>Thời gian áp dụng</th><th>Lượt dùng</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
          {filteredDiscounts.map((discount) => {
            const validity = getValidity(discount);
            return <tr key={discount.discountId}>
              <td data-label="Mã"><strong className="admin-discount-code">{discount.code}</strong><small>#{discount.discountId} · {discount.type === 'PERCENT' ? 'Phần trăm' : 'Cố định'}</small></td>
              <td data-label="Giá trị"><strong>{discount.type === 'PERCENT' ? `${Number(discount.value).toLocaleString('vi-VN')}%` : formatCurrency(discount.value)}</strong></td>
              <td data-label="Đơn tối thiểu">{Number(discount.minOrderAmount) > 0 ? formatCurrency(discount.minOrderAmount) : 'Không yêu cầu'}</td>
              <td data-label="Thời gian"><span>{formatDateTime(discount.startDate)}</span><span>đến {formatDateTime(discount.endDate)}</span><em className={`discount-validity discount-validity--${validity.modifier}`}>{validity.label}</em></td>
              <td data-label="Lượt dùng"><strong>{discount.usedCount.toLocaleString('vi-VN')}</strong><span> / {discount.usageLimit == null ? 'Không giới hạn' : discount.usageLimit.toLocaleString('vi-VN')}</span>{discount.usageLimit != null && discount.usedCount >= discount.usageLimit && <small className="is-exhausted">Đã dùng hết</small>}</td>
              <td data-label="Trạng thái"><span className={`discount-status discount-status--${discount.status.toLowerCase()}`}>{discount.status === 'ACTIVE' ? 'Đang bật' : 'Đã tắt'}</span></td>
              <td data-label="Thao tác"><div className="admin-discount-actions"><button type="button" onClick={() => { setFormDiscount(discount); setFormError(''); }}>Chỉnh sửa</button><button className={discount.status === 'ACTIVE' ? 'is-danger' : 'is-success'} type="button" onClick={() => { setStatusTarget(discount); setFormError(''); }}>{discount.status === 'ACTIVE' ? 'Tắt mã' : 'Bật mã'}</button></div></td>
            </tr>;
          })}
        </tbody></table></div>}
    </section>
    {formDiscount !== undefined && <DiscountFormModal key={formDiscount?.discountId ?? 'create'} discount={formDiscount} isSubmitting={isSubmitting} serverError={formError} onClose={() => !isSubmitting && setFormDiscount(undefined)} onSubmit={handleFormSubmit} />}
    {statusTarget && <div className="admin-discount-modal-backdrop" role="presentation"><section className="admin-discount-confirm" role="dialog" aria-modal="true" aria-labelledby="discount-status-title"><span aria-hidden="true">!</span><h2 id="discount-status-title">{statusTarget.status === 'ACTIVE' ? 'Tắt mã giảm giá?' : 'Bật mã giảm giá?'}</h2><p>{statusTarget.status === 'ACTIVE' ? `Khách hàng sẽ không thể áp dụng mã “${statusTarget.code}” trong checkout.` : `Mã “${statusTarget.code}” sẽ có thể được áp dụng nếu còn hiệu lực và lượt dùng.`}</p>{formError && <div className="admin-discount-form-error" role="alert">{formError}</div>}<footer><button type="button" disabled={isSubmitting} onClick={() => { setStatusTarget(null); setFormError(''); }}>Quay lại</button><button className={statusTarget.status === 'ACTIVE' ? 'is-danger' : 'is-primary'} type="button" disabled={isSubmitting} onClick={() => void handleStatusChange()}>{isSubmitting ? 'Đang xử lý...' : statusTarget.status === 'ACTIVE' ? 'Xác nhận tắt' : 'Xác nhận bật'}</button></footer></section></div>}
  </main>;
}
