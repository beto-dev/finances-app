import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../features/auth/useAuth'

const navItems = [
  { to: '/resumen', label: '📊 Resumen' },
  { to: '/cargar', label: '📤 Subir Cartola' },
  { to: '/cargos', label: '📋 Movimientos' },
  { to: '/cargos-familia', label: '👨‍👩‍👧 Movimientos Familia' },
  { to: '/aportes', label: '💰 Aportes' },
  { to: '/familia', label: '👥 Familia' },
  { to: '/hojas', label: '📗 Google Sheets' },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-60 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-6 py-5 border-b border-gray-200">
          <h1 className="text-xl font-bold text-brand-700">Finanzas</h1>
        </div>
        <nav className="flex-1 py-4 px-3 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-gray-200">
          <p className="text-xs text-gray-500 truncate mb-2">{user?.email}</p>
          <button onClick={handleLogout} className="btn-secondary w-full text-sm">
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
