import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../features/auth/useAuth'
import Spinner from './Spinner'

export default function ProtectedRoute() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
