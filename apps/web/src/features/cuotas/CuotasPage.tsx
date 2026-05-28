import { useCharges } from '../charges/useCharges'
import Spinner from '../../shared/components/Spinner'

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

export default function CuotasPage() {
  const { data: charges, isLoading } = useCharges()
  const groups = groupCuotas(charges)
  const active = groups.filter((g) => g.cuota_numero < g.cuota_total)
  const finished = groups.filter((g) => g.cuota_numero >= g.cuota_total)

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

  if (isLoading) return <div className="flex justify-center py-12"><Spinner /></div>

  if (groups.length === 0) return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Cuotas</h1>
      <div className="card text-center py-12 text-gray-400">
        <p>No hay compras en cuotas registradas.</p>
        <p className="text-sm mt-1">Sube una cartola de tarjeta de crédito para verlas aquí.</p>
      </div>
    </div>
  )

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Cuotas</h1>

      {active.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Activas ({active.length})
          </h2>
          <div className="card p-0 divide-y divide-gray-100">
            {active.map((g, i) => (
              <div key={i} className="px-4 py-3.5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{g.description}</p>
                    <ProgressBar value={g.cuota_numero} total={g.cuota_total} />
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-gray-900">{fmt(g.cuota_monto)}<span className="text-xs text-gray-400 font-normal">/mes</span></p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Cuota <span className="font-medium text-gray-700">{g.cuota_numero}</span> de {g.cuota_total}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-brand-600 font-medium mt-1.5">
                  Quedan {g.cuota_total - g.cuota_numero} cuota{g.cuota_total - g.cuota_numero !== 1 ? 's' : ''} · {fmt((g.cuota_total - g.cuota_numero) * g.cuota_monto)} restante
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {finished.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Pagadas ({finished.length})
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
    </div>
  )
}
