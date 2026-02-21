import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from './useAuth'
import Spinner from '../../shared/components/Spinner'

export default function AuthCallbackPage() {
  const [searchParams] = useSearchParams()
  const { login } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    const token = searchParams.get('token')
    const email = searchParams.get('email')
    const id = searchParams.get('id')

    if (token && email && id) {
      login(token, email, id)
      navigate('/resumen', { replace: true })
    } else {
      navigate('/login?error=invalid_state', { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Spinner size="lg" />
    </div>
  )
}
