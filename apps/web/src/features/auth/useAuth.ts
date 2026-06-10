import { createContext, useContext, useEffect, useState, ReactNode, createElement } from 'react'
import { AuthUser } from '../../shared/types'

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  login: (token: string, email: string, id: string, full_name?: string | null) => void
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
    const full_name = localStorage.getItem('ff_full_name')
    if (token && email && id) {
      setUser({ token, email, id, full_name })
    }
    setLoading(false)
  }, [])

  const login = (token: string, email: string, id: string, full_name?: string | null) => {
    localStorage.setItem('ff_token', token)
    localStorage.setItem('ff_email', email)
    localStorage.setItem('ff_id', id)
    if (full_name) localStorage.setItem('ff_full_name', full_name)
    else localStorage.removeItem('ff_full_name')
    setUser({ token, email, id, full_name: full_name ?? null })
  }

  const logout = () => {
    localStorage.removeItem('ff_token')
    localStorage.removeItem('ff_email')
    localStorage.removeItem('ff_id')
    localStorage.removeItem('ff_full_name')
    setUser(null)
  }

  return createElement(AuthContext.Provider, { value: { user, loading, login, logout } }, children)
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
