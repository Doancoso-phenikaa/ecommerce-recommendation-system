import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterCustomerPage } from './pages/auth/RegisterCustomerPage';
import { RegisterSellerPage } from './pages/auth/RegisterSellerPage';
import { CustomerHomePage } from './pages/customer/CustomerHomePage';
import { CartPage } from './pages/customer/CartPage';
import { ProductDetailPage } from './pages/customer/ProductDetailPage';
import { CategoryProductPage } from './pages/customer/CategoryProductPage';
import { ProductSearchPage } from './pages/customer/ProductSearchPage';
import { RecommendationPage } from './pages/customer/RecommendationPage';
import { CheckoutPage } from './pages/customer/CheckoutPage';
import { PaymentResultPage } from './pages/customer/PaymentResultPage';
import { OrderHistoryPage } from './pages/customer/OrderHistoryPage';
import { OrderDetailPage } from './pages/customer/OrderDetailPage';
import { WishlistPage } from './pages/customer/WishlistPage';
import { CustomerProfilePage } from './pages/customer/CustomerProfilePage';
import { SellerDashboardPage } from './pages/seller/SellerDashboardPage';
import { SellerShopPage } from './pages/seller/SellerShopPage';
import { SellerProductPage } from './pages/seller/SellerProductPage';
import { SellerOrderPage } from './pages/seller/SellerOrderPage';
import { SellerOrderDetailPage } from './pages/seller/SellerOrderDetailPage';
import { SellerReviewPage } from './pages/seller/SellerReviewPage';
import { SellerStatisticsPage } from './pages/seller/SellerStatisticsPage';
import { SellerProfilePage } from './pages/seller/SellerProfilePage';
import { CustomerLayout } from './layouts/CustomerLayout';
import { SellerLayout } from './layouts/SellerLayout';
import { AdminLayout } from './layouts/AdminLayout';
import { AdminShopPage } from './pages/admin/AdminShopPage';
import { AdminShopDetailPage } from './pages/admin/AdminShopDetailPage';
import { AdminCategoryPage } from './pages/admin/AdminCategoryPage';
import { AdminProductPage } from './pages/admin/AdminProductPage';
import { AdminProductDetailPage } from './pages/admin/AdminProductDetailPage';
import { AdminOrderPage } from './pages/admin/AdminOrderPage';
import { AdminOrderDetailPage } from './pages/admin/AdminOrderDetailPage';
import { AdminStatisticsPage } from './pages/admin/AdminStatisticsPage';
import { AdminUserPage } from './pages/admin/AdminUserPage';
import { AdminUserDetailPage } from './pages/admin/AdminUserDetailPage';
import { AdminDiscountPage } from './pages/admin/AdminDiscountPage';
import { AdminShippingSettingsPage } from './pages/admin/AdminShippingSettingsPage';
import { GuestRoute } from './routes/GuestRoute';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { RoleRoute } from './routes/RoleRoute';

function App() {
  return <Routes>
    <Route element={<GuestRoute />}>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterCustomerPage />} />
      <Route path="/register/seller" element={<RegisterSellerPage />} />
    </Route>
    <Route element={<ProtectedRoute />}>
      <Route element={<RoleRoute allowedRoles={['CUSTOMER']} />}>
        <Route element={<CustomerLayout />}>
          <Route path="/" element={<CustomerHomePage />} />
          <Route path="/products/:productId" element={<ProductDetailPage />} />
          <Route path="/categories/:categoryId" element={<CategoryProductPage />} />
          <Route path="/search" element={<ProductSearchPage />} />
          <Route path="/recommendations" element={<RecommendationPage />} />
          <Route path="/wishlist" element={<WishlistPage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/checkout/payment/result" element={<PaymentResultPage />} />
          <Route path="/orders" element={<OrderHistoryPage />} />
          <Route path="/orders/:orderGroupId" element={<OrderDetailPage />} />
          <Route path="/profile" element={<CustomerProfilePage />} />
        </Route>
      </Route>
      <Route element={<RoleRoute allowedRoles={['SELLER']} />}>
        <Route path="/seller" element={<SellerLayout />}>
          <Route index element={<SellerDashboardPage />} />
          <Route path="shop" element={<SellerShopPage />} />
          <Route path="products" element={<SellerProductPage />} />
          <Route path="orders" element={<SellerOrderPage />} />
          <Route path="orders/:orderId" element={<SellerOrderDetailPage />} />
          <Route path="reviews" element={<SellerReviewPage />} />
          <Route path="statistics" element={<SellerStatisticsPage />} />
          <Route path="profile" element={<SellerProfilePage />} />
        </Route>
      </Route>
      <Route element={<RoleRoute allowedRoles={['ADMIN']} />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboardPage />} />
          <Route path="shops" element={<AdminShopPage />} />
          <Route path="shops/:shopId" element={<AdminShopDetailPage />} />
          <Route path="categories" element={<AdminCategoryPage />} />
          <Route path="products" element={<AdminProductPage />} />
          <Route path="products/:productId" element={<AdminProductDetailPage />} />
          <Route path="orders" element={<AdminOrderPage />} />
          <Route path="orders/:orderId" element={<AdminOrderDetailPage />} />
          <Route path="discounts" element={<AdminDiscountPage />} />
          <Route path="shipping" element={<AdminShippingSettingsPage />} />
          <Route path="users" element={<AdminUserPage />} />
          <Route path="users/:userId" element={<AdminUserDetailPage />} />
          <Route path="statistics" element={<AdminStatisticsPage />} />
        </Route>
      </Route>
    </Route>
    <Route path="*" element={<Navigate to="/login" replace />} />
  </Routes>;
}

export default App;
