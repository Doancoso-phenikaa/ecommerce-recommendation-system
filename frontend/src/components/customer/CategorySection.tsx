import type { MockCategory } from '../../mock/categories';
import './category-section.css';

interface CategorySectionProps {
  categories: MockCategory[];
  selectedCategoryId: string | null;
  onSelect: (categoryId: string | null) => void;
}

export function CategorySection({ categories, selectedCategoryId, onSelect }: CategorySectionProps) {
  return (
    <section className="category-section" aria-labelledby="category-title">
      <div className="market-section-heading">
        <h2 id="category-title">Danh mục</h2>
        {selectedCategoryId && <button type="button" onClick={() => onSelect(null)}>Xem tất cả</button>}
      </div>
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
              <span aria-hidden="true">{category.symbol}</span>
              <strong>{category.name}</strong>
            </button>
          );
        })}
      </div>
    </section>
  );
}
