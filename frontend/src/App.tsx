import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterCustomerPage } from './pages/auth/RegisterCustomerPage';
import { RegisterSellerPage } from './pages/auth/RegisterSellerPage';
import { CustomerHomePage } from './pages/customer/CustomerHomePage';
import { CartPage } from './pages/customer/CartPage';
import { ProductDetailPage } from './pages/customer/ProductDetailPage';
import { WishlistPage } from './pages/customer/WishlistPage';
import { SellerDashboardPage } from './pages/seller/SellerDashboardPage';
import { CustomerLayout } from './layouts/CustomerLayout';
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
          <Route path="/wishlist" element={<WishlistPage />} />
          <Route path="/cart" element={<CartPage />} />
        </Route>
      </Route>
      <Route element={<RoleRoute allowedRoles={['SELLER']} />}><Route path="/seller" element={<SellerDashboardPage />} /></Route>
      <Route element={<RoleRoute allowedRoles={['ADMIN']} />}><Route path="/admin" element={<AdminDashboardPage />} /></Route>
    </Route>
    <Route path="*" element={<Navigate to="/login" replace />} />
  </Routes>;
}

export default App;
