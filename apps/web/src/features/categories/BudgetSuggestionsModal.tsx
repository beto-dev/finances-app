import { useState } from 'react'
import { Category } from '../../shared/types'
import { BudgetSuggestions, useUpsertBudget } from './useBudgets'
import Spinner from '../../shared/components/Spinner'

interface Props {
  suggestions: BudgetSuggestions
  categories: Category[]
  onClose: () => void
  onApplied: () => void
}

export default function BudgetSuggestionsModal({ suggestions, categories, onClose, onApplied }: Props) {
  const upsert = useUpsertBudget()
  const fmt = (n: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

  // Allow user to tweak amounts before applying
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(suggestions.suggestions).map(([id, amt]) => [id, String(Math.round(amt))])
    )
  )

  const rows = categories.filter((c) => suggestions.suggestions[c.id] != null)

  const handleApply = async () => {
    await Promise.all(
      Object.entries(amounts)
        .filter(([, v]) => Number(v) > 0)
        .map(([categoryId, v]) => upsert.mutateAsync({ categoryId, amount: Number(v) }))
    )
    onApplied()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Sugerencias de presupuesto</h2>
          <p className="text-sm text-gray-500 mt-1">
            Basado en tu ingreso promedio de <strong>{fmt(suggestions.income_avg)}/mes</strong> (últimos 3 meses).
            Puedes ajustar antes de aplicar.
          </p>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1 px-6 py-3 space-y-2">
          {rows.map((cat) => (
            <div key={cat.id} className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cat.color ?? '#6b7280' }} />
              <span className="text-sm text-gray-700 flex-1">{cat.name}</span>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-xs text-gray-400">$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={amounts[cat.id] ?? ''}
                  onChange={(e) => setAmounts((p) => ({ ...p, [cat.id]: e.target.value.replace(/\D/g, '') }))}
                  className="w-24 text-xs border border-gray-200 rounded px-2 py-1 text-right focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1 text-sm">Cancelar</button>
          <button
            onClick={handleApply}
            disabled={upsert.isPending}
            className="btn-primary flex-1 text-sm flex items-center justify-center gap-1.5"
          >
            {upsert.isPending ? <Spinner size="sm" /> : `Aplicar ${rows.length} límites`}
          </button>
        </div>
      </div>
    </div>
  )
}
