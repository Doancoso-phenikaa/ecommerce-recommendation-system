import { Link, useLocation } from 'react-router-dom';
import type {
  PaymentMethod,
  PaymentResultState,
  PaymentStatus,
} from '../../types/payment';
import { formatCurrency } from '../../utils/format-currency';
import './payment.css';

const methodLabels: Record<PaymentMethod, string> = {
  COD: 'Thanh toán khi nhận hàng',
  ONLINE: 'Thanh toán trực tuyến',
};

const statusLabels: Record<PaymentStatus, string> = {
  PENDING: 'Chờ thanh toán',
  PAID: 'Đã thanh toán',
  FAILED: 'Thanh toán thất bại',
};

function isPaymentResultState(value: unknown): value is PaymentResultState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<PaymentResultState>;
  const payment = state.payment;
  return Boolean(payment)
    && typeof payment?.paymentId === 'string'
    && typeof payment.orderGroupId === 'string'
    && (payment.paymentMethod === 'COD' || payment.paymentMethod === 'ONLINE')
    && (payment.status === 'PENDING' || payment.status === 'PAID' || payment.status === 'FAILED')
    && typeof payment.amount === 'string'
    && typeof state.orderCount === 'number';
}

function getResultCopy(state: PaymentResultState) {
  const { payment } = state;

  if (payment.status === 'FAILED') {
    return {
      title: 'Thanh toán chưa thành công',
      message: 'Đơn hàng đã được tạo nhưng thanh toán chưa hoàn tất.',
      tone: 'failed',
    } as const;
  }

  if (payment.paymentMethod === 'COD' && payment.status === 'PENDING') {
    return {
      title: 'Đặt hàng thành công',
      message: 'Đơn hàng đã được tạo và sẽ thanh toán khi nhận hàng.',
      tone: 'pending',
    } as const;
  }

  return {
    title: 'Thanh toán thành công',
    message: 'Đơn hàng đã được tạo và thanh toán trực tuyến thành công.',
    tone: 'paid',
  } as const;
}

export function PaymentResultPage() {
  const location = useLocation();
  const state = isPaymentResultState(location.state) ? location.state : null;

  if (!state) {
    return (
      <main className="payment-page payment-page--centered">
        <section className="payment-safe-state">
          <span aria-hidden="true">?</span>
          <h1>Không có thông tin thanh toán</h1>
          <p>Trang này cần được mở sau khi bạn xác nhận phương thức thanh toán.</p>
          <Link to="/">Về trang chủ</Link>
        </section>
      </main>
    );
  }

  const copy = getResultCopy(state);
  const { payment } = state;

  return (
    <main className="payment-page payment-page--centered">
      <section className={`payment-result payment-result--${copy.tone}`}>
        <span className="payment-result__mark" aria-hidden="true">
          {copy.tone === 'failed' ? '!' : '✓'}
        </span>
        <p className="payment-result__eyebrow">Kết quả thanh toán</p>
        <h1>{copy.title}</h1>
        <p>{copy.message}</p>

        <dl>
          <div><dt>Mã nhóm đơn hàng</dt><dd>#{payment.orderGroupId}</dd></div>
          <div><dt>Mã thanh toán</dt><dd>#{payment.paymentId}</dd></div>
          <div><dt>Phương thức</dt><dd>{methodLabels[payment.paymentMethod]}</dd></div>
          <div><dt>Trạng thái</dt><dd className={`payment-status payment-status--${payment.status.toLowerCase()}`}>{statusLabels[payment.status]}</dd></div>
          <div><dt>Số tiền</dt><dd>{formatCurrency(payment.amount)}</dd></div>
        </dl>

        {payment.paymentMethod === 'ONLINE' && (
          <p className="payment-result__simulation">Thanh toán trực tuyến đang được mô phỏng trong phiên bản đồ án.</p>
        )}

        <Link className="payment-result__continue" to="/">Tiếp tục mua sắm</Link>
      </section>
    </main>
  );
}
