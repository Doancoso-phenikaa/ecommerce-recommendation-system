import './customer-footer.css';

export function CustomerFooter() {
  return (
    <footer className="customer-footer">
      <div className="customer-footer__inner">
        <div className="customer-footer__brand">
          <div><span aria-hidden="true">M</span><strong>MarketNest</strong></div>
          <p>Nền tảng kết nối khách hàng với nhiều gian hàng đáng tin cậy trong một trải nghiệm mua sắm thuận tiện.</p>
        </div>
        <div className="customer-footer__column">
          <h2>Hỗ trợ khách hàng</h2>
          <span>Trung tâm trợ giúp</span><span>Hướng dẫn mua hàng</span><span>Chính sách</span>
        </div>
        <div className="customer-footer__column">
          <h2>Dành cho người bán</h2>
          <span>Kênh người bán</span><span>Đăng ký bán hàng</span><span>Quy định gian hàng</span>
        </div>
        <div className="customer-footer__column">
          <h2>Theo dõi chúng tôi</h2>
          <span>Facebook</span><span>Instagram</span><span>LinkedIn</span>
        </div>
      </div>
      <div className="customer-footer__bottom">© 2026 MarketNest. All rights reserved.</div>
    </footer>
  );
}
