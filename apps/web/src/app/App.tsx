import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from '../features/auth/useAuth'
import AppRouter from './router'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </BrowserRouter>
  )
}
