import { useEffect, useState } from 'react';
import type { MockBanner } from '../../mock/banners';
import './banner-carousel.css';

interface BannerCarouselProps {
  banners: MockBanner[];
}

export function BannerCarousel({ banners }: BannerCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (isPaused || banners.length < 2) return undefined;

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % banners.length);
    }, 4500);

    return () => window.clearInterval(timer);
  }, [banners.length, isPaused, activeIndex]);

  const showPrevious = () => {
    setActiveIndex((current) => (current - 1 + banners.length) % banners.length);
  };

  const showNext = () => {
    setActiveIndex((current) => (current + 1) % banners.length);
  };

  const scrollToProducts = () => {
    document.getElementById('featured-products')?.scrollIntoView({ behavior: 'smooth' });
  };

  if (banners.length === 0) return null;

  return (
    <section
      className="banner-carousel"
      aria-label="Ưu đãi nổi bật"
      aria-roledescription="carousel"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusCapture={() => setIsPaused(true)}
      onBlurCapture={() => setIsPaused(false)}
    >
      <div className="banner-carousel__viewport" aria-live="polite">
        {banners.map((banner, index) => (
          <article
            className={`banner-slide banner-slide--${banner.tone}${index === activeIndex ? ' banner-slide--active' : ''}`}
            key={banner.bannerId}
            aria-hidden={index !== activeIndex}
          >
            <img src={banner.imageUrl} alt="" />
            <div className="banner-slide__scrim" />
            <div className="banner-slide__content">
              <p>{banner.eyebrow}</p>
              <h1>{banner.title}</h1>
              <span>{banner.subtitle}</span>
              {banner.ctaLabel && (
                <button type="button" onClick={scrollToProducts} tabIndex={index === activeIndex ? 0 : -1}>
                  {banner.ctaLabel}
                </button>
              )}
            </div>
          </article>
        ))}
      </div>

      <button className="banner-carousel__arrow banner-carousel__arrow--previous" type="button" onClick={showPrevious} aria-label="Banner trước">‹</button>
      <button className="banner-carousel__arrow banner-carousel__arrow--next" type="button" onClick={showNext} aria-label="Banner tiếp theo">›</button>

      <div className="banner-carousel__dots" aria-label="Chọn banner">
        {banners.map((banner, index) => (
          <button
            key={banner.bannerId}
            type="button"
            className={index === activeIndex ? 'is-active' : ''}
            onClick={() => setActiveIndex(index)}
            aria-label={`Xem banner ${index + 1}`}
            aria-current={index === activeIndex ? 'true' : undefined}
          />
        ))}
      </div>
    </section>
  );
}
