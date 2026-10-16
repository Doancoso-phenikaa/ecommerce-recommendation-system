import { useState } from 'react';
import type { Category } from '../../types/category';
import './category-section.css';
import './category-section-images.css';

interface CategorySectionProps {
  categories: Category[];
  selectedCategoryId: string | null;
  onSelect: (categoryId: string | null) => void;
  isLoading?: boolean;
  error?: string;
}

export function CategorySection({ categories, selectedCategoryId, onSelect, isLoading = false, error = '' }: CategorySectionProps) {
  return (
    <section className="category-section" aria-labelledby="category-title">
      <div className="market-section-heading">
        <h2 id="category-title">Danh mục</h2>
        {selectedCategoryId && <button type="button" onClick={() => onSelect(null)}>Xem tất cả</button>}
      </div>
      {isLoading ? (
        <div className="category-strip category-strip--loading" aria-label="Đang tải danh mục" aria-busy="true">
          {Array.from({ length: 8 }, (_, index) => <span key={index} />)}
        </div>
      ) : error ? (
        <div className="category-section__message" role="status">{error}</div>
      ) : categories.length === 0 ? (
        <div className="category-section__message">Hiện chưa có danh mục đang hoạt động.</div>
      ) : (
      <div className="category-strip">
        {categories.map((category) => {
          const isSelected = category.categoryId === selectedCategoryId;
          return (
            <button
              type="button"
              className={isSelected ? 'category-item category-item--selected' : 'category-item'}
              key={category.categoryId}
              onClick={() => onSelect(isSelected ? null : category.categoryId)}
              aria-pressed={isSelected}
            >
              <CategoryImage key={category.imageUrl ?? 'placeholder'} imageUrl={category.imageUrl} name={category.name} />
              <strong>{category.name}</strong>
            </button>
          );
        })}
      </div>
      )}
    </section>
  );
}

function CategoryImage({ imageUrl, name }: { imageUrl: string | null; name: string }) {
  const [hasError, setHasError] = useState(false);

  if (!imageUrl || hasError) {
    return <span className="category-item__image category-item__image--placeholder" aria-hidden="true">{name.trim().charAt(0).toLocaleUpperCase('vi') || '◇'}</span>;
  }

  return <img className="category-item__image" src={imageUrl} alt="" onError={() => setHasError(true)} />;
}
