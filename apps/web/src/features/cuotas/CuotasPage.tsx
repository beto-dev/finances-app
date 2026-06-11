import { useState } from 'react'
import { useCharges } from '../charges/useCharges'
import { useCredits, useCreateCredit, useUpdateCredit, useDeleteCredit } from './useCredits'
import Spinner from '../../shared/components/Spinner'
import type { Credit } from '../../shared/types'
import { groupCuotas } from '../../shared/utils/cuotas'

function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = Math.min(100, Math.round((value / total) * 100))
  const done = value >= total
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${done ? 'bg-green-500' : 'bg-brand-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-gray-400 shrink-0">{pct}%</span>
    </div>
  )
}

const EMPTY_FORM = { description: '', bank: '', cuota_monto: '', cuota_numero: '1', cuota_total: '' }

function CreditFormRow({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: typeof EMPTY_FORM
  onSave: (v: typeof EMPTY_FORM) => void
  onCancel: () => void
  saving: boolean
}) {
  const [v, setV] = useState(initial)
  const set = (k: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setV((p) => ({ ...p, [k]: e.target.value }))
  const valid = v.description.trim() && Number(v.cuota_monto) > 0 && Number(v.cuota_total) >= Number(v.cuota_numero) && Number(v.cuota_numero) >= 1
  return (
    <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <input className="input col-span-2" placeholder="Descripción (ej: Crédito de consumo BCI)" value={v.description} onChange={set('description')} />
        <input className="input" placeholder="Banco (opcional)" value={v.bank} onChange={set('bank')} />
        <input className="input" placeholder="Dividendo mensual $" type="number" min="1" value={v.cuota_monto} onChange={set('cuota_monto')} />
        <input className="input" placeholder="Cuota actual (ej: 3)" type="number" min="1" value={v.cuota_numero} onChange={set('cuota_numero')} />
        <input className="input" placeholder="Total cuotas (ej: 48)" type="number" min="1" value={v.cuota_total} onChange={set('cuota_total')} />
      </div>
      <div className="flex gap-2 justify-end">
        <button className="btn-ghost text-sm" onClick={onCancel} disabled={saving}>Cancelar</button>
        <button className="btn-primary text-sm" onClick={() => onSave(v)} disabled={!valid || saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

export default function CuotasPage() {
  const { data: charges, isLoading: chargesLoading } = useCharges()
  const { data: credits = [], isLoading: creditsLoading } = useCredits()
  const createCredit = useCreateCredit()
  const updateCredit = useUpdateCredit()
  const deleteCredit = useDeleteCredit()

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const groups = groupCuotas(charges)
  const active = groups.filter((g) => g.cuota_numero < g.cuota_total)
  const finished = groups.filter((g) => g.cuota_numero >= g.cuota_total)

  const activeCredits = credits.filter((c) => c.cuota_numero < c.cuota_total)
  const finishedCredits = credits.filter((c) => c.cuota_numero >= c.cuota_total)

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

  const handleCreate = (v: typeof EMPTY_FORM) => {
    createCredit.mutate(
      { description: v.description.trim(), bank: v.bank.trim() || null, cuota_monto: Number(v.cuota_monto), cuota_numero: Number(v.cuota_numero), cuota_total: Number(v.cuota_total) },
      { onSuccess: () => setShowForm(false) },
    )
  }

  const handleUpdate = (credit: Credit, v: typeof EMPTY_FORM) => {
    updateCredit.mutate(
      { id: credit.id, description: v.description.trim(), bank: v.bank.trim() || null, cuota_monto: Number(v.cuota_monto), cuota_numero: Number(v.cuota_numero), cuota_total: Number(v.cuota_total) },
      { onSuccess: () => setEditingId(null) },
    )
  }

  const isLoading = chargesLoading || creditsLoading

  if (isLoading) return <div className="flex justify-center py-12"><Spinner /></div>

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Cuotas y Créditos</h1>

      {/* ── Créditos bancarios ── */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2">
            Créditos bancarios
            {activeCredits.length > 0 && (
              <span className="text-xs font-semibold text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">{activeCredits.length}</span>
            )}
          </h2>
          {!showForm && (
            <button className="text-sm text-brand-600 font-medium hover:text-brand-700" onClick={() => setShowForm(true)}>
              + Agregar crédito
            </button>
          )}
        </div>
        <div className="card p-0 divide-y divide-gray-100">
          {activeCredits.map((c) => (
            editingId === c.id ? (
              <CreditFormRow
                key={c.id}
                initial={{ description: c.description, bank: c.bank ?? '', cuota_monto: String(c.cuota_monto), cuota_numero: String(c.cuota_numero), cuota_total: String(c.cuota_total) }}
                onSave={(v) => handleUpdate(c, v)}
                onCancel={() => setEditingId(null)}
                saving={updateCredit.isPending}
              />
            ) : (
              <div key={c.id} className="px-4 py-3.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900 truncate uppercase">
                    {c.description}
                    {c.bank && <span className="text-gray-400 font-normal normal-case"> · {c.bank}</span>}
                  </p>
                  <div className="flex gap-3 shrink-0">
                    <button className="text-xs text-gray-400 hover:text-gray-600" onClick={() => setEditingId(c.id)}>Editar</button>
                    <button className="text-xs text-red-400 hover:text-red-600" onClick={() => deleteCredit.mutate(c.id)}>Eliminar</button>
                  </div>
                </div>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-base font-bold text-gray-900">{fmt((c.cuota_total - c.cuota_numero) * c.cuota_monto)}</span>
                  <span className="text-xs text-gray-500">restantes</span>
                  <span className="text-gray-200 mx-0.5">·</span>
                  <span className="text-xs text-gray-500">{c.cuota_total - c.cuota_numero} cuotas</span>
                  <span className="text-gray-200 mx-0.5">·</span>
                  <span className="text-xs text-gray-500">{fmt(c.cuota_monto)}/mes</span>
                </div>
                <ProgressBar value={c.cuota_numero} total={c.cuota_total} />
              </div>
            )
          ))}
          {showForm && (
            <CreditFormRow
              initial={EMPTY_FORM}
              onSave={handleCreate}
              onCancel={() => setShowForm(false)}
              saving={createCredit.isPending}
            />
          )}
          {activeCredits.length === 0 && !showForm && (
            <div className="px-4 py-8 text-center text-gray-400 text-sm">
              No hay créditos activos. Agrega uno manualmente.
            </div>
          )}
        </div>
        {finishedCredits.length > 0 && (
          <div className="mt-3 card p-0 divide-y divide-gray-100">
            {finishedCredits.map((c) => (
              <div key={c.id} className="px-4 py-3 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-500 truncate">{c.description}{c.bank && ` · ${c.bank}`}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{c.cuota_total} cuotas · {fmt(c.cuota_monto)}/mes</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">✓ Pagado</span>
                  <button className="text-xs text-red-400 hover:text-red-600" onClick={() => deleteCredit.mutate(c.id)}>Eliminar</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Cuotas de tarjeta ── */}
      {groups.length === 0 ? (
        <div className="card text-center py-8 text-gray-400">
          <p className="text-sm">No hay compras en cuotas registradas.</p>
          <p className="text-xs mt-1">Sube una cartola de tarjeta de crédito para verlas aquí.</p>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                Cuotas tarjeta activas
                <span className="text-xs font-semibold text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">{active.length}</span>
              </h2>
              <div className="card p-0 divide-y divide-gray-100">
                {active.map((g, i) => (
                  <div key={i} className="px-4 py-3.5">
                    <p className="text-sm font-medium text-gray-900 truncate uppercase">{g.description}</p>
                    <div className="flex items-baseline gap-1.5 mt-1">
                      <span className="text-base font-bold text-gray-900">{fmt((g.cuota_total - g.cuota_numero) * g.cuota_monto)}</span>
                      <span className="text-xs text-gray-500">restantes</span>
                      <span className="text-gray-200 mx-0.5">·</span>
                      <span className="text-xs text-gray-500">{g.cuota_total - g.cuota_numero} cuotas</span>
                      <span className="text-gray-200 mx-0.5">·</span>
                      <span className="text-xs text-gray-500">{fmt(g.cuota_monto)}/mes</span>
                    </div>
                    <ProgressBar value={g.cuota_numero} total={g.cuota_total} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {finished.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                Cuotas tarjeta pagadas
                <span className="text-xs font-semibold text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">{finished.length}</span>
              </h2>
              <div className="card p-0 divide-y divide-gray-100">
                {finished.map((g, i) => (
                  <div key={i} className="px-4 py-3.5 flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-500 truncate">{g.description}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{g.cuota_total} cuotas · {fmt(g.cuota_monto)}/mes</p>
                    </div>
                    <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full shrink-0">✓ Pagado</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
