import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pencil, ChevronRight, LogOut, UserCog, Home, Tag, Wallet, MessageCircle } from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import { useMe, useUpdateMe } from '../auth/useMe'
import { useMyRole } from '../family/useMyRole'
import Spinner from '../../shared/components/Spinner'

export default function ProfilePage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { data: roleData } = useMyRole()
  const isAdmin = roleData?.role === 'admin'
  const hasFamily = roleData?.role != null
  const canSeeFamily = roleData?.role != null && roleData.role !== 'member'

  useMe()
  const updateMe = useUpdateMe()
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')

  const initial = (user?.full_name ?? user?.email ?? '?')[0].toUpperCase()

  const startEdit = () => {
    setNameInput(user?.full_name ?? '')
    setEditingName(true)
  }

  const saveName = async () => {
    if (!nameInput.trim()) return
    await updateMe.mutateAsync(nameInput.trim())
    setEditingName(false)
  }

  const menuItems = [
    { label: 'Asistente', icon: MessageCircle, onClick: () => navigate('/chat') },
    ...(hasFamily
      ? [{ label: 'Aportes', icon: Wallet, onClick: () => navigate('/aportes') }]
      : []),
    ...(canSeeFamily
      ? [{
          label: isAdmin ? 'Miembros de la familia' : 'Crear familia',
          icon: isAdmin ? UserCog : Home,
          onClick: () => navigate('/familia'),
        }]
      : []),
    ...(isAdmin
      ? [{ label: 'Categorías', icon: Tag, onClick: () => navigate('/categorias') }]
      : []),
  ]

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-bold text-[#18181B] mb-6">Perfil</h1>

      <div className="card flex items-center gap-3.5 mb-4">
        <div className="w-14 h-14 rounded-full bg-brand-600 flex items-center justify-center text-white font-extrabold text-xl shrink-0">
          {initial}
        </div>
        {editingName ? (
          <div className="flex-1 min-w-0 space-y-2">
            <input
              autoFocus
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false) }}
              placeholder="Tu nombre completo"
              className="input py-1.5 text-sm"
            />
            <div className="flex gap-1.5">
              <button onClick={saveName} disabled={updateMe.isPending} className="btn-primary text-xs py-1.5 px-3 min-h-0">
                {updateMe.isPending ? <Spinner size="sm" /> : 'Guardar'}
              </button>
              <button onClick={() => setEditingName(false)} className="btn-secondary text-xs py-1.5 px-3 min-h-0">
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-w-0">
            <p className="font-extrabold text-base text-[#18181B] truncate">{user?.full_name ?? 'Sin nombre'}</p>
            <p className="text-xs text-[#A1A1AA] font-semibold truncate">{user?.email}</p>
          </div>
        )}
        {!editingName && (
          <button onClick={startEdit} className="text-[#A1A1AA] hover:text-brand-600 transition-colors shrink-0 p-1" title="Editar nombre">
            <Pencil className="w-4 h-4" />
          </button>
        )}
      </div>

      {menuItems.length > 0 && (
        <div className="card p-0 overflow-hidden mb-4 divide-y divide-[#F4F4F5]">
          {menuItems.map((item) => (
            <button
              key={item.label}
              onClick={item.onClick}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-[#FAFAFA] transition-colors"
            >
              <span className="w-9 h-9 rounded-[11px] bg-brand-50 flex items-center justify-center shrink-0">
                <item.icon className="w-[18px] h-[18px] text-brand-600" />
              </span>
              <span className="flex-1 text-sm font-bold text-[#27272A]">{item.label}</span>
              <ChevronRight className="w-4 h-4 text-[#D4D4D8]" />
            </button>
          ))}
        </div>
      )}

      <button
        onClick={() => { logout(); navigate('/login') }}
        className="w-full flex items-center justify-center gap-2 bg-white border border-rose-200 text-rose-600 rounded-2xl py-3.5 text-sm font-extrabold hover:bg-rose-50 transition-colors"
      >
        <LogOut className="w-4 h-4" />
        Cerrar sesión
      </button>
    </div>
  )
}
