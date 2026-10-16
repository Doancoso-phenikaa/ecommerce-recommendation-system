import './product-listing.css';

interface ProductPaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  variant?: 'compact' | 'full';
  disabled?: boolean;
}

export function ProductPagination({
  page,
  totalPages,
  onPageChange,
  variant = 'full',
  disabled = false,
}: ProductPaginationProps) {
  const safeTotalPages = Math.max(totalPages, 1);

  return (
    <nav
      className={`listing-pagination listing-pagination--${variant}`}
      aria-label="Phân trang sản phẩm"
    >
      <button
        type="button"
        disabled={disabled || page <= 1}
        onClick={() => onPageChange(page - 1)}
        aria-label="Trang trước"
      >
        <span aria-hidden="true">‹</span>
        {variant === 'full' && 'Trước'}
      </button>
      <span>
        {variant === 'full' && 'Trang '}
        <strong>{page}</strong> / {safeTotalPages}
      </span>
      <button
        type="button"
        disabled={disabled || page >= safeTotalPages}
        onClick={() => onPageChange(page + 1)}
        aria-label="Trang sau"
      >
        {variant === 'full' && 'Sau'}
        <span aria-hidden="true">›</span>
      </button>
    </nav>
  );
}
