import { useState } from 'react'
import { NavLink, Outlet, useNavigate, useLocation, Link } from 'react-router-dom'
import {
  BarChart2, Plus, Upload, List, Hash, Users, ListChecks, Wallet,
  UserCog, Home, Tag, LogOut, Pencil, ChevronDown, CheckCircle, XCircle,
} from 'lucide-react'
import { useAuth } from '../../features/auth/useAuth'
import { useMyRole } from '../../features/family/useMyRole'
import { useStatementNotifier } from '../../features/upload/useUpload'
import { useMe, useUpdateMe } from '../../features/auth/useMe'

type NavItem = { to: string; label: string; icon: React.ElementType }

const topItems: NavItem[] = [
  { to: '/resumen',     label: 'Resumen',       icon: BarChart2  },
  { to: '/nuevo-gasto', label: 'Nuevo Gasto',    icon: Plus       },
  { to: '/cargar',      label: 'Subir Cartola',  icon: Upload     },
  { to: '/gastos',      label: 'Gastos',         icon: List       },
  { to: '/cuotas',      label: 'Cuotas',         icon: Hash       },
]

const familyItems: NavItem[] = [
  { to: '/gastos-familia', label: 'Gastos Familia', icon: ListChecks },
  { to: '/aportes',        label: 'Aportes',         icon: Wallet    },
]

const familyRoutes = [...familyItems.map((i) => i.to), '/familia', '/categorias']

const mobileTabItems = [
  { to: '/resumen',        icon: BarChart2, label: 'Resumen' },
  { to: '/gastos',         icon: List,      label: 'Gastos'  },
  { to: '/cargar',         icon: Upload,    label: 'Subir',  fab: true },
  { to: '/gastos-familia', icon: Users,     label: 'Familia' },
  { to: '/aportes',        icon: Wallet,    label: 'Aportes' },
]

