import { useState, FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from './useAuth'
import client from '../../shared/api/client'
import Spinner from '../../shared/components/Spinner'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres')
      return
    }
    setLoading(true)
    try {
      const res = await client.post('/api/auth/register', { email, password })
      const token = res.data.access_token
      const payload = JSON.parse(atob(token.split('.')[1]))
      login(token, email, payload.sub)
      navigate('/resumen')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error al registrarse')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-brand-700">Finanzas</h1>
        </div>
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Crear cuenta</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Correo electrónico</label>
              <input
                type="email"
                className="input"
                placeholder="tu@correo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Contraseña</label>
              <input
                type="password"
                className="input"
                placeholder="Mínimo 8 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? <Spinner size="sm" /> : 'Crear cuenta'}
            </button>
          </form>
          <p className="text-center text-sm text-gray-500 mt-4">
            ¿Ya tienes cuenta?{' '}
            <Link to="/login" className="text-brand-600 hover:underline">
              Iniciar sesión
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
