import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  approveAdminProduct,
  getAdminProductDetail,
  rejectAdminProduct,
} from '../../api/admin-product.api';
import type { AdminProduct, ProductStatus } from '../../types/product';
import { getApiErrorMessage } from '../../utils/auth';
import { formatCurrency } from '../../utils/format-currency';
import './admin-product.css';

const STATUS_LABELS: Record<ProductStatus, string> = {
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Bị từ chối',
};

function formatDate(value: string | null): string {
  if (!value) return 'Chưa có';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function AdminProductDetailPage() {
  const { productId = '' } = useParams();
  const [product, setProduct] = useState<AdminProduct | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isApproveOpen, setIsApproveOpen] = useState(false);
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectValidation, setRejectValidation] = useState('');

  const loadProductDetail = useCallback(async (showLoading = true) => {
    try {
      setProduct(await getAdminProductDetail(productId));
      setError('');
    } catch (requestError) {
      setError(
        getApiErrorMessage(
          requestError,
          'Không thể tải thông tin sản phẩm.',
        ),
      );
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    let isCurrent = true;
    queueMicrotask(() => {
      if (isCurrent) void loadProductDetail(true);
    });
    return () => {
      isCurrent = false;
    };
  }, [loadProductDetail]);

  useEffect(() => {
    const handleFocus = () => {
      void loadProductDetail(false);
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [loadProductDetail]);

  const handleApprove = async () => {
    setIsApproving(true);
    setActionError('');
    setSuccessMessage('');
    try {
      await approveAdminProduct(productId);
      setIsApproveOpen(false);
      setSuccessMessage('Đã duyệt sản phẩm.');
      await loadProductDetail(false);
    } catch (requestError) {
      setActionError(
        getApiErrorMessage(requestError, 'Không thể duyệt sản phẩm.'),
      );
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    const normalizedReason = rejectionReason.trim();
    if (!normalizedReason) {
      setRejectValidation('Vui lòng nhập lý do từ chối.');
      return;
    }

    setIsRejecting(true);
    setActionError('');
    setSuccessMessage('');
    setRejectValidation('');
    try {
      await rejectAdminProduct(productId, normalizedReason);
      setIsRejectOpen(false);
      setRejectionReason('');
      setSuccessMessage('Đã từ chối sản phẩm.');
      await loadProductDetail(false);
    } catch (requestError) {
      setActionError(
        getApiErrorMessage(requestError, 'Không thể từ chối sản phẩm.'),
      );
    } finally {
      setIsRejecting(false);
    }
  };

  if (isLoading) {
    return <main className="admin-product-detail-page"><div className="admin-product-detail-loading">Đang tải thông tin sản phẩm...</div></main>;
  }

  if (!product) {
    return (
      <main className="admin-product-detail-page">
        <Link className="admin-product-back" to="/admin/products">← Danh sách sản phẩm</Link>
        <div className="admin-product-state is-error"><strong>Không thể tải thông tin sản phẩm.</strong><p>{error}</p><button type="button" onClick={() => { setIsLoading(true); setError(''); void loadProductDetail(true); }}>Thử lại</button></div>
      </main>
    );
  }

  return (
    <main className="admin-product-detail-page">
      <Link className="admin-product-back" to="/admin/products">← Danh sách sản phẩm</Link>
      <header className="admin-product-review-hero">
        <ProductDetailImage src={product.imageUrl} name={product.name} />
        <div><span className={`admin-product-status is-${product.status.toLowerCase()}`}>{STATUS_LABELS[product.status]}</span><h1>{product.name}</h1><p>Sản phẩm #{product.productId} · {product.shop?.name ?? 'Không xác định'}</p><strong>{formatCurrency(product.price)}</strong></div>
        {product.status === 'PENDING' && <div className="admin-product-review-actions"><button className="is-approve" type="button" onClick={() => { setIsApproveOpen(true); setActionError(''); }}>Duyệt sản phẩm</button><button className="is-reject" type="button" onClick={() => { setIsRejectOpen(true); setActionError(''); }}>Từ chối</button></div>}
      </header>

      {successMessage && <div className="admin-product-success" role="status"><span>✓</span>{successMessage}<button type="button" onClick={() => setSuccessMessage('')} aria-label="Đóng thông báo">×</button></div>}
      {error && <div className="admin-product-inline-error" role="alert">{error}</div>}
      {actionError && <div className="admin-product-inline-error" role="alert">{actionError}</div>}

      <div className="admin-product-detail-grid">
        <section className="admin-product-detail-card is-main"><header><span>01</span><div><h2>Thông tin sản phẩm</h2><p>Nội dung do người bán cung cấp</p></div></header><dl><div><dt>Tên sản phẩm</dt><dd>{product.name}</dd></div><div><dt>Mô tả</dt><dd>{product.description || 'Chưa có mô tả'}</dd></div><div><dt>Giá bán</dt><dd>{formatCurrency(product.price)}</dd></div><div><dt>Ngày tạo</dt><dd>{formatDate(product.createdAt)}</dd></div><div><dt>Cập nhật gần nhất</dt><dd>{formatDate(product.updatedAt)}</dd></div></dl></section>

        <div className="admin-product-detail-side">
          <section className="admin-product-detail-card"><header><span>02</span><div><h2>Kiểm duyệt</h2><p>Trạng thái hiển thị sản phẩm</p></div></header><dl><div><dt>Trạng thái</dt><dd><span className={`admin-product-status is-${product.status.toLowerCase()}`}>{STATUS_LABELS[product.status]}</span></dd></div><div><dt>Thời điểm duyệt</dt><dd>{formatDate(product.approvedAt)}</dd></div></dl>{product.rejectionReason && <div className="admin-product-rejection"><strong>Lý do từ chối</strong><p>{product.rejectionReason}</p></div>}</section>
          <section className="admin-product-detail-card"><header><span>03</span><div><h2>Danh mục và gian hàng</h2><p>Điều kiện liên quan khi duyệt</p></div></header><dl><div><dt>Danh mục</dt><dd>{product.category?.name ?? 'Không xác định'}<small>{product.category?.status ?? 'Không có trạng thái'}</small></dd></div><div><dt>Gian hàng</dt><dd>{product.shop?.name ?? 'Không xác định'}<small>{product.shop?.status ?? 'Không có trạng thái'}</small></dd></div></dl></section>
          <section className="admin-product-detail-card"><header><span>04</span><div><h2>Tồn kho</h2><p>Số lượng hiện tại</p></div></header><div className="admin-product-inventory"><div><span>Tổng số lượng</span><strong>{product.inventory?.quantity ?? 0}</strong></div><div><span>Đang giữ chỗ</span><strong>{product.inventory?.reservedQuantity ?? 0}</strong></div><div><span>Có thể bán</span><strong>{product.inventory?.availableQuantity ?? 0}</strong></div></div></section>
        </div>
      </div>

      {isApproveOpen && (
        <div className="admin-product-modal-backdrop"><section className="admin-product-modal" role="dialog" aria-modal="true" aria-labelledby="approve-product-title"><span className="admin-product-modal-icon">✓</span><h2 id="approve-product-title">Duyệt sản phẩm?</h2><p>Backend sẽ kiểm tra lại trạng thái gian hàng, danh mục và sản phẩm trước khi duyệt.</p>{actionError && <div className="admin-product-modal-error">{actionError}</div>}<footer><button type="button" disabled={isApproving} onClick={() => setIsApproveOpen(false)}>Quay lại</button><button className="is-primary" type="button" disabled={isApproving} onClick={() => void handleApprove()}>{isApproving ? 'Đang xử lý...' : 'Duyệt sản phẩm'}</button></footer></section></div>
      )}

      {isRejectOpen && (
        <div className="admin-product-modal-backdrop"><section className="admin-product-modal" role="dialog" aria-modal="true" aria-labelledby="reject-product-title"><h2 id="reject-product-title">Từ chối sản phẩm</h2><p>Lý do sẽ được gửi tới người bán để họ chỉnh sửa và gửi duyệt lại.</p><label htmlFor="product-rejection-reason">Lý do từ chối</label><textarea id="product-rejection-reason" rows={5} value={rejectionReason} placeholder="Mô tả rõ nội dung cần điều chỉnh..." onChange={(event) => { setRejectionReason(event.target.value); setRejectValidation(''); }} />{rejectValidation && <span className="admin-product-field-error">{rejectValidation}</span>}{actionError && <div className="admin-product-modal-error">{actionError}</div>}<footer><button type="button" disabled={isRejecting} onClick={() => { setIsRejectOpen(false); setRejectValidation(''); }}>Quay lại</button><button className="is-danger" type="button" disabled={isRejecting} onClick={() => void handleReject()}>{isRejecting ? 'Đang xử lý...' : 'Xác nhận từ chối'}</button></footer></section></div>
      )}
    </main>
  );
}

function ProductDetailImage({ src, name }: { src: string | null; name: string }) {
  const [hasError, setHasError] = useState(false);
  if (!src || hasError) return <div className="admin-product-detail-placeholder" aria-hidden="true">▣</div>;
  return <img className="admin-product-detail-image" src={src} alt={name} onError={() => setHasError(true)} />;
}
