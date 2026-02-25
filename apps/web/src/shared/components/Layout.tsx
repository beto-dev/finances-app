import { useState } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../features/auth/useAuth'
import { useMyRole } from '../../features/family/useMyRole'

// ── Sidebar nav (desktop) ────────────────────────────────────────────────────
const topItems = [
  { to: '/resumen',     label: '📊 Resumen' },
  { to: '/nuevo-gasto', label: '➕ Nuevo Gasto' },
  { to: '/cargar',      label: '📤 Subir Cartola' },
  { to: '/gastos',      label: '📋 Gastos' },
]

const familyItems = [
  { to: '/gastos-familia', label: '📋 Gastos' },
  { to: '/aportes',        label: '💰 Aportes' },
]

const familyRoutes = [...familyItems.map((i) => i.to), '/familia']

// ── Bottom tab bar (mobile) ──────────────────────────────────────────────────
const tabItems = [
  { to: '/resumen',        emoji: '📊', label: 'Resumen'  },
  { to: '/gastos-familia', emoji: '👨‍👩‍👧', label: 'Familia'  },
  { to: '/nuevo-gasto',    emoji: '➕', label: 'Gasto',    fab: true },
  { to: '/cargar',         emoji: '📤', label: 'Subir'    },
  { to: '/aportes',        emoji: '💰', label: 'Aportes'  },
]

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
    isActive
      ? 'bg-brand-50 text-brand-700'
      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
  }`

export default function Layout() {
  const { user, logout } = useAuth()
  const { data: roleData } = useMyRole()
  const isAdmin = roleData?.role === 'admin'
  const hasFamily = roleData?.role != null
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const [familyOpen, setFamilyOpen] = useState(() => familyRoutes.includes(pathname))

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-gray-50">

      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex w-60 bg-white border-r border-gray-200 flex-col">
        <div className="px-6 py-5 border-b border-gray-200">
          <h1 className="text-xl font-bold text-brand-700">Finanzas</h1>
        </div>
        <nav className="flex-1 py-4 px-3 space-y-1">
          {topItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={navLinkClass}>
              {item.label}
            </NavLink>
          ))}

          {/* Familia group */}
          <div>
            <button
              onClick={() => setFamilyOpen((o) => !o)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
            >
              <span>👨‍👩‍👧 Familia</span>
              <svg
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                strokeLinecap="round" strokeLinejoin="round"
                className={`w-3.5 h-3.5 transition-transform ${familyOpen ? 'rotate-180' : ''}`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {familyOpen && (
              <div className="mt-1 ml-3 pl-3 border-l border-gray-200 space-y-1">
                {hasFamily && familyItems.map((item) => (
                  <NavLink key={item.to} to={item.to} className={navLinkClass}>
                    {item.label}
                  </NavLink>
                ))}
                {roleData?.role !== 'member' && (
                  <NavLink to="/familia" className={navLinkClass}>
                    {isAdmin ? '👥 Miembros' : '🏠 Crear familia'}
                  </NavLink>
                )}
              </div>
            )}
          </div>
        </nav>
        <div className="px-4 py-4 border-t border-gray-200">
          <p className="text-xs text-gray-500 truncate mb-2">{user?.email}</p>
          <button onClick={handleLogout} className="btn-secondary w-full text-sm">
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-auto">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 sticky top-0 z-10">
          <h1 className="text-lg font-bold text-brand-700">Finanzas</h1>
          <button onClick={handleLogout} className="text-xs text-gray-500 px-3 py-1.5 rounded-lg border border-gray-200">
            Salir
          </button>
        </div>

        <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 pb-[calc(90px+env(safe-area-inset-bottom))] md:pb-8">
          <Outlet />
        </div>
      </main>

      {/* ── Mobile bottom tab bar ── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-50 flex items-end"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {tabItems.map(({ to, emoji, label, fab }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              fab
                ? 'flex-1 flex flex-col items-center justify-center pb-3 pt-1'
                : `flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-all active:scale-90 ${
                    isActive ? 'opacity-100' : 'opacity-50'
                  }`
            }
          >
            {({ isActive }) =>
              fab ? (
                <span className={`flex items-center justify-center w-14 h-14 rounded-2xl shadow-lg transition-transform active:scale-95 text-2xl ${
                  isActive ? 'bg-brand-700' : 'bg-brand-600'
                }`}>
                  {emoji}
                </span>
              ) : (
                <>
                  <span className="text-[22px] leading-none">{emoji}</span>
                  <span className={`text-[11px] font-medium leading-none ${isActive ? 'text-brand-700' : 'text-gray-500'}`}>
                    {label}
                  </span>
                </>
              )
            }
          </NavLink>
        ))}
      </nav>

    </div>
  )
}
