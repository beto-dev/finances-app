import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../features/auth/useAuth'

// ── Sidebar nav (desktop) ────────────────────────────────────────────────────
const sidebarItems = [
  { to: '/resumen', label: '📊 Resumen' },
  { to: '/nuevo-gasto', label: '➕ Nuevo Gasto' },
  { to: '/cargar', label: '📤 Subir Cartola' },
  { to: '/cargos', label: '📋 Movimientos' },
  { to: '/cargos-familia', label: '👨‍👩‍👧 Movimientos Familia' },
  { to: '/aportes', label: '💰 Aportes' },
  { to: '/familia', label: '👥 Familia' },
]

// ── Bottom tab bar (mobile) ──────────────────────────────────────────────────
function IconChart() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
      <path d="M3 3v18h18" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" />
    </svg>
  )
}
function IconList() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  )
}
function IconUpload() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
      strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}
function IconDollar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  )
}
function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
      strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

const tabItems = [
  { to: '/resumen',        label: 'Resumen',    Icon: IconChart  },
  { to: '/cargos-familia', label: 'Familia',    Icon: IconList   },
  { to: '/nuevo-gasto',    label: 'Gasto',      Icon: IconPlus,  fab: true },
  { to: '/cargar',         label: 'Subir',      Icon: IconUpload },
  { to: '/aportes',        label: 'Aportes',    Icon: IconDollar },
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

      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex w-60 bg-white border-r border-gray-200 flex-col">
        <div className="px-6 py-5 border-b border-gray-200">
          <h1 className="text-xl font-bold text-brand-700">Finanzas</h1>
        </div>
        <nav className="flex-1 py-4 px-3 space-y-1">
          {sidebarItems.map((item) => (
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

      {/* ── Main content ── */}
      <main className="flex-1 overflow-auto">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 sticky top-0 z-10">
          <h1 className="text-lg font-bold text-brand-700">Finanzas</h1>
          <button onClick={handleLogout} className="text-xs text-gray-500 px-3 py-1.5 rounded-lg border border-gray-200">
            Salir
          </button>
        </div>

        <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 pb-[calc(80px+env(safe-area-inset-bottom))] md:pb-8">
          <Outlet />
        </div>
      </main>

      {/* ── Mobile bottom tab bar ── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-50 flex items-end"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {tabItems.map(({ to, label, Icon, fab }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              fab
                ? 'flex-1 flex flex-col items-center justify-center pb-2 pt-1'
                : `flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-all active:scale-90 ${
                    isActive ? 'text-brand-700' : 'text-gray-400'
                  }`
            }
          >
            {({ isActive }) =>
              fab ? (
                <span className={`flex items-center justify-center w-12 h-12 rounded-2xl shadow-lg transition-transform active:scale-95 ${
                  isActive ? 'bg-brand-700' : 'bg-brand-600'
                }`}>
                  <span className="text-white"><Icon /></span>
                </span>
              ) : (
                <>
                  <Icon />
                  <span className="text-[10px] font-medium leading-none">{label}</span>
                </>
              )
            }
          </NavLink>
        ))}
      </nav>

    </div>
  )
}
