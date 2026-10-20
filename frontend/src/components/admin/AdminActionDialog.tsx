import { useEffect, type ReactNode } from 'react';
import './admin-action-dialog.css';

interface AdminActionDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  isLoading?: boolean;
  tone?: 'primary' | 'danger' | 'warning';
  children?: ReactNode;
  onClose: () => void;
  onConfirm: () => void;
}

export function AdminActionDialog({
  open,
  title,
  description,
  confirmLabel,
  isLoading = false,
  tone = 'primary',
  children,
  onClose,
  onConfirm,
}: AdminActionDialogProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isLoading) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLoading, onClose, open]);

  if (!open) return null;

  return (
    <div
      className="admin-action-dialog-backdrop"
      role="presentation"
      onMouseDown={() => {
        if (!isLoading) onClose();
      }}
    >
      <section
        className={`admin-action-dialog is-${tone}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-action-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <span className="admin-action-dialog__icon" aria-hidden="true">
            {tone === 'primary' ? '✓' : '!'}
          </span>
          <button type="button" disabled={isLoading} onClick={onClose} aria-label="Đóng cửa sổ">×</button>
        </header>
        <div className="admin-action-dialog__copy">
          <span>Xác nhận thao tác</span>
          <h2 id="admin-action-dialog-title">{title}</h2>
          <p>{description}</p>
        </div>
        {children && <div className="admin-action-dialog__content">{children}</div>}
        <footer>
          <button type="button" disabled={isLoading} onClick={onClose}>Quay lại</button>
          <button className="admin-action-dialog__confirm" type="button" disabled={isLoading} onClick={onConfirm}>
            {isLoading ? 'Đang xử lý...' : confirmLabel}
          </button>
        </footer>
      </section>
    </div>
  );
}
