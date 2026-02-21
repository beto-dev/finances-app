import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { useDashboard } from './useDashboard'

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

const TYPE_LABELS: Record<string, string> = {
  checking: 'Cuenta Corriente',
  credit_card: 'Tarjeta de Crédito',
  credit_line: 'Línea de Crédito',
}

const TYPE_COLORS: Record<string, string> = {
  checking: '#3b82f6',
  credit_card: '#8b5cf6',
  credit_line: '#f97316',
}

export default function DashboardPage() {
  const now = new Date()
  const [view, setView] = useState<'mensual' | 'anual'>('mensual')
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())

  const activeMonth = view === 'mensual' ? month : undefined
  const dashboard = useDashboard(activeMonth, year)

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: dashboard.currency, maximumFractionDigits: 0 }).format(v)

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)

  const categoryBarData = dashboard.byCategory.map((item) => ({
    name: item.category.name,
    monto: item.amount,
  }))

  const pieData = dashboard.byCategory.map((item) => ({
    name: item.category.name,
    value: item.amount,
    color: item.category.color ?? '#6b7280',
  }))

  const monthlyBarData = dashboard.byMonth.map((item) => ({
    name: item.label,
    monto: item.amount,
  }))

  const activeMonthsCount = dashboard.byMonth.filter((m) => m.amount > 0).length
  const monthlyAverage = activeMonthsCount > 0 ? dashboard.totalAmount / activeMonthsCount : 0

  // Account type breakdown
  const accountTypes = Array.from(
    new Set(dashboard.charges.map((c) => c.statement_type).filter(Boolean))
  ).sort() as string[]

  const totalPerType: Record<string, number> = {}
  for (const charge of dashboard.charges) {
    const t = charge.statement_type || 'checking'
    totalPerType[t] = (totalPerType[t] ?? 0) + Number(charge.amount)
  }

  const accountStackedData = MONTHS_SHORT.map((label, i) => {
    const m = i + 1
    const row: Record<string, number | string> = { name: label }
    for (const t of accountTypes) {
      row[t] = dashboard.charges
        .filter((c) => new Date(c.date + 'T00:00:00').getMonth() + 1 === m && (c.statement_type || 'checking') === t)
        .reduce((s, c) => s + Number(c.amount), 0)
    }
    return row
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {view === 'mensual' ? 'Resumen Mensual' : 'Resumen Anual'}
        </h1>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                view === 'mensual'
                  ? 'bg-green-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
              onClick={() => setView('mensual')}
            >
              Mensual
            </button>
            <button
              className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                view === 'anual'
                  ? 'bg-green-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
              onClick={() => setView('anual')}
            >
              Anual
            </button>
          </div>

          {/* Month picker — only in monthly view */}
          {view === 'mensual' && (
            <select
              className="input w-36"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            >
              {MONTHS.map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>
          )}

          {/* Year picker — always visible */}
          <select
            className="input w-24"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="card">
          <p className="text-sm text-gray-500">{view === 'mensual' ? 'Gasto total' : 'Gasto total del año'}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{formatCurrency(dashboard.totalAmount)}</p>
          <p className="text-xs text-gray-400 mt-1">
            {view === 'mensual' ? `${MONTHS[month - 1]} ${year}` : `Año ${year}`}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Número de movimientos</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{dashboard.charges.length}</p>
        </div>
        <div className="card">
          {view === 'mensual' ? (
            <>
              <p className="text-sm text-gray-500">Categorías activas</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{dashboard.byCategory.length}</p>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-500">Promedio mensual</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{formatCurrency(monthlyAverage)}</p>
              <p className="text-xs text-gray-400 mt-1">
                {activeMonthsCount} {activeMonthsCount === 1 ? 'mes con datos' : 'meses con datos'}
              </p>
            </>
          )}
        </div>
      </div>

      {dashboard.byCategory.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <p className="text-lg">Sin datos para este período</p>
          <p className="text-sm mt-1">Sube un estado de cuenta para ver tu resumen</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Annual: monthly trend chart */}
          {view === 'anual' && (
            <div className="card lg:col-span-2">
              <h2 className="text-base font-semibold text-gray-800 mb-4">Gasto mensual</h2>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={monthlyBarData}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `$${Number(v).toLocaleString('es-CL')}`} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="monto" fill="#16a34a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Category bar chart */}
          <div className="card">
            <h2 className="text-base font-semibold text-gray-800 mb-4">Gasto por categoría</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={categoryBarData}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `$${Number(v).toLocaleString('es-CL')}`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="monto" fill="#16a34a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Pie chart */}
          <div className="card">
            <h2 className="text-base font-semibold text-gray-800 mb-4">Distribución</h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Account type breakdown */}
          {accountTypes.length > 0 && (
            <div className="card lg:col-span-2">
              <h2 className="text-base font-semibold text-gray-800 mb-4">Gastos por Tipo de Cuenta</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
                {accountTypes.map((t) => (
                  <div key={t} className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">{TYPE_LABELS[t] ?? t}</p>
                    <p className="text-lg font-bold text-gray-900 mt-0.5">{formatCurrency(totalPerType[t] ?? 0)}</p>
                    <p className="text-xs text-gray-400">
                      {dashboard.totalAmount > 0
                        ? `${(((totalPerType[t] ?? 0) / dashboard.totalAmount) * 100).toFixed(1)}%`
                        : '—'}
                    </p>
                  </div>
                ))}
              </div>
              {view === 'anual' && (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={accountStackedData}>
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `$${Number(v).toLocaleString('es-CL')}`} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Legend formatter={(value: string) => TYPE_LABELS[value] ?? value} />
                    {accountTypes.map((t, idx) => (
                      <Bar
                        key={t}
                        dataKey={t}
                        stackId="a"
                        fill={TYPE_COLORS[t] ?? '#6b7280'}
                        radius={idx === accountTypes.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          )}

          {/* Breakdown table */}
          <div className="card lg:col-span-2">
            <h2 className="text-base font-semibold text-gray-800 mb-4">Desglose por categoría</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="pb-2 font-medium">Categoría</th>
                  <th className="pb-2 font-medium text-right">Movimientos</th>
                  <th className="pb-2 font-medium text-right">Total</th>
                  <th className="pb-2 font-medium text-right">% del total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {dashboard.byCategory.map((item) => (
                  <tr key={item.category.id}>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: item.category.color ?? '#6b7280' }}
                        />
                        {item.category.name}
                      </div>
                    </td>
                    <td className="py-2 text-right text-gray-600">{item.count}</td>
                    <td className="py-2 text-right font-medium">{formatCurrency(item.amount)}</td>
                    <td className="py-2 text-right text-gray-500">
                      {dashboard.totalAmount > 0
                        ? `${((item.amount / dashboard.totalAmount) * 100).toFixed(1)}%`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