function RailItem({ to, label, Icon }: { to: string; label: string; Icon: React.ElementType }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center h-10 w-full rounded-lg transition-colors duration-150 ${
          isActive
            ? 'bg-brand-600/20 text-brand-400'
            : 'text-white/50 hover:bg-white/[0.07] hover:text-white/85'
        }`
      }
    >
      <span className="w-12 flex items-center justify-center shrink-0">
        <Icon className="w-[18px] h-[18px]" />
      </span>
      <span className="text-sm font-medium whitespace-nowrap opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-150 pr-4">
        {label}
      </span>
    </NavLink>
  )
}

export default function Layout() {
  const { user, logout } = useAuth()
  const { data: roleData } = useMyRole()
  const isAdmin = roleData?.role === 'admin'
  const hasFamily = roleData?.role != null
  const navigate = useNavigate()
  const { pathname } = useLocation()

  useMe()
  const updateMe = useUpdateMe()

  const [familyOpen, setFamilyOpen] = useState(() => familyRoutes.includes(pathname))
  const [profileOpen, setProfileOpen] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const { notification, clearNotification } = useStatementNotifier()

  const handleLogout = () => { logout(); navigate('/login') }

  const handleSaveName = async () => {
    if (!nameInput.trim()) return
    await updateMe.mutateAsync(nameInput.trim())
    setEditingName(false)
    setProfileOpen(false)
  }

  const initial = (user?.full_name ?? user?.email ?? '?')[0].toUpperCase()

  return (
    <div className="bg-[#F8FAFC] min-h-screen">

      {/* ── Desktop sidebar rail ── */}
      <aside className="group/sidebar hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-16 hover:w-56 transition-[width] duration-200 ease-in-out bg-[#111111] z-30 overflow-hidden">

        {/* Logo */}
        <div className="h-16 flex items-center shrink-0 border-b border-white/[0.07]">
          <span className="w-12 flex items-center justify-center shrink-0">
            <span className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center text-white font-bold text-sm">
              F
            </span>
          </span>
          <span className="text-white font-bold text-base whitespace-nowrap opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-150 pr-4">
            Finanzas
          </span>
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-2 px-2 overflow-y-auto overflow-x-hidden space-y-0.5">
          {topItems.map((item) => (
            <RailItem key={item.to} to={item.to} label={item.label} Icon={item.icon} />
          ))}

          {/* Familia group */}
          <div>
            <button
              onClick={() => setFamilyOpen((o) => !o)}
              className="flex items-center h-10 w-full rounded-lg text-white/50 hover:bg-white/[0.07] hover:text-white/85 transition-colors duration-150"
            >
              <span className="w-12 flex items-center justify-center shrink-0">
                <Users className="w-[18px] h-[18px]" />
              </span>
              <span className="flex-1 text-sm font-medium whitespace-nowrap text-left opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-150">
                Familia
              </span>
              <span className="opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-150 pr-3">
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${familyOpen ? 'rotate-180' : ''}`} />
              </span>
            </button>

            {familyOpen && (
              <div className="mt-0.5 ml-10 pl-2 border-l border-white/[0.08] space-y-0.5">
                {hasFamily && familyItems.map((item) => (
                  <RailItem key={item.to} to={item.to} label={item.label} Icon={item.icon} />
                ))}
                {roleData?.role !== 'member' && (
                  <RailItem
                    to="/familia"
                    label={isAdmin ? 'Miembros' : 'Crear familia'}
                    Icon={isAdmin ? UserCog : Home}
                  />
                )}
                {isAdmin && (
                  <RailItem to="/categorias" label="Categorías" Icon={Tag} />
                )}
              </div>
            )}
          </div>
        </nav>

        {/* User profile */}
        <div className="border-t border-white/[0.07] px-2 py-2 shrink-0 relative">
          <button
            onClick={() => { setProfileOpen((o) => !o); setEditingName(false) }}
            className="flex items-center h-12 w-full rounded-lg hover:bg-white/[0.07] transition-colors duration-150"
          >
            <span className="w-12 flex items-center justify-center shrink-0">
              <span className="w-8 h-8 rounded-full bg-brand-600/25 text-brand-400 flex items-center justify-center text-sm font-semibold">
                {initial}
              </span>
            </span>
            <div className="flex-1 min-w-0 opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-150 pr-3 text-left">
              <p className="text-sm font-medium text-white/90 truncate">{user?.full_name ?? 'Mi perfil'}</p>
              <p className="text-xs text-white/40 truncate">{user?.email}</p>
            </div>
          </button>

          {profileOpen && (
            <div className="absolute bottom-full left-2 right-2 mb-2 bg-[#1C1C1E] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
              <div className="px-3 py-2.5 border-b border-white/[0.07]">
                <p className="text-sm font-medium text-white/90 truncate">{user?.full_name ?? 'Sin nombre'}</p>
                <p className="text-xs text-white/40 truncate">{user?.email}</p>
              </div>
              {!editingName ? (
                <button
                  onClick={() => { setNameInput(user?.full_name ?? ''); setEditingName(true) }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-white/70 hover:bg-white/[0.06] hover:text-white/90 transition-colors"
                >
                  <Pencil className="w-4 h-4 shrink-0" />
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
                    className="w-full text-sm bg-white/[0.08] border border-white/10 rounded-lg px-3 py-1.5 text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <div className="flex gap-1.5">
                    <button onClick={handleSaveName} disabled={updateMe.isPending}
                      className="flex-1 text-xs py-1.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-60 transition-colors">
                      {updateMe.isPending ? '...' : 'Guardar'}
                    </button>
                    <button onClick={() => setEditingName(false)}
                      className="flex-1 text-xs py-1.5 border border-white/10 text-white/60 rounded-lg hover:bg-white/[0.06] transition-colors">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
              <div className="border-t border-white/[0.07]">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <LogOut className="w-4 h-4 shrink-0" />
                  Cerrar sesión
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="md:pl-16 flex flex-col min-h-screen">

        {/* Mobile top bar */}
        <header className="md:hidden flex items-center justify-between px-4 h-14 bg-white border-b border-[#E2E8F0] sticky top-0 z-10">
          <span className="text-base font-bold text-[#0F172A]">Finanzas</span>
          <div className="relative">
            <button
              onClick={() => { setProfileOpen((o) => !o); setEditingName(false) }}
              className="w-9 h-9 rounded-full bg-brand-600/10 text-brand-600 flex items-center justify-center text-sm font-semibold"
            >
              {initial}
            </button>
            {profileOpen && (
              <div className="absolute right-0 top-11 w-60 bg-white border border-[#E2E8F0] rounded-2xl shadow-xl overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-[#F1F5F9]">
                  <p className="text-sm font-semibold text-[#0F172A] truncate">{user?.full_name ?? 'Sin nombre'}</p>
                  <p className="text-xs text-[#94A3B8] truncate">{user?.email}</p>
                </div>
                {!editingName ? (
                  <button onClick={() => { setNameInput(user?.full_name ?? ''); setEditingName(true) }}
                    className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-[#0F172A] hover:bg-[#F8FAFC] transition-colors">
                    <Pencil className="w-4 h-4 text-[#64748B]" /> Editar nombre
                  </button>
                ) : (
                  <div className="px-4 py-3 space-y-2">
                    <input autoFocus value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false) }}
                      placeholder="Tu nombre completo"
                      className="w-full text-sm border border-[#E2E8F0] rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-600" />
                    <div className="flex gap-1.5">
                      <button onClick={handleSaveName} disabled={updateMe.isPending}
                        className="flex-1 text-xs py-1.5 bg-brand-600 text-white rounded-lg disabled:opacity-60">
                        {updateMe.isPending ? '...' : 'Guardar'}
                      </button>
                      <button onClick={() => setEditingName(false)}
                        className="flex-1 text-xs py-1.5 border border-[#E2E8F0] text-[#64748B] rounded-lg">
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
                <div className="border-t border-[#F1F5F9]">
                  <button onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-red-500 hover:bg-red-50 transition-colors">
                    <LogOut className="w-4 h-4" /> Cerrar sesión
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1">
          <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 pb-[calc(90px+env(safe-area-inset-bottom))] md:pb-8">
            <Outlet />
          </div>
        </main>
      </div>

      {/* ── Mobile bottom tab bar ── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[#E2E8F0] z-50 flex items-end"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {mobileTabItems.map(({ to, icon: Icon, label, fab }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              fab
                ? 'flex-1 flex flex-col items-center justify-center pb-3 pt-1'
                : `flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-all active:scale-90 ${
                    isActive ? 'opacity-100' : 'opacity-40'
                  }`
            }
          >
            {({ isActive }) =>
              fab ? (
                <span className={`flex items-center justify-center w-14 h-14 rounded-2xl shadow-lg transition-transform active:scale-95 ${
                  isActive ? 'bg-brand-700' : 'bg-brand-600'
                }`}>
                  <Icon className="w-6 h-6 text-white" />
                </span>
              ) : (
                <>
                  <Icon className={`w-5 h-5 ${isActive ? 'text-brand-600' : 'text-[#94A3B8]'}`} />
                  <span className={`text-[11px] font-medium leading-none ${isActive ? 'text-brand-600' : 'text-[#94A3B8]'}`}>
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
        <div className={`fixed bottom-20 md:bottom-6 right-4 z-50 flex items-start gap-3 rounded-2xl border shadow-xl px-4 py-3 max-w-sm animate-slide-up ${
          notification.type === 'success'
            ? 'bg-white border-emerald-200 text-[#0F172A]'
            : 'bg-white border-red-200 text-[#0F172A]'
        }`}>
          {notification.type === 'success'
            ? <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
            : <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          }
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">
              {notification.type === 'success' ? 'Cartola procesada' : 'Error al procesar'}
            </p>
            <p className="text-xs text-[#64748B] truncate mt-0.5">{notification.filename}</p>
            {notification.type === 'success' && (
              <Link
                to="/gastos"
                onClick={clearNotification}
                className="text-xs font-medium text-brand-600 underline mt-1 inline-block"
              >
                Ver gastos →
              </Link>
            )}
          </div>
          <button onClick={clearNotification} className="text-[#94A3B8] hover:text-[#0F172A] transition-colors shrink-0">
            <span className="text-lg leading-none">×</span>
          </button>
        </div>
      )}
    </div>
  )
}
