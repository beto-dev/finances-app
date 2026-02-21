import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import client from '../../shared/api/client'
import { FamilyMember } from '../../shared/types'
import { NAME_BY_EMAIL } from '../../shared/utils/memberNames'
import Spinner from '../../shared/components/Spinner'
import Toast from '../../shared/components/Toast'

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

export default function ContributionsPage() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [localPcts, setLocalPcts] = useState<Record<string, string>>({})
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const queryClient = useQueryClient()
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)

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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Aportes</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Configura el porcentaje que cada miembro aporta a los gastos familiares
        </p>
      </div>

      {/* Percentage config */}
      <div className="card mb-6">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Porcentaje de aporte</h2>
        <div className="space-y-3">
          {members.map((m) => {
            const name = NAME_BY_EMAIL[m.email.toLowerCase()] ?? m.email
            const pct = parseFloat(localPcts[m.user_id] || '0') || 0
            return (
              <div key={m.user_id} className="flex items-center gap-4">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800">{name}</p>
                  <p className="text-xs text-gray-400">{m.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={localPcts[m.user_id] ?? '0'}
                    onChange={(e) => setLocalPcts((prev) => ({ ...prev, [m.user_id]: e.target.value }))}
                    className="input w-24 text-right"
                  />
                  <span className="text-sm text-gray-500 w-4">%</span>
                </div>
                {/* Visual bar */}
                <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand-500 rounded-full transition-all"
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>

        {/* Total */}
        <div className={`mt-4 pt-4 border-t flex items-center justify-between ${totalOff ? 'border-red-200' : 'border-gray-100'}`}>
          <span className="text-sm font-medium text-gray-700">Total</span>
          <span className={`text-sm font-bold ${totalOff ? 'text-red-600' : 'text-green-600'}`}>
            {totalPct.toFixed(2)}%
            {totalOff && <span className="font-normal ml-1 text-xs">(debe sumar 100%)</span>}
          </span>
        </div>

        <div className="mt-4">
          <button
            onClick={handleSave}
            disabled={save.isPending}
            className="btn-primary"
          >
            {save.isPending ? <Spinner size="sm" /> : 'Guardar aportes'}
          </button>
        </div>
      </div>

      {/* Monthly calculation */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800">Cuánto aporta cada uno</h2>
          <div className="flex gap-2">
            <select className="input w-36 text-sm" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
            <select className="input w-24 text-sm" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {totalFamilyExpense === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">
            Sin gastos confirmados en {MONTHS[month - 1]} {year}
          </p>
        ) : (
          <>
            <div className="mb-3 pb-3 border-b border-gray-100 flex justify-between text-sm">
              <span className="text-gray-500">Total gastos confirmados</span>
              <span className="font-semibold text-gray-900">{formatCLP(totalFamilyExpense)}</span>
            </div>
            <div className="space-y-2">
              {members.map((m) => {
                const name = NAME_BY_EMAIL[m.email.toLowerCase()] ?? m.email
                const pct = parseFloat(localPcts[m.user_id] || '0') || 0
                const amount = totalFamilyExpense * (pct / 100)
                return (
                  <div key={m.user_id} className="flex items-center justify-between py-1">
                    <div>
                      <span className="text-sm font-medium text-gray-800">{name}</span>
                      <span className="text-xs text-gray-400 ml-2">{pct.toFixed(1)}%</span>
                    </div>
                    <span className="text-sm font-semibold text-gray-900">{formatCLP(amount)}</span>
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
