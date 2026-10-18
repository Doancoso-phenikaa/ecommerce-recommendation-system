import './customer-footer.css';

export function CustomerFooter() {
  return (
    <footer className="customer-footer">
      <div className="customer-footer__inner">
        <div className="customer-footer__brand">
          <div><span aria-hidden="true">M</span><strong>MarketNest</strong></div>
          <p>Nền tảng mua sắm trực tuyến hiện đại, kết nối khách hàng với những gian hàng đáng tin cậy trong một trải nghiệm thuận tiện.</p>
          <small>✓ Bảo vệ người mua · Mua sắm an tâm</small>
        </div>
        <div className="customer-footer__column"><h2>Chăm sóc khách hàng</h2><span>Trung tâm trợ giúp</span><span>Hướng dẫn đặt hàng</span><span>Chính sách đổi trả</span><span>Chính sách bảo hành</span><span>Liên hệ hỗ trợ</span></div>
        <div className="customer-footer__column"><h2>Về MarketNest</h2><span>Giới thiệu thương hiệu</span><span>Bán hàng cùng MarketNest</span><span>Tuyển dụng nhân tài</span><span>Điều khoản dịch vụ</span><span>Chính sách bảo mật</span></div>
        <div className="customer-footer__column"><h2>Thanh toán & vận chuyển</h2><strong>Phương thức thanh toán</strong><div className="customer-footer__tags"><span>VISA</span><span>COD</span><span>ONLINE</span></div><strong>Đơn vị vận chuyển</strong><div className="customer-footer__tags"><span>Giao nhanh</span><span>Tiết kiệm</span></div></div>
      </div>
      <div className="customer-footer__bottom"><span>© 2026 MarketNest. Tất cả quyền được bảo lưu.</span><span>Điều khoản sử dụng · Chính sách bảo mật</span></div>
    </footer>
  );
}
