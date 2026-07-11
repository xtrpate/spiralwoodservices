import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
} from "react-router-dom";
import { Toaster } from "react-hot-toast";
import useAuthStore from "./store/authStore";
import ErrorBoundary from "./components/ErrorBoundary";
import TasksPage from "./pages/tasks/TasksPage";
import ImportPage from "./pages/blueprints/importPage";

import MyTasks from "./pages/staff/MyTasks";

import AdminLayout from "./components/layout/AdminLayout";
import DashboardPage from "./pages/dashboard/DashboardPage";
import ProductsPage from "./pages/products/ProductsPage";
import ProductFormPage from "./pages/products/ProductFormPage";
import RawMaterialsPage from "./pages/inventory/RawMaterialsPage";
import BuildMaterialsPage from "./pages/inventory/BuildMaterialsPage";
import StockMovementPage from "./pages/inventory/StockMovementPage";
import SuppliersPage from "./pages/inventory/SuppliersPage";
import BlueprintsPage from "./pages/blueprints/BlueprintsPage";
import BlueprintDesign from "./pages/blueprints/BlueprintDesign.jsx";
import EstimationPage from "./pages/blueprints/EstimationPage";
import ContractsPage from "./pages/blueprints/ContractsPage";
import OrdersPage from "./pages/orders/OrdersPage";
import OrderDetailPage from "./pages/orders/OrderDetailPage";
import CancellationsPage from "./pages/orders/CancellationsPage";
import SalesReportPage from "./pages/sales/SalesReportPage";
import WarrantyPage from "./pages/warranty/WarrantyPage";
import CustomersPage from "./pages/customers/CustomersPage";
import UsersPage from "./pages/users/UsersPage";
import WebsiteSettingsPage from "./pages/website/WebsiteSettingsPage";
import FaqsPage from "./pages/website/FaqsPage";
import StaticPagesPage from "./pages/website/StaticPagesPage";
import BackupPage from "./pages/backup/BackupPage";
import AuditLogsPage from "./pages/audit/AuditLogsPage";

import { CartProvider } from "./pages/customer/cartcontext";
import { CustomCartProvider } from "./pages/customer/customcartcontext";
import CustomerLayout from "./pages/customer/customerlayout.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import RegisterPage from "./pages/customer/registerpage";
import ForgotPasswordPage from "./pages/customer/forgotpasswordpage";
import ProductCatalog from "./pages/customer/productcatalog";
import CartPage from "./pages/customer/cartpage";
import CheckoutPage from "./pages/customer/checkoutpage";
import CustomizePage from "./pages/customer/customizepage";
import CustomCheckoutPage from "./pages/customer/customcheckoutpage";
import CustomRequestDetailPage from "./pages/customer/customrequestdetailpage";
import AppointmentPage from "./pages/customer/appointmentpage";
import OrdersPageCustomer from "./pages/customer/orderspage";
import WarrantyPageCustomer from "./pages/customer/warrantypage";
import ProfileSettings from "./pages/customer/profilesettings";
import LandingPage from "./pages/customer/LandingPage";
import VerifyOtpPage from "./pages/customer/verifyotppage";
import ResetPasswordPage from "./pages/customer/resetpasswordpage";
import PendingApprovalPage from "./pages/customer/pendingapprovalpage";
import TermsPage from "./pages/customer/TermsPage";
import PrivacyPolicyPage from "./pages/customer/PrivacyPolicyPage";

import POSLayout from "./pages/staff/POSLayout.jsx";
import POSDashboard from "./pages/staff/Dashboard";
import POSProductSearch from "./pages/staff/ProductSearch";
import POSProcessOrder from "./pages/staff/ProcessOrder";
import POSDeliveryScheduling from "./pages/staff/DeliveryScheduling";
import POSDeliveryManagement from "./pages/staff/DeliveryManagement";
import POSAppointmentScheduling from "./pages/staff/AppointmentScheduling";
import POSReceiptPage from "./pages/staff/ReceiptPage";
import POSSalesReports from "./pages/staff/SalesReports";
import POSBlueprintView from "./pages/staff/BlueprintView";
import POSInventoryLookup from "./pages/staff/InventoryLookup";
import POSOrderHistory from "./pages/staff/OrderHistory";
import RiderDashboard from "./pages/staff/RiderDashboard";
import RiderHistory from "./pages/staff/RiderHistory";

window.addEventListener("error", (e) => {
  if (
    e.message === "ResizeObserver loop limit exceeded" ||
    e.message ===
      "ResizeObserver loop completed with undelivered notifications."
  ) {
    e.stopImmediatePropagation();
  }
});

function RequireAuth({ children, roles }) {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={getDefaultRouteForUser(user)} replace />;
  }
  return children;
}

function RequireStaffType({ children, allowedTypes }) {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "admin") return children;
  if (user.role !== "staff") {
    return <Navigate to={getDefaultRouteForUser(user)} replace />;
  }
  if (!allowedTypes.includes(user.staff_type)) {
    return <Navigate to={getDefaultRouteForUser(user)} replace />;
  }
  return children;
}

