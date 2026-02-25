import { useState, FormEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
        <h3 className="text-base font-semibold text-gray-900">¿Eliminar a {displayName}?</h3>
        <p className="text-sm text-gray-500">
          Se eliminarán <span className="font-medium text-red-600">todas sus cartolas y movimientos</span> de la familia. Esta acción no se puede deshacer.
        </p>
        <div className="flex gap-3 pt-1">
          <button
            onClick={onCancel}
            disabled={isPending}
            className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="flex-1 px-4 py-2 rounded-xl bg-red-600 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
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

  const { data: family, isLoading: loadingFamily } = useFamilyInfo()
  const hasFamily = !!family
  const { data: members = [], isLoading: loadingMembers } = useFamilyMembers(hasFamily)
  const createFamily = useCreateFamily()
  const inviteMember = useInviteMember()
  const toggleActive = useToggleActive()
  const setRole = useSetRole()
  const removeMember = useRemoveMember()

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

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Familia</h1>

      {!family ? (
        <div className="card max-w-md">
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Crea tu familia</h2>
          <p className="text-sm text-gray-500 mb-4">
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
      ) : (
        <div className="space-y-6">
          {/* Family info */}
          <div className="card">
            <h2 className="text-base font-semibold text-gray-800 mb-1">{family.name}</h2>
            <p className="text-xs text-gray-400">
              Creada el {new Date(family.created_at).toLocaleDateString('es-ES')}
            </p>
          </div>

          {/* Members list */}
          <div className="card">
            <h2 className="text-base font-semibold text-gray-800 mb-4">Miembros</h2>
            {loadingMembers ? (
              <div className="flex justify-center py-4"><Spinner /></div>
            ) : members.length === 0 ? (
              <p className="text-sm text-gray-400">No hay miembros aún.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {members.map((m) => {
                  const isMe = m.user_id === user?.id
                  return (
                    <li
                      key={m.user_id}
                      className={`py-3 flex items-center justify-between gap-3 ${!m.is_active ? 'opacity-50' : ''}`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {NAME_BY_EMAIL[m.email.toLowerCase()] ?? m.email}
                          {isMe && <span className="ml-1 text-xs text-gray-400">(tú)</span>}
                          {!m.is_active && <span className="ml-2 text-xs text-gray-400 font-normal">(deshabilitado)</span>}
                        </p>
                        <p className="text-xs text-gray-400 truncate">{m.email}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          m.role === 'admin'
                            ? 'bg-brand-50 text-brand-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {ROLE_LABELS[m.role] ?? m.role}
                        </span>
                        {!isMe && (
                          <>
                            <button
                              onClick={() => handleToggleRole(m)}
                              disabled={setRole.isPending}
                              className="text-xs px-2 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                              title={m.role === 'admin' ? 'Quitar admin' : 'Hacer admin'}
                            >
                              {m.role === 'admin' ? 'Quitar admin' : 'Hacer admin'}
                            </button>
                            <button
                              onClick={() => handleToggleActive(m)}
                              disabled={toggleActive.isPending}
                              className={`text-xs px-2 py-1 rounded-lg border font-medium ${
                                m.is_active
                                  ? 'text-yellow-600 border-yellow-200 hover:bg-yellow-50'
                                  : 'text-green-600 border-green-200 hover:bg-green-50'
                              }`}
                            >
                              {m.is_active ? 'Deshabilitar' : 'Habilitar'}
                            </button>
                            <button
                              onClick={() => setConfirmMember(m)}
                              className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded-lg border border-red-200"
                            >
                              Eliminar
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* Invite member */}
          <div className="card max-w-md">
            <h2 className="text-base font-semibold text-gray-800 mb-4">Invitar miembro</h2>
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
              <p className="text-xs text-gray-400">
                El usuario debe estar registrado en Finanzas para poder ser invitado.
              </p>
              <button type="submit" className="btn-primary" disabled={inviteMember.isPending}>
                {inviteMember.isPending ? <Spinner size="sm" /> : 'Invitar'}
              </button>
            </form>
          </div>
        </div>
      )}

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
