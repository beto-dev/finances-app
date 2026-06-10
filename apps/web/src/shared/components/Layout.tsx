import { useState } from 'react'
import { NavLink, Outlet, useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '../../features/auth/useAuth'
import { useMyRole } from '../../features/family/useMyRole'
import { useStatementNotifier } from '../../features/upload/useUpload'
import { useMe, useUpdateMe } from '../../features/auth/useMe'

// ── Sidebar nav (desktop) ────────────────────────────────────────────────────
const topItems = [
  { to: '/resumen',     label: '📊 Resumen' },
  { to: '/nuevo-gasto', label: '➕ Nuevo Gasto' },
  { to: '/cargar',      label: '📤 Subir Cartola' },
  { to: '/gastos',      label: '📋 Gastos' },
  { to: '/cuotas',      label: '🔢 Cuotas' },
]

const familyItems = [
  { to: '/gastos-familia', label: '📋 Gastos' },
  { to: '/aportes',        label: '💰 Aportes' },
]

const familyRoutes = [...familyItems.map((i) => i.to), '/familia']

// ── Bottom tab bar (mobile) ──────────────────────────────────────────────────
const tabItems = [
  { to: '/resumen',        emoji: '📊', label: 'Resumen' },
  { to: '/gastos',         emoji: '📋', label: 'Gastos'  },
  { to: '/cargar',         emoji: '📤', label: 'Subir',   fab: true },
  { to: '/gastos-familia', emoji: '👨‍👩‍👧', label: 'Familia' },
  { to: '/aportes',        emoji: '💰', label: 'Aportes' },
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

  // Auto-fetch full_name from API — no re-login needed
  useMe()
  const updateMe = useUpdateMe()

  const [familyOpen, setFamilyOpen] = useState(() => familyRoutes.includes(pathname))
  const [profileOpen, setProfileOpen] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const { notification, clearNotification } = useStatementNotifier()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const handleSaveName = async () => {
    if (!nameInput.trim()) return
    await updateMe.mutateAsync(nameInput.trim())
    setEditingName(false)
    setProfileOpen(false)
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
                {isAdmin && (
                  <NavLink to="/categorias" className={navLinkClass}>
                    🏷️ Categorías
                  </NavLink>
                )}
              </div>
            )}
          </div>
        </nav>
        {/* User profile area */}
        <div className="px-3 py-3 border-t border-gray-200 relative">
          <button
            onClick={() => { setProfileOpen((o) => !o); setEditingName(false) }}
            className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-gray-100 transition-colors text-left"
          >
            <span className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-sm font-semibold shrink-0">
              {(user?.full_name ?? user?.email ?? '?')[0].toUpperCase()}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{user?.full_name ?? 'Mi perfil'}</p>
              <p className="text-xs text-gray-400 truncate">{user?.email}</p>
            </div>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
              className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${profileOpen ? 'rotate-180' : ''}`}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {profileOpen && (
            <div className="mt-1 border border-gray-200 rounded-lg bg-white shadow-sm overflow-hidden">
              {!editingName ? (
                <button
                  onClick={() => { setNameInput(user?.full_name ?? ''); setEditingName(true) }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-gray-400">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  Editar nombre
                </button>
              ) : (
                <div className="px-3 py-2.5 space-y-2">
                  <input
                    autoFocus
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false) }}
                    placeholder="Tu nombre completo"
                    className="w-full text-sm border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <div className="flex gap-1.5">
                    <button onClick={handleSaveName} disabled={updateMe.isPending} className="flex-1 text-xs py-1.5 bg-brand-600 text-white rounded-md hover:bg-brand-700 disabled:opacity-60">
                      {updateMe.isPending ? '...' : 'Guardar'}
                    </button>
                    <button onClick={() => setEditingName(false)} className="flex-1 text-xs py-1.5 border border-gray-200 text-gray-600 rounded-md hover:bg-gray-50">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
              <div className="border-t border-gray-100">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  Cerrar sesión
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-auto">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 sticky top-0 z-10">
          <h1 className="text-lg font-bold text-brand-700">Finanzas</h1>
          <div className="relative">
            <button
              onClick={() => { setProfileOpen((o) => !o); setEditingName(false) }}
              className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-sm font-semibold"
            >
              {(user?.full_name ?? user?.email ?? '?')[0].toUpperCase()}
            </button>
            {profileOpen && (
              <div className="absolute right-0 top-10 w-56 border border-gray-200 rounded-xl bg-white shadow-lg overflow-hidden z-50">
                <div className="px-3 py-2.5 border-b border-gray-100">
                  <p className="text-sm font-medium text-gray-800 truncate">{user?.full_name ?? 'Sin nombre'}</p>
                  <p className="text-xs text-gray-400 truncate">{user?.email}</p>
                </div>
                {!editingName ? (
                  <button onClick={() => { setNameInput(user?.full_name ?? ''); setEditingName(true) }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                    ✏️ Editar nombre
                  </button>
                ) : (
                  <div className="px-3 py-2.5 space-y-2">
                    <input autoFocus value={nameInput} onChange={(e) => setNameInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false) }}
                      placeholder="Tu nombre completo"
                      className="w-full text-sm border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500" />
                    <div className="flex gap-1.5">
                      <button onClick={handleSaveName} disabled={updateMe.isPending} className="flex-1 text-xs py-1.5 bg-brand-600 text-white rounded-md disabled:opacity-60">
                        {updateMe.isPending ? '...' : 'Guardar'}
                      </button>
                      <button onClick={() => setEditingName(false)} className="flex-1 text-xs py-1.5 border border-gray-200 text-gray-600 rounded-md">Cancelar</button>
                    </div>
                  </div>
                )}
                <div className="border-t border-gray-100">
                  <button onClick={handleLogout} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50">
                    🚪 Cerrar sesión
                  </button>
                </div>
              </div>
            )}
          </div>
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

      {/* ── Statement processing notification ── */}
      {notification && (
        <div className={`fixed bottom-20 md:bottom-6 right-4 z-50 flex items-start gap-3 rounded-xl border shadow-xl px-4 py-3 max-w-sm animate-slide-up ${
          notification.type === 'success'
            ? 'bg-green-50 border-green-300 text-green-900'
            : 'bg-red-50 border-red-300 text-red-900'
        }`}>
          <span className="text-xl shrink-0">{notification.type === 'success' ? '✅' : '❌'}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">
              {notification.type === 'success' ? 'Cartola procesada' : 'Error al procesar'}
            </p>
            <p className="text-xs opacity-75 truncate mt-0.5">{notification.filename}</p>
            {notification.type === 'success' && (
              <Link
                to="/gastos"
                onClick={clearNotification}
                className="text-xs font-medium text-green-700 underline mt-1 inline-block"
              >
                Ver gastos →
              </Link>
            )}
          </div>
          <button onClick={clearNotification} className="text-lg leading-none opacity-50 hover:opacity-100 shrink-0">×</button>
        </div>
      )}
    </div>
  )
}
