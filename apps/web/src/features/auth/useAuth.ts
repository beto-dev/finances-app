import { createContext, useContext, useEffect, useState, ReactNode, createElement } from 'react'
import { AuthUser } from '../../shared/types'

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  login: (token: string, email: string, id: string) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('ff_token')
    const email = localStorage.getItem('ff_email')
    const id = localStorage.getItem('ff_id')
    if (token && email && id) {
      setUser({ token, email, id })
    }
    setLoading(false)
  }, [])

  const login = (token: string, email: string, id: string) => {
    localStorage.setItem('ff_token', token)
    localStorage.setItem('ff_email', email)
    localStorage.setItem('ff_id', id)
    setUser({ token, email, id })
  }

  const logout = () => {
    localStorage.removeItem('ff_token')
    localStorage.removeItem('ff_email')
    localStorage.removeItem('ff_id')
    setUser(null)
  }

  return createElement(AuthContext.Provider, { value: { user, loading, login, logout } }, children)
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
