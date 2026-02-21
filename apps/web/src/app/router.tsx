import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from '../shared/components/Layout'
import ProtectedRoute from '../shared/components/ProtectedRoute'
import LoginPage from '../features/auth/LoginPage'
import AuthCallbackPage from '../features/auth/AuthCallbackPage'
import UploadPage from '../features/upload/UploadPage'
import ChargesPage from '../features/charges/ChargesPage'
import DashboardPage from '../features/dashboard/DashboardPage'
import FamilyPage from '../features/family/FamilyPage'
import SheetsPage from '../features/sheets/SheetsPage'
import FamilyChargesPage from '../features/charges/FamilyChargesPage'
import ContributionsPage from '../features/contributions/ContributionsPage'
import QuickExpensePage from '../features/expenses/QuickExpensePage'

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/resumen" replace />} />
          <Route path="/resumen" element={<DashboardPage />} />
          <Route path="/cargar" element={<UploadPage />} />
          <Route path="/gastos" element={<ChargesPage />} />
          <Route path="/gastos-familia" element={<FamilyChargesPage />} />
          <Route path="/aportes" element={<ContributionsPage />} />
          <Route path="/familia" element={<FamilyPage />} />
          <Route path="/hojas" element={<SheetsPage />} />
          <Route path="/nuevo-gasto" element={<QuickExpensePage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