function RequireStaffOnlyType({ children, allowedTypes }) {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "staff") {
    return <Navigate to={getDefaultRouteForUser(user)} replace />;
  }
  if (!allowedTypes.includes(user.staff_type)) {
    return <Navigate to={getDefaultRouteForUser(user)} replace />;
  }
  return children;
}

function getDefaultRouteForUser(user) {
  if (!user) return "/login";
  if (user.role === "admin") return "/admin/dashboard";
  if (user.role === "staff") {
    if (user.staff_type === "delivery_rider") return "/staff/rider-dashboard";
    if (user.staff_type === "cashier") return "/staff/order";
    return "/staff/dashboard";
  }

  return "/";
  return "/catalog";
}

function RedirectIfAuthenticated({ children }) {
  const { user } = useAuthStore();
  if (user) {
    return <Navigate to={getDefaultRouteForUser(user)} replace />;
  }
  return children;
}

function BlockNonCustomerPortal({ children }) {
  const { user } = useAuthStore();
  if (!user) return children;
  if (user.role !== "customer") {
    return <Navigate to={getDefaultRouteForUser(user)} replace />;
  }
  return children;
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <CartProvider>
          <CustomCartProvider>
            <Toaster position="top-center" toastOptions={{ duration: 4000 }} />
            <Routes>
              {/* CUSTOMER PORTAL */}
              <Route element={<Outlet />}>
                <Route
                  path="/"
                  element={
                    <BlockNonCustomerPortal>
                      <CustomerLayout />
                    </BlockNonCustomerPortal>
                  }
                >
                  <Route index element={<LandingPage />} />
                  <Route
                    path="login"
                    element={
                      <RedirectIfAuthenticated>
                        <LoginPage />
                      </RedirectIfAuthenticated>
                    }
                  />
                  <Route
                    path="register"
                    element={
                      <RedirectIfAuthenticated>
                        <RegisterPage />
                      </RedirectIfAuthenticated>
                    }
                  />
                  <Route
                    path="forgot-password"
                    element={
                      <RedirectIfAuthenticated>
                        <ForgotPasswordPage />
                      </RedirectIfAuthenticated>
                    }
                  />
                  <Route
                    path="reset-password"
                    element={
                      <RedirectIfAuthenticated>
                        <ResetPasswordPage />
                      </RedirectIfAuthenticated>
                    }
                  />
                  <Route path="terms" element={<TermsPage />} />
                  <Route path="privacy" element={<PrivacyPolicyPage />} />
                  <Route path="verify-otp" element={<VerifyOtpPage />} />
                  <Route
                    path="pending-approval"
                    element={<PendingApprovalPage />}
                  />
                  <Route path="catalog" element={<ProductCatalog />} />
                  <Route path="cart" element={<CartPage />} />
                  <Route path="customize" element={<CustomizePage />} />
                  <Route
                    path="custom-cart"
                    element={<Navigate to="/cart" replace />}
                  />
                  <Route
                    path="checkout"
                    element={
                      <RequireAuth roles={["customer"]}>
                        <CheckoutPage />
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="custom-checkout"
                    element={
                      <RequireAuth roles={["customer"]}>
                        <CustomCheckoutPage />
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="custom-requests/:id"
                    element={
                      <RequireAuth roles={["customer"]}>
                        <CustomRequestDetailPage />
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="appointment"
                    element={
                      <RequireAuth roles={["customer"]}>
                        <AppointmentPage />
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="orders"
                    element={
                      <RequireAuth roles={["customer"]}>
                        <OrdersPageCustomer />
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="warranty"
                    element={
                      <RequireAuth roles={["customer"]}>
                        <WarrantyPageCustomer />
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="profilesettings"
                    element={
                      <RequireAuth roles={["customer"]}>
                        <ProfileSettings />
                      </RequireAuth>
                    }
                  />
                </Route>
              </Route>

              {/* ADMIN & STAFF PUBLIC ROUTES */}
              <Route
                path="/admin/blueprints/:id/import"
                element={
                  <RequireAuth roles={["admin"]}>
                    <ImportPage />
                  </RequireAuth>
                }
              />

              {/* ADMIN PORTAL */}
              <Route
                path="/admin"
                element={
                  <RequireAuth roles={["admin"]}>
                    <AdminLayout />
                  </RequireAuth>
                }
              >
                <Route path="tasks" element={<TasksPage />} />
                <Route
                  path="appointments"
                  element={<POSAppointmentScheduling />}
                />
                <Route path="delivery" element={<POSDeliveryScheduling />} />
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard" element={<DashboardPage />} />
                <Route path="products" element={<ProductsPage />} />
                <Route path="products/new" element={<ProductFormPage />} />
                <Route path="products/:id/edit" element={<ProductFormPage />} />
                <Route path="inventory/raw" element={<RawMaterialsPage />} />
                <Route
                  path="inventory/build"
                  element={<BuildMaterialsPage />}
                />
                <Route
                  path="inventory/movements"
                  element={<StockMovementPage />}
                />
                <Route path="inventory/suppliers" element={<SuppliersPage />} />
                <Route path="blueprints" element={<BlueprintsPage />} />
                <Route
                  path="blueprints/:id/design"
                  element={<BlueprintDesign />}
                />
                <Route
                  path="blueprints/:id/estimation"
                  element={<EstimationPage />}
                />
                <Route path="contracts" element={<ContractsPage />} />
                <Route path="orders" element={<OrdersPage />} />
                <Route path="orders/:id" element={<OrderDetailPage />} />
                <Route
                  path="orders/cancellations"
                  element={<CancellationsPage />}
                />
                <Route path="sales" element={<SalesReportPage />} />
                <Route path="warranty" element={<WarrantyPage />} />
                <Route
                  path="customers"
                  element={
                    <RequireAuth roles={["admin"]}>
                      <CustomersPage />
                    </RequireAuth>
                  }
                />
                <Route
                  path="users"
                  element={
                    <RequireAuth roles={["admin"]}>
                      <UsersPage />
                    </RequireAuth>
                  }
                />
                <Route
                  path="website/settings"
                  element={
                    <RequireAuth roles={["admin"]}>
                      <WebsiteSettingsPage />
                    </RequireAuth>
                  }
                />
                <Route
                  path="website/faqs"
                  element={
                    <RequireAuth roles={["admin"]}>
                      <FaqsPage />
                    </RequireAuth>
                  }
                />
                <Route
                  path="website/pages"
                  element={
                    <RequireAuth roles={["admin"]}>
                      <StaticPagesPage />
                    </RequireAuth>
                  }
                />
                <Route
                  path="backup"
                  element={
                    <RequireAuth roles={["admin"]}>
                      <BackupPage />
                    </RequireAuth>
                  }
                />
                <Route
                  path="audit-logs"
                  element={
                    <RequireAuth roles={["admin"]}>
                      <AuditLogsPage />
                    </RequireAuth>
                  }
                />
              </Route>

              {/* STAFF PORTAL */}
              <Route
                path="/staff"
                element={
                  <RequireAuth roles={["admin", "staff"]}>
                    <POSLayout />
                  </RequireAuth>
                }
              >
                <Route
                  path="rider-dashboard"
                  element={
                    <RequireStaffType allowedTypes={["delivery_rider"]}>
                      <RiderDashboard />
                    </RequireStaffType>
                  }
                />
                <Route
                  path="rider-history"
                  element={
                    <RequireStaffType allowedTypes={["delivery_rider"]}>
                      <RiderHistory />
                    </RequireStaffType>
                  }
                />
                {/* ---------------------------------- */}

                <Route
                  path="dashboard"
                  element={
                    <RequireStaffType allowedTypes={["indoor"]}>
                      <POSDashboard />
                    </RequireStaffType>
                  }
                />

                <Route
                  index
                  element={
                    <Navigate
                      to={getDefaultRouteForUser(useAuthStore.getState().user)}
                      replace
                    />
                  }
                />
                <Route
                  path="products"
                  element={
                    <RequireStaffType allowedTypes={["cashier"]}>
                      <POSProductSearch />
                    </RequireStaffType>
                  }
                />
                <Route
                  path="tasks"
                  element={
                    <RequireStaffType allowedTypes={["indoor"]}>
                      <MyTasks />
                    </RequireStaffType>
                  }
                />
                <Route
                  path="order"
                  element={
                    <RequireStaffType allowedTypes={["cashier"]}>
                      <POSProcessOrder />
                    </RequireStaffType>
                  }
                />
                <Route
                  path="history"
                  element={
                    <RequireStaffType allowedTypes={["cashier"]}>
                      <POSOrderHistory />
                    </RequireStaffType>
                  }
                />
                <Route
                  path="delivery"
                  element={
                    <RequireAuth roles={["admin"]}>
                      <POSDeliveryScheduling />
                    </RequireAuth>
                  }
                />
                <Route
                  path="deliveries"
                  element={
                    <RequireStaffType allowedTypes={["delivery_rider"]}>
                      <POSDeliveryManagement />
                    </RequireStaffType>
                  }
                />
                <Route
                  path="appointment"
                  element={
                    <RequireStaffOnlyType allowedTypes={["indoor"]}>
                      <POSAppointmentScheduling />
                    </RequireStaffOnlyType>
                  }
                />
                <Route
                  path="receipt/:id"
                  element={
                    <RequireStaffType allowedTypes={["cashier"]}>
                      <POSReceiptPage />
                    </RequireStaffType>
                  }
                />
                <Route
                  path="reports"
                  element={
                    <RequireStaffType allowedTypes={["cashier"]}>
                      <POSSalesReports />
                    </RequireStaffType>
                  }
                />
                <Route
                  path="inventory"
                  element={
                    <RequireStaffType allowedTypes={["indoor"]}>
                      <POSInventoryLookup />
                    </RequireStaffType>
                  }
                />
                <Route
                  path="blueprints"
                  element={
                    <RequireAuth roles={["admin"]}>
                      <POSBlueprintView />
                    </RequireAuth>
                  }
                />
              </Route>

              {/* Catch-all */}
              <Route path="*" element={<Navigate to="/catalog" replace />} />
            </Routes>
          </CustomCartProvider>
        </CartProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
