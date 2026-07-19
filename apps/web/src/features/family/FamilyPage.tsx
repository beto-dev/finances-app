import { useState, FormEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Home, Pencil, UserPlus, Crown, ShieldOff, UserCheck, UserX, Trash2 } from 'lucide-react'
import client from '../../shared/api/client'
import { Family, FamilyMember } from '../../shared/types'
import Spinner from '../../shared/components/Spinner'
import Toast from '../../shared/components/Toast'
import { useAuth } from '../auth/useAuth'

function useFamilyInfo() {
  return useQuery<Family>({
    queryKey: ['family'],
    queryFn: async () => {
      const res = await client.get('/api/families/me')
      return res.data
    },
    retry: false,
  })
}

function useFamilyMembers(hasFamily: boolean) {
  return useQuery<FamilyMember[]>({
    queryKey: ['family-members'],
    queryFn: async () => {
      const res = await client.get('/api/families/me/members')
      return res.data
    },
    enabled: hasFamily,
  })
}

function useCreateFamily() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => {
      const res = await client.post('/api/families/', { name })
      return res.data as Family
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['family'] })
      queryClient.invalidateQueries({ queryKey: ['family-members'] })
      queryClient.invalidateQueries({ queryKey: ['my-role'] })
    },
  })
}

function useInviteMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (email: string) => {
      const res = await client.post('/api/families/me/invite', { email })
      return res.data as FamilyMember
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['family-members'] })
    },
  })
}

function useToggleActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, is_active }: { userId: string; is_active: boolean }) =>
      client.patch(`/api/families/me/members/${userId}/active`, { is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['family-members'] }),
  })
}

function useSetRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      client.patch(`/api/families/me/members/${userId}/role`, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['family-members'] })
      queryClient.invalidateQueries({ queryKey: ['my-role'] })
    },
  })
}

function useRenameFamily() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => {
      const res = await client.patch('/api/families/me', { name })
      return res.data as Family
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['family'] }),
  })
}

function useRemoveMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) =>
      client.delete(`/api/families/me/members/${userId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['family-members'] }),
  })
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  member: 'Miembro',
}

import { NAME_BY_EMAIL } from '../../shared/utils/memberNames'

// ── Confirmation dialog ────────────────────────────────────────────────────
function ConfirmDialog({
  member,
  onConfirm,
  onCancel,
  isPending,
}: {
  member: FamilyMember
  onConfirm: () => void
  onCancel: () => void
  isPending: boolean
}) {
  const displayName = NAME_BY_EMAIL[member.email.toLowerCase()] ?? member.email
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <h3 className="text-base font-extrabold text-[#18181B]">¿Eliminar a {displayName}?</h3>
        <p className="text-sm text-[#71717A]">
          Se eliminarán <span className="font-semibold text-red-600">todas sus cartolas y movimientos</span> de la familia. Esta acción no se puede deshacer.
        </p>
        <div className="flex gap-3 pt-1">
          <button
            onClick={onCancel}
            disabled={isPending}
            className="btn-secondary flex-1"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="flex-1 inline-flex items-center justify-center px-5 py-3 rounded-xl bg-red-600 text-sm font-semibold text-white hover:bg-red-700 active:scale-[0.97] disabled:opacity-50 transition-all min-h-[44px]"
          >
            {isPending ? <Spinner size="sm" /> : 'Eliminar todo'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function FamilyPage() {
  const { user } = useAuth()
  const [newFamilyName, setNewFamilyName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [confirmMember, setConfirmMember] = useState<FamilyMember | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [editName, setEditName] = useState('')

  const { data: family, isLoading: loadingFamily } = useFamilyInfo()
  const hasFamily = !!family
  const { data: members = [], isLoading: loadingMembers } = useFamilyMembers(hasFamily)
  const createFamily = useCreateFamily()
  const inviteMember = useInviteMember()
  const toggleActive = useToggleActive()
  const setRole = useSetRole()
  const removeMember = useRemoveMember()
  const renameFamily = useRenameFamily()

  const handleRename = async (e: FormEvent) => {
    e.preventDefault()
    if (!editName.trim()) return
    try {
      await renameFamily.mutateAsync(editName.trim())
      setEditingName(false)
      setToast({ message: 'Nombre actualizado', type: 'success' })
    } catch {
      setToast({ message: 'Error al renombrar la familia', type: 'error' })
    }
  }

  const handleCreateFamily = async (e: FormEvent) => {
    e.preventDefault()
    if (!newFamilyName.trim()) return
    try {
      await createFamily.mutateAsync(newFamilyName.trim())
      setNewFamilyName('')
      setToast({ message: 'Familia creada exitosamente', type: 'success' })
    } catch {
      setToast({ message: 'Error al crear la familia', type: 'error' })
    }
  }

  const handleInvite = async (e: FormEvent) => {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    try {
      await inviteMember.mutateAsync(inviteEmail.trim())
      setInviteEmail('')
      setToast({ message: `Invitación enviada a ${inviteEmail}`, type: 'success' })
    } catch (err: any) {
      const detail = err.response?.data?.detail || 'Error al invitar al miembro'
      setToast({ message: detail, type: 'error' })
    }
  }

  const handleToggleActive = async (member: FamilyMember) => {
    try {
      await toggleActive.mutateAsync({ userId: member.user_id, is_active: !member.is_active })
      setToast({ message: member.is_active ? 'Usuario deshabilitado' : 'Usuario habilitado', type: 'success' })
    } catch {
      setToast({ message: 'Error al cambiar el estado del usuario', type: 'error' })
    }
  }

  const handleToggleRole = async (member: FamilyMember) => {
    const newRole = member.role === 'admin' ? 'member' : 'admin'
    try {
      await setRole.mutateAsync({ userId: member.user_id, role: newRole })
      setToast({ message: newRole === 'admin' ? 'Usuario promovido a Admin' : 'Permisos de Admin removidos', type: 'success' })
    } catch (err: any) {
      const detail = err.response?.data?.detail || 'Error al cambiar el rol'
      setToast({ message: detail, type: 'error' })
    }
  }

  const handleConfirmDelete = async () => {
    if (!confirmMember) return
    try {
      await removeMember.mutateAsync(confirmMember.user_id)
      setConfirmMember(null)
      setToast({ message: 'Usuario eliminado', type: 'success' })
    } catch {
      setToast({ message: 'Error al eliminar el usuario', type: 'error' })
    }
  }

  if (loadingFamily) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!family) {
    return (
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold text-[#18181B] mb-5">Familia</h1>
        <div className="card">
          <div className="w-12 h-12 rounded-full bg-brand-50 flex items-center justify-center mb-3">
            <Home className="w-6 h-6 text-brand-600" />
          </div>
          <h2 className="text-base font-extrabold text-[#18181B] mb-1.5">Crea tu familia</h2>
          <p className="text-sm text-[#71717A] mb-4">
            Aún no perteneces a ninguna familia. Crea una para empezar a compartir finanzas.
          </p>
          <form onSubmit={handleCreateFamily} className="space-y-3">
            <div>
              <label className="label">Nombre de la familia</label>
              <input
                type="text"
                className="input"
                placeholder="ej. Familia García"
                value={newFamilyName}
                onChange={(e) => setNewFamilyName(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn-primary w-full" disabled={createFamily.isPending}>
              {createFamily.isPending ? <Spinner size="sm" /> : 'Crear familia'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-bold text-[#18181B] mb-5">Familia</h1>

      {/* Family info */}
      <div className="card flex items-center gap-3.5 mb-5">
        <div className="w-14 h-14 rounded-full bg-brand-600 flex items-center justify-center text-white shrink-0">
          <Home className="w-6 h-6" />
        </div>
        {editingName ? (
          <form onSubmit={handleRename} className="flex-1 min-w-0 flex flex-col gap-2">
            <input
              autoFocus
              type="text"
              className="input py-2 text-sm"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              required
            />
            <div className="flex gap-1.5">
              <button type="submit" className="btn-primary text-xs py-1.5 px-3 min-h-0" disabled={renameFamily.isPending}>
                {renameFamily.isPending ? <Spinner size="sm" /> : 'Guardar'}
              </button>
              <button type="button" onClick={() => setEditingName(false)} className="btn-secondary text-xs py-1.5 px-3 min-h-0">
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="flex-1 min-w-0">
              <p className="font-extrabold text-base text-[#18181B] truncate">{family.name}</p>
              <p className="text-xs text-[#A1A1AA] font-semibold truncate">
                Creada el {new Date(family.created_at).toLocaleDateString('es-ES')}
              </p>
            </div>
            <button
              onClick={() => { setEditName(family.name); setEditingName(true) }}
              className="text-[#A1A1AA] hover:text-brand-600 transition-colors shrink-0 p-1"
              title="Renombrar familia"
            >
              <Pencil className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {/* Members list */}
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-sm font-bold text-[#27272A]">Miembros</p>
        <span className="text-xs text-[#A1A1AA] font-semibold">
          {members.length} {members.length === 1 ? 'miembro' : 'miembros'}
        </span>
      </div>

      {loadingMembers ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : members.length === 0 ? (
        <p className="text-sm text-[#A1A1AA] text-center py-6">No hay miembros aún.</p>
      ) : (
        <div className="flex flex-col gap-2.5 mb-5">
          {members.map((m) => {
            const isMe = m.user_id === user?.id
            const displayName = NAME_BY_EMAIL[m.email.toLowerCase()] ?? m.email
            const initial = displayName[0]?.toUpperCase() ?? '?'
            return (
              <div
                key={m.user_id}
                className={`bg-white border border-[#ECECEF] rounded-2xl p-3.5 ${!m.is_active ? 'opacity-50' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 font-extrabold text-sm ${
                    m.is_active ? 'bg-brand-100 text-brand-700' : 'bg-[#F4F4F5] text-[#A1A1AA]'
                  }`}>
                    {initial}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[#18181B] truncate">
                      {displayName}
                      {isMe && <span className="ml-1 text-xs text-[#A1A1AA] font-medium">(tú)</span>}
                    </p>
                    <p className="text-xs text-[#A1A1AA] truncate">
                      {m.email}
                      {!m.is_active && <span className="ml-1.5 text-[#A1A1AA]">· deshabilitado</span>}
                    </p>
                  </div>
                  <span className={`text-[10px] px-2 py-1 rounded-full font-extrabold uppercase tracking-wide shrink-0 ${
                    m.role === 'admin'
                      ? 'bg-brand-50 text-brand-700'
                      : 'bg-[#F4F4F5] text-[#71717A]'
                  }`}>
                    {ROLE_LABELS[m.role] ?? m.role}
                  </span>
                </div>

                {!isMe && (
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[#F4F4F5]">
                    <button
                      onClick={() => handleToggleRole(m)}
                      disabled={setRole.isPending}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-[44px] rounded-xl border border-[#E4E4E7] text-xs font-bold text-[#52525B] hover:bg-[#FAFAFA] disabled:opacity-50 transition-colors"
                      title={m.role === 'admin' ? 'Quitar admin' : 'Hacer admin'}
                    >
                      {m.role === 'admin' ? <ShieldOff className="w-3.5 h-3.5" /> : <Crown className="w-3.5 h-3.5" />}
                      {m.role === 'admin' ? 'Quitar admin' : 'Hacer admin'}
                    </button>
                    <button
                      onClick={() => handleToggleActive(m)}
                      disabled={toggleActive.isPending}
                      className={`flex-1 inline-flex items-center justify-center gap-1.5 min-h-[44px] rounded-xl border text-xs font-bold disabled:opacity-50 transition-colors ${
                        m.is_active
                          ? 'text-amber-600 border-amber-200 hover:bg-amber-50'
                          : 'text-emerald-600 border-emerald-200 hover:bg-emerald-50'
                      }`}
                      title={m.is_active ? 'Deshabilitar' : 'Habilitar'}
                    >
                      {m.is_active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                      {m.is_active ? 'Deshabilitar' : 'Habilitar'}
                    </button>
                    <button
                      onClick={() => setConfirmMember(m)}
                      className="w-11 min-h-[44px] shrink-0 inline-flex items-center justify-center rounded-xl border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
                      title="Eliminar miembro"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Invite member */}
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-9 h-9 rounded-[11px] bg-brand-50 flex items-center justify-center shrink-0">
            <UserPlus className="w-[18px] h-[18px] text-brand-600" />
          </span>
          <h2 className="text-sm font-bold text-[#27272A]">Invitar miembro</h2>
        </div>
        <form onSubmit={handleInvite} className="space-y-3">
          <div>
            <label className="label">Correo electrónico</label>
            <input
              type="email"
              className="input"
              placeholder="familiar@correo.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
            />
          </div>
          <p className="text-xs text-[#A1A1AA]">
            El usuario debe estar registrado en Finanzas para poder ser invitado.
          </p>
          <button type="submit" className="btn-primary w-full" disabled={inviteMember.isPending}>
            {inviteMember.isPending ? <Spinner size="sm" /> : 'Invitar'}
          </button>
        </form>
      </div>

      {confirmMember && (
        <ConfirmDialog
          member={confirmMember}
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmMember(null)}
          isPending={removeMember.isPending}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
