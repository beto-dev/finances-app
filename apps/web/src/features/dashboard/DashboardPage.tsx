import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { useDashboard } from './useDashboard'
import { useBudgets } from '../categories/useBudgets'
import Skeleton from '../../shared/components/Skeleton'

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

const TYPE_LABELS: Record<string, string> = {
  checking: 'Cuenta Corriente',
  credit_card: 'Tarjeta de Crédito',
  credit_line: 'Línea de Crédito',
  manual: 'Efectivo',
}

const TYPE_COLORS: Record<string, string> = {
  checking: '#3b82f6',
  credit_card: '#8b5cf6',
  credit_line: '#f97316',
  manual: '#10b981',
}

export default function DashboardPage() {
  const now = new Date()
  const [view, setView] = useState<'mensual' | 'anual'>('mensual')
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())

  const activeMonth = view === 'mensual' ? month : undefined
  const { isLoading, isError, ...dashboard } = useDashboard(activeMonth, year)

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

  const { data: budgets = {} } = useBudgets()
  const activeMonthsCount = dashboard.byMonth.filter((m) => m.amount > 0).length
  const monthlyAverage = activeMonthsCount > 0 ? dashboard.totalAmount / activeMonthsCount : 0

  // Account type breakdown — separate expenses (positive) from income/credits (negative)
  const accountTypes = Array.from(
    new Set(dashboard.charges.map((c) => c.statement_type).filter(Boolean))
  ).sort() as string[]

  const gastosPerType: Record<string, number> = {}
  const abonosPerType: Record<string, number> = {}
  for (const charge of dashboard.charges) {
    const t = charge.statement_type || 'checking'
    const amt = Number(charge.amount)
    if (amt > 0) gastosPerType[t] = (gastosPerType[t] ?? 0) + amt
    else abonosPerType[t] = (abonosPerType[t] ?? 0) + Math.abs(amt)
  }
  const totalPerType: Record<string, number> = {}
  for (const t of accountTypes) {
    totalPerType[t] = (gastosPerType[t] ?? 0) - (abonosPerType[t] ?? 0)
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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-3">
          {view === 'mensual' ? 'Resumen Mensual' : 'Resumen Anual'}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                view === 'mensual'
                  ? 'bg-green-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
              onClick={() => setView('mensual')}
            >
              Mensual
            </button>
            <button
              className={`px-4 py-2 text-sm font-medium transition-colors ${
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
              className="input flex-1 min-w-[130px]"
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

      {/* ── Error state ── */}
      {isError && !isLoading && (
        <div className="card text-center py-12">
          <p className="text-lg font-medium text-red-600">No se pudo conectar con el servidor</p>
          <p className="text-sm text-gray-500 mt-1">Verifica tu conexión o intenta nuevamente en unos segundos</p>
          <button
            className="mt-4 btn-primary"
            onClick={() => window.location.reload()}
          >
            Reintentar
          </button>
        </div>
      )}

      {/* ── Skeleton loading state ── */}
      {isLoading && (
        <div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="card space-y-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-9 w-36" />
                <Skeleton className="h-3 w-20" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card"><Skeleton className="h-5 w-32 mb-4" /><Skeleton className="h-64 w-full" /></div>
            <div className="card"><Skeleton className="h-5 w-28 mb-4" /><Skeleton className="h-64 w-full" /></div>
          </div>
        </div>
      )}

      {/* Summary cards + charts */}
      {!isLoading && !isError && (<>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <div className="card">
          <p className="text-sm text-gray-500">{view === 'mensual' ? 'Gastos' : 'Gastos del año'}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(dashboard.totalExpenses)}</p>
          <p className="text-xs text-gray-400 mt-1">
            {view === 'mensual' ? `${MONTHS[month - 1]} ${year}` : `Año ${year}`}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">{view === 'mensual' ? 'Ingresos' : 'Ingresos del año'}</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{formatCurrency(dashboard.totalIncome)}</p>
          <p className="text-xs text-gray-400 mt-1">
            {view === 'mensual' ? `${MONTHS[month - 1]} ${year}` : `Año ${year}`}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Créditos/mes</p>
          <p className="text-2xl font-bold text-orange-500 mt-1">{formatCurrency(dashboard.totalCredits)}</p>
          <p className="text-xs text-gray-400 mt-1">dividendos activos</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Balance neto</p>
          {(() => {
            const net = dashboard.totalIncome - dashboard.totalExpenses - dashboard.totalCredits
            return (
              <>
                <p className={`text-2xl font-bold mt-1 ${net >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {net >= 0 ? '+' : ''}{formatCurrency(net)}
                </p>
                <p className="text-xs text-gray-400 mt-1">ingresos − gastos − créditos</p>
              </>
            )
          })()}
        </div>
        <div className="card">
          {view === 'mensual' ? (
            <>
              <p className="text-sm text-gray-500">Categorías activas</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{dashboard.byCategory.length}</p>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-500">Promedio mensual</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(monthlyAverage)}</p>
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
              <h2 className="text-base font-semibold text-gray-800 mb-4">Movimientos por Tipo de Cuenta</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
                {accountTypes.map((t) => {
                  const gastos = gastosPerType[t] ?? 0
                  const abonos = abonosPerType[t] ?? 0
                  const neto = gastos - abonos
                  const favorable = neto < 0
                  return (
                    <div key={t} className="bg-gray-50 rounded-xl p-3 space-y-2">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: TYPE_COLORS[t] ?? '#6b7280' }} />
                        <p className="text-xs font-medium text-gray-600">{TYPE_LABELS[t] ?? t}</p>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-gray-400">Gastos</span>
                          <span className="text-xs font-medium text-gray-700">{formatCurrency(gastos)}</span>
                        </div>
                        {abonos > 0 && (
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-gray-400">Abonos</span>
                            <span className="text-xs font-medium text-emerald-600">+{formatCurrency(abonos)}</span>
                          </div>
                        )}
                      </div>
                      <div className="border-t border-gray-200 pt-2 flex justify-between items-center">
                        <span className="text-xs text-gray-500">Neto</span>
                        <span className={`text-sm font-bold ${favorable ? 'text-emerald-600' : 'text-gray-900'}`}>
                          {favorable ? '+' : ''}{formatCurrency(Math.abs(neto))}{favorable ? ' a favor' : ''}
                        </span>
                      </div>
                    </div>
                  )
                })}
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
                  <th className="pb-2 font-medium text-right">Gastos</th>
                  <th className="pb-2 font-medium text-right">Total</th>
                  <th className="pb-2 font-medium text-right hidden md:table-cell">% del total</th>
                  {view === 'mensual' && <th className="pb-2 font-medium text-right">Presupuesto</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {dashboard.byCategory.map((item) => {
                  const budget = budgets[item.category.id]
                  const pct = budget ? Math.min((item.amount / budget) * 100, 100) : null
                  const over = budget != null && item.amount > budget
                  const warn = budget != null && !over && item.amount / budget >= 0.8
                  return (
                    <tr key={item.category.id}>
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.category.color ?? '#6b7280' }} />
                          {item.category.name}
                        </div>
                      </td>
                      <td className="py-2 text-right text-gray-600">{item.count}</td>
                      <td className={`py-2 text-right font-medium ${over ? 'text-red-600' : ''}`}>{formatCurrency(item.amount)}</td>
                      <td className="py-2 text-right text-gray-500 hidden md:table-cell">
                        {dashboard.totalAmount > 0 ? `${((item.amount / dashboard.totalAmount) * 100).toFixed(1)}%` : '—'}
                      </td>
                      {view === 'mensual' && (
                        <td className="py-2 text-right min-w-[120px]">
                          {budget != null ? (
                            <div className="flex flex-col items-end gap-1">
                              <span className={`text-xs font-medium ${over ? 'text-red-600' : warn ? 'text-amber-600' : 'text-gray-500'}`}>
                                {formatCurrency(budget)}
                                {over && ' ⚠️'}
                              </span>
                              <div className="w-full bg-gray-100 rounded-full h-1.5">
                                <div
                                  className={`h-1.5 rounded-full transition-all ${over ? 'bg-red-500' : warn ? 'bg-amber-400' : 'bg-emerald-500'}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className={`text-[10px] ${over ? 'text-red-500' : 'text-gray-400'}`}>
                                {over
                                  ? `+${formatCurrency(item.amount - budget)} excedido`
                                  : `${Math.round((item.amount / budget) * 100)}% usado`}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </>)}
    </div>
  )
}
