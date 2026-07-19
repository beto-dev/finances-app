import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import client from '../../shared/api/client'
import { FamilyMember } from '../../shared/types'
import { NAME_BY_EMAIL } from '../../shared/utils/memberNames'
import Spinner from '../../shared/components/Spinner'
import Toast from '../../shared/components/Toast'
import { useMyRole } from '../family/useMyRole'

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

interface Contribution {
  user_id: string
  percentage: number
}

interface ContributionsResponse {
  contributions: Contribution[]
  total: number
}

function formatCLP(v: number) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(v)
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

export default function ContributionsPage() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [localPcts, setLocalPcts] = useState<Record<string, string>>({})
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const queryClient = useQueryClient()
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)
  const { data: roleData } = useMyRole()
  const isAdmin = roleData?.role === 'admin'

  const { data: members = [], isLoading: loadingMembers } = useQuery<FamilyMember[]>({
    queryKey: ['family-members'],
    queryFn: async () => (await client.get('/api/families/me/members')).data,
  })

  const { data: saved, isLoading: loadingContribs } = useQuery<ContributionsResponse>({
    queryKey: ['contributions'],
    queryFn: async () => (await client.get('/api/families/me/contributions')).data,
  })

  const { data: familyCharges = [] } = useQuery<{ amount: number }[]>({
    queryKey: ['charges', 'family', month, year],
    queryFn: async () => (await client.get('/api/charges/family', { params: { month, year } })).data,
  })

  // Sync saved percentages → local state
  useEffect(() => {
    if (!saved || !members.length) return
    const map: Record<string, string> = {}
    for (const m of members) {
      const found = saved.contributions.find((c) => c.user_id === m.user_id)
      map[m.user_id] = found ? String(Number(found.percentage)) : '0'
    }
    setLocalPcts(map)
  }, [saved, members])

  const save = useMutation({
    mutationFn: async (items: Contribution[]) => {
      const res = await client.put('/api/families/me/contributions', items)
      return res.data as ContributionsResponse
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contributions'] })
      setToast({ message: 'Aportes guardados', type: 'success' })
    },
    onError: () => setToast({ message: 'Error al guardar', type: 'error' }),
  })

  const totalFamilyExpense = familyCharges.reduce((s, c) => s + Number(c.amount), 0)
  const totalPct = Object.values(localPcts).reduce((s, v) => s + (parseFloat(v) || 0), 0)
  const totalOff = Math.abs(totalPct - 100) > 0.01

  const handleSave = () => {
    const items = members.map((m) => ({
      user_id: m.user_id,
      percentage: parseFloat(localPcts[m.user_id] || '0'),
    }))
    save.mutate(items)
  }

  if (loadingMembers || loadingContribs) {
    return <div className="flex justify-center py-20"><Spinner size="lg" /></div>
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-5 md:mb-6">
        <h1 className="text-2xl font-bold text-[#18181B]">Aportes</h1>
        <p className="text-sm text-[#71717A] mt-0.5">
          Configura el porcentaje que cada miembro aporta a los gastos familiares
        </p>
      </div>

      {/* Percentage config */}
      <div className="card mb-5 md:mb-6">
        <h2 className="text-base font-bold text-[#27272A] mb-1">Porcentaje de aporte</h2>
        {!isAdmin && (
          <p className="text-xs text-[#A1A1AA] mb-3">Solo el administrador puede editar los aportes.</p>
        )}
        <div className="divide-y divide-[#F4F4F5]">
          {members.map((m) => {
            const name = NAME_BY_EMAIL[m.email.toLowerCase()] ?? m.email
            const pct = parseFloat(localPcts[m.user_id] || '0') || 0
            return (
              <div key={m.user_id} className="py-3.5 first:pt-1 last:pb-1 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center shrink-0">
                  <span className="text-[13px] font-bold text-brand-700">{initials(name)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[#18181B] truncate">{name}</p>
                  <p className="text-xs text-[#A1A1AA] truncate">{m.email}</p>
                  <div className="mt-2 h-1.5 bg-[#F4F4F5] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-500 rounded-full transition-all"
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={localPcts[m.user_id] ?? '0'}
                    onChange={(e) => setLocalPcts((prev) => ({ ...prev, [m.user_id]: e.target.value }))}
                    className="w-14 h-11 rounded-xl border border-[#E4E4E7] px-2 text-right text-sm font-bold focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-[#FAFAFA] disabled:text-[#A1A1AA] disabled:cursor-default"
                    disabled={!isAdmin}
                  />
                  <span className="text-sm text-[#71717A] font-medium">%</span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Total */}
        <div className={`mt-1 pt-3.5 border-t flex items-center justify-between gap-2 ${totalOff ? 'border-red-200' : 'border-[#F4F4F5]'}`}>
          <span className="text-sm font-bold text-[#27272A]">Total</span>
          <span className={`text-sm font-bold text-right ${totalOff ? 'text-red-600' : 'text-emerald-600'}`}>
            {totalPct.toFixed(2)}%
            {totalOff && <span className="font-normal ml-1 text-xs">(debe sumar 100%)</span>}
          </span>
        </div>

        {isAdmin && (
          <div className="mt-4">
            <button
              onClick={handleSave}
              disabled={save.isPending || totalOff}
              className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {save.isPending ? <Spinner size="sm" /> : 'Guardar aportes'}
            </button>
          </div>
        )}
      </div>

      {/* Monthly calculation */}
      <div className="card">
        <div className="mb-4">
          <h2 className="text-base font-bold text-[#27272A] mb-2.5">Cuánto aporta cada uno</h2>
          <div className="flex gap-2">
            <select className="input flex-1 text-sm" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
            <select className="input w-24 text-sm" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {totalFamilyExpense === 0 ? (
          <p className="text-sm text-[#A1A1AA] py-6 text-center">
            Sin gastos confirmados en {MONTHS[month - 1]} {year}
          </p>
        ) : (
          <>
            <div className="mb-3 pb-3 border-b border-[#F4F4F5] flex justify-between items-center text-sm">
              <span className="text-[#71717A]">Total gastos confirmados</span>
              <span className="font-bold text-[#18181B]">{formatCLP(totalFamilyExpense)}</span>
            </div>
            <div className="divide-y divide-[#F4F4F5]">
              {members.map((m) => {
                const name = NAME_BY_EMAIL[m.email.toLowerCase()] ?? m.email
                const pct = parseFloat(localPcts[m.user_id] || '0') || 0
                const amount = totalFamilyExpense * (pct / 100)
                return (
                  <div key={m.user_id} className="flex items-center justify-between gap-2 py-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-brand-50 flex items-center justify-center shrink-0">
                        <span className="text-[11px] font-bold text-brand-700">{initials(name)}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[#18181B] truncate">{name}</p>
                        <p className="text-xs text-[#A1A1AA]">{pct.toFixed(1)}%</p>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-[#18181B] shrink-0">{formatCLP(amount)}</span>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
