import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import './auth.css';

interface AuthLayoutProps {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
}

export function AuthLayout({
  eyebrow,
  title,
  description,
  children,
  footer,
}: AuthLayoutProps) {
  return (
    <main className="auth-page">
      <section className="auth-shell" aria-label={title}>
        <aside className="auth-brand-panel">
          <Link className="auth-brand" to="/login" aria-label="Mở trang đăng nhập">
            <span className="auth-brand__mark" aria-hidden="true">
              M
            </span>
            <span>MarketNest</span>
          </Link>

          <div className="auth-brand-panel__copy">
            <p className="auth-brand-panel__kicker">Chợ trực tuyến đa người bán</p>
            <h2>Mua sắm thông minh, kết nối mọi gian hàng.</h2>
            <p>
              Một tài khoản để khám phá sản phẩm, xây dựng gian hàng và quản lý
              hoạt động kinh doanh dễ dàng.
            </p>
          </div>

          <div className="market-visual" aria-hidden="true">
            <div className="market-visual__window">
              <div className="market-visual__topbar">
                <span />
                <span />
                <span />
              </div>
              <div className="market-visual__content">
                <div className="market-visual__hero">
                  <span className="market-visual__pill" />
                  <span className="market-visual__line market-visual__line--wide" />
                  <span className="market-visual__line" />
                </div>
                <div className="market-visual__products">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </div>
            <div className="market-visual__badge">
              <strong>24/7</strong>
              <span>Mua sắm tiện lợi</span>
            </div>
          </div>

          <p className="auth-brand-panel__note">An toàn · Minh bạch · Tiện lợi</p>
        </aside>

        <div className="auth-form-panel">
          <div className="auth-form-panel__inner">
            <header className="auth-heading">
              <p>{eyebrow}</p>
              <h1>{title}</h1>
              <span>{description}</span>
            </header>

            {children}

            <footer className="auth-footer">{footer}</footer>
          </div>
        </div>
      </section>
    </main>
  );
}
