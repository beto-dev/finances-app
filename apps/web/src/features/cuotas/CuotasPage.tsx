import { useState } from 'react'
import { useCharges } from '../charges/useCharges'
import { useCredits, useCreateCredit, useUpdateCredit, useDeleteCredit } from './useCredits'
import Spinner from '../../shared/components/Spinner'
import type { Credit } from '../../shared/types'

interface CuotaGroup {
  description: string
  cuota_numero: number
  cuota_total: number
  cuota_monto: number
  date: string
}

// Strip trailing interest-rate suffixes Claude sometimes appends (e.g. "0,00 %" or "2,07 %")
function normalizeDesc(desc: string): string {
  return desc.trim().toLowerCase().replace(/\s+\d+[,.]\d+\s*%\s*$/, '').trim()
}

// Two descriptions refer to the same purchase if one is a word-boundary prefix of the other,
// OR if they share a long common character prefix (handles typos like NACIONA/NACIONAL and
// truncated suffixes like "CUOTA COMERCIO" vs "03 CUOTAS COMERC").
function descsShouldMerge(a: string, b: string): boolean {
  if (b.startsWith(a + ' ') || a.startsWith(b + ' ')) return true
  const shorter = a.length <= b.length ? a : b
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return i >= 20 && i / shorter.length >= 0.5
}

function groupCuotas(charges: ReturnType<typeof useCharges>['data']): CuotaGroup[] {
  if (!charges) return []

  // Bucket by normalized description + cuota_total
  type C = NonNullable<typeof charges>[number]
  const buckets = new Map<string, C[]>()
  for (const c of charges) {
    if (c.cuota_numero == null || c.cuota_total == null) continue
    const key = `${normalizeDesc(c.description)}|${c.cuota_total}`
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(c)
  }

  // Merge similar-description buckets with the same cuota_total.
  // Handles Santander inconsistencies: typos (NACIONA/NACIONAL), truncated suffixes
  // (CUOTA COMERCIO vs 03 CUOTAS COMERC), and appended suffixes (TRES CUOTAS PREC).
  const keyList = [...buckets.keys()]
  for (let i = 0; i < keyList.length; i++) {
    const keyA = keyList[i]
    if (!buckets.has(keyA)) continue
    const sepA = keyA.lastIndexOf('|')
    const descA = keyA.slice(0, sepA)
    const totalA = keyA.slice(sepA + 1)
    for (let j = i + 1; j < keyList.length; j++) {
      const keyB = keyList[j]
      if (!buckets.has(keyB)) continue
      const sepB = keyB.lastIndexOf('|')
      const descB = keyB.slice(0, sepB)
      const totalB = keyB.slice(sepB + 1)
      if (totalA !== totalB || !descsShouldMerge(descA, descB)) continue
      buckets.get(keyA)!.push(...buckets.get(keyB)!)
      buckets.delete(keyB)
    }
  }

  // Deduplicate: within each merged bucket keep only the most-recent charge per
  // cuota_numero. Two entries at the same installment number after description-merging
  // are duplicates (re-upload or same month under different description variants).
  for (const [key, list] of buckets.entries()) {
    if (list.length < 2) continue
    const byNum = new Map<number, C>()
    for (const c of list) {
      const existing = byNum.get(c.cuota_numero!)
      if (!existing || c.date > existing.date) byNum.set(c.cuota_numero!, c)
    }
    buckets.set(key, [...byNum.values()])
  }

  const groups: CuotaGroup[] = []

  for (const list of buckets.values()) {
    // Sort by cuota_numero ascending so we can build increasing sequences
    const sorted = [...list].sort((a, b) => a.cuota_numero! - b.cuota_numero!)

    // Patience-sort-like: assign each charge to a "run" whose last value is strictly less.
    // Each run represents one distinct purchase series.
    // We track only the last charge added to each run (we only need the max at the end).
    const runs: { last: number; charge: C }[] = []

    for (const c of sorted) {
      // Find runs where last < current cuota_numero — prefer the one closest to current
      let best: { last: number; charge: C } | null = null
      for (const r of runs) {
        if (r.last < c.cuota_numero! && (!best || r.last > best.last)) best = r
      }
      if (best) {
        best.last = c.cuota_numero!
        best.charge = c
      } else {
        runs.push({ last: c.cuota_numero!, charge: c })
      }
    }

    for (const run of runs) {
      const c = run.charge
      groups.push({
        description: c.description,
        cuota_numero: c.cuota_numero!,
        cuota_total: c.cuota_total!,
        cuota_monto: c.cuota_monto ?? c.amount,
        date: c.date,
      })
    }
  }

  // Sort: active first, then by remaining installments desc
  return groups.sort((a, b) => {
    const aDone = a.cuota_numero >= a.cuota_total
    const bDone = b.cuota_numero >= b.cuota_total
    if (aDone !== bDone) return aDone ? 1 : -1
    return (b.cuota_total - b.cuota_numero) - (a.cuota_total - a.cuota_numero)
  })
}

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
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Créditos bancarios {activeCredits.length > 0 && `(${activeCredits.length} activos)`}
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
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {c.description}
                    {c.bank && <span className="text-gray-400 font-normal"> · {c.bank}</span>}
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
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Cuotas tarjeta activas ({active.length})
              </h2>
              <div className="card p-0 divide-y divide-gray-100">
                {active.map((g, i) => (
                  <div key={i} className="px-4 py-3.5">
                    <p className="text-sm font-medium text-gray-900 truncate">{g.description}</p>
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
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Cuotas tarjeta pagadas ({finished.length})
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
