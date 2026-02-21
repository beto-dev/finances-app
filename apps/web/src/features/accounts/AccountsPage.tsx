import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import client from '../../shared/api/client'
import { Charge } from '../../shared/types'
import Spinner from '../../shared/components/Spinner'

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

const TYPE_LABELS: Record<string, string> = {
  checking: 'Cuenta Corriente',
  credit_card: 'Tarjeta de Crédito',
  credit_line: 'Línea de Crédito',
}

const TYPE_COLORS: Record<string, string> = {
  checking: 'bg-blue-50 text-blue-700',
  credit_card: 'bg-purple-50 text-purple-700',
  credit_line: 'bg-orange-50 text-orange-700',
}

function formatCLP(v: number) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(v)
}

export default function AccountsPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)

  const { data: charges = [], isLoading } = useQuery<Charge[]>({
    queryKey: ['charges', 'all', year],
    queryFn: async () => {
      const res = await client.get('/api/charges/', { params: { year } })
      return res.data
    },
  })

  // Build matrix: accountType → month (1-12) → total
  const types = Array.from(new Set(charges.map((c) => c.statement_type).filter(Boolean)))
  types.sort()

  const matrix: Record<string, Record<number, number>> = {}
  const totalsPerType: Record<string, number> = {}
  const totalsPerMonth: Record<number, number> = {}

  for (const charge of charges) {
    const t = charge.statement_type || 'checking'
    const m = new Date(charge.date + 'T00:00:00').getMonth() + 1
    const amt = Number(charge.amount)

    if (!matrix[t]) matrix[t] = {}
    matrix[t][m] = (matrix[t][m] ?? 0) + amt
    totalsPerType[t] = (totalsPerType[t] ?? 0) + amt
    totalsPerMonth[m] = (totalsPerMonth[m] ?? 0) + amt
  }

  const grandTotal = charges.reduce((s, c) => s + Number(c.amount), 0)

  if (isLoading) {
    return <div className="flex justify-center py-20"><Spinner size="lg" /></div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Gastos por Tipo de Cuenta</h1>
        <select
          className="input w-24"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
        >
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {types.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <p className="text-lg">Sin datos para {year}</p>
          <p className="text-sm mt-1">Sube un estado de cuenta para ver el desglose</p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="card">
              <p className="text-xs text-gray-500">Total {year}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{formatCLP(grandTotal)}</p>
            </div>
            {types.map((t) => (
              <div key={t} className="card">
                <p className="text-xs text-gray-500">{TYPE_LABELS[t] ?? t}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{formatCLP(totalsPerType[t] ?? 0)}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {grandTotal > 0 ? `${(((totalsPerType[t] ?? 0) / grandTotal) * 100).toFixed(1)}%` : '—'}
                </p>
              </div>
            ))}
          </div>

          {/* Matrix table */}
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-100">
                  <th className="pb-3 pr-4 font-semibold text-gray-700 min-w-[160px]">Tipo</th>
                  {MONTHS.map((m, i) => (
                    <th key={i} className="pb-3 px-2 font-medium text-gray-500 text-right whitespace-nowrap">{m}</th>
                  ))}
                  <th className="pb-3 pl-4 font-semibold text-gray-700 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {types.map((t) => (
                  <tr key={t}>
                    <td className="py-3 pr-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[t] ?? 'bg-gray-100 text-gray-700'}`}>
                        {TYPE_LABELS[t] ?? t}
                      </span>
                    </td>
                    {MONTHS.map((_, i) => {
                      const m = i + 1
                      const val = matrix[t]?.[m] ?? 0
                      return (
                        <td key={m} className="py-3 px-2 text-right tabular-nums">
                          {val > 0 ? (
                            <span className="text-gray-800">{formatCLP(val)}</span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      )
                    })}
                    <td className="py-3 pl-4 text-right font-semibold text-gray-900 tabular-nums">
                      {formatCLP(totalsPerType[t] ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200">
                  <td className="pt-3 pr-4 font-semibold text-gray-700">Total</td>
                  {MONTHS.map((_, i) => {
                    const m = i + 1
                    const val = totalsPerMonth[m] ?? 0
                    return (
                      <td key={m} className="pt-3 px-2 text-right font-semibold text-gray-700 tabular-nums">
                        {val > 0 ? formatCLP(val) : <span className="text-gray-300">—</span>}
                      </td>
                    )
                  })}
                  <td className="pt-3 pl-4 text-right font-bold text-gray-900 tabular-nums">
                    {formatCLP(grandTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
