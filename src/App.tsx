import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './hooks/useAuth'
import { LanguageProvider } from './hooks/useLanguage'
import { Toaster } from './components/ui/Toast'
import AppLayout from './components/layout/AppLayout'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import OnboardingPage from './pages/OnboardingPage'
import DashboardPage from './pages/DashboardPage'
import SuppliersPage from './pages/SuppliersPage'
import ContractsPage from './pages/ContractsPage'
import BudgetsPage from './pages/BudgetsPage'
import BudgetYearPage from './pages/BudgetYearPage'
import InvoicesPage from './pages/InvoicesPage'
import InvoiceFormPage from './pages/InvoiceFormPage'
import InvoiceDetailPage from './pages/InvoiceDetailPage'
import ContractDetailPage from './pages/ContractDetailPage'
import CatalogPage from './pages/CatalogPage'
import LocationsPage from './pages/LocationsPage'
import DepartmentsPage from './pages/DepartmentsPage'
import PurchaseOrdersPage from './pages/PurchaseOrdersPage'
import POFormPage from './pages/POFormPage'
import PODetailPage from './pages/PODetailPage'
import SettingsPage from './pages/SettingsPage'
import UsersPage from './pages/UsersPage'
import RequestsPage from './pages/RequestsPage'
import RequestFormPage from './pages/RequestFormPage'
import RequestDetailPage from './pages/RequestDetailPage'
import ApprovalsPage from './pages/ApprovalsPage'
import ReceiptsPage from './pages/ReceiptsPage'
import ReceiveFormPage from './pages/ReceiveFormPage'
import ReceiptDetailPage from './pages/ReceiptDetailPage'
import PrivacyPage from './pages/PrivacyPage'
import TermsPage from './pages/TermsPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import AcceptInvitePage from './pages/AcceptInvitePage'

const queryClient = new QueryClient()

function App({ children }: { children: React.ReactNode }) {
  return <AppLayout>{children}</AppLayout>
}

export default function Root() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <LanguageProvider>
          <Toaster />
          <Routes>
            {/* Public */}
            <Route path="/"            element={<LandingPage />} />
            <Route path="/login"       element={<LoginPage />} />
            <Route path="/register"    element={<RegisterPage />} />
            <Route path="/onboarding"  element={<OnboardingPage />} />
            <Route path="/privacy"          element={<PrivacyPage />} />
            <Route path="/terms"            element={<TermsPage />} />
            <Route path="/forgot-password"  element={<ForgotPasswordPage />} />
            <Route path="/reset-password"   element={<ResetPasswordPage />} />
            <Route path="/accept-invite"    element={<AcceptInvitePage />} />

            {/* Protected app */}
            <Route path="/dashboard"              element={<App><DashboardPage /></App>} />
            <Route path="/purchase-orders"        element={<App><PurchaseOrdersPage /></App>} />
            <Route path="/purchase-orders/new"    element={<App><POFormPage /></App>} />
            <Route path="/purchase-orders/:id"    element={<App><PODetailPage /></App>} />
            <Route path="/purchase-orders/:id/edit" element={<App><POFormPage /></App>} />
            <Route path="/suppliers"              element={<App><SuppliersPage /></App>} />
            <Route path="/invoices"               element={<App><InvoicesPage /></App>} />
            <Route path="/invoices/new"           element={<App><InvoiceFormPage /></App>} />
            <Route path="/invoices/:id"           element={<App><InvoiceDetailPage /></App>} />
            <Route path="/invoices/:id/edit"      element={<App><InvoiceFormPage /></App>} />
            <Route path="/contracts"              element={<App><ContractsPage /></App>} />
            <Route path="/budgets"                element={<App><BudgetsPage /></App>} />
            <Route path="/budgets/:year"          element={<App><BudgetYearPage /></App>} />
            <Route path="/contracts/:id"          element={<App><ContractDetailPage /></App>} />
            <Route path="/catalog"                element={<App><CatalogPage /></App>} />
            <Route path="/locations"              element={<App><LocationsPage /></App>} />
            <Route path="/departments"            element={<App><DepartmentsPage /></App>} />
            <Route path="/requests"               element={<App><RequestsPage /></App>} />
            <Route path="/requests/new"           element={<App><RequestFormPage /></App>} />
            <Route path="/requests/:id"           element={<App><RequestDetailPage /></App>} />
            <Route path="/requests/:id/edit"      element={<App><RequestFormPage /></App>} />
            <Route path="/approvals"              element={<App><ApprovalsPage /></App>} />
            <Route path="/receipts"               element={<App><ReceiptsPage /></App>} />
            <Route path="/receipts/:id"           element={<App><ReceiptDetailPage /></App>} />
            <Route path="/receive/:poId"          element={<App><ReceiveFormPage /></App>} />
            <Route path="/users"                  element={<App><UsersPage /></App>} />
            <Route path="/settings"               element={<App><SettingsPage /></App>} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </LanguageProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
