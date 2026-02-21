import { useState, FormEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import client from '../../shared/api/client'
import { Family, FamilyMember } from '../../shared/types'
import Spinner from '../../shared/components/Spinner'
import Toast from '../../shared/components/Toast'

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

const ROLE_LABELS: Record<string, string> = {
  owner: 'Propietario',
  member: 'Miembro',
}

import { NAME_BY_EMAIL } from '../../shared/utils/memberNames'

export default function FamilyPage() {
  const [newFamilyName, setNewFamilyName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const { data: family, isLoading: loadingFamily } = useFamilyInfo()
  const hasFamily = !!family
  const { data: members = [], isLoading: loadingMembers } = useFamilyMembers(hasFamily)
  const createFamily = useCreateFamily()
  const inviteMember = useInviteMember()

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
        /* No family yet — create one */
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
                {members.map((m) => (
                  <li key={m.user_id} className="py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-800">
                        {NAME_BY_EMAIL[m.email.toLowerCase()] ?? m.email}
                      </p>
                      <p className="text-xs text-gray-400">{m.email}</p>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 font-medium">
                      {ROLE_LABELS[m.role] ?? m.role}
                    </span>
                  </li>
                ))}
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

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
