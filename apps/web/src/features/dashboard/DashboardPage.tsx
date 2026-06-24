import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, Label,
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
        <h1 className="text-2xl font-bold text-[#18181B] mb-3">
          {view === 'mensual' ? 'Resumen Mensual' : 'Resumen Anual'}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border border-[#E4E4E7] overflow-hidden">
            <button
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                view === 'mensual'
                  ? 'bg-brand-600 text-white'
                  : 'bg-white text-[#52525B] hover:bg-[#F4F4F5]'
              }`}
              onClick={() => setView('mensual')}
            >
              Mensual
            </button>
            <button
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                view === 'anual'
                  ? 'bg-brand-600 text-white'
                  : 'bg-white text-[#52525B] hover:bg-[#F4F4F5]'
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
          <p className="text-sm text-[#71717A] mt-1">Verifica tu conexión o intenta nuevamente en unos segundos</p>
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

      {/* ── Budget alerts ── */}
      {!isLoading && !isError && view === 'mensual' && (() => {
        const alerts = dashboard.byCategory
          .filter((item) => {
            const b = budgets[item.category.id]
            return b != null && item.amount > 0 && item.amount / b >= 0.8
          })
          .map((item) => {
            const b = budgets[item.category.id]!
            const over = item.amount > b
            return { item, b, over, pct: Math.round((item.amount / b) * 100) }
          })
        if (alerts.length === 0) return null
        return (
          <div className="mb-6 space-y-2">
            {alerts.map(({ item, b, over, pct }) => (
              <div key={item.category.id} className={`flex items-center gap-3 rounded-xl px-4 py-3 ${over ? 'bg-red-50 border border-red-200' : 'bg-amber-50 border border-amber-200'}`}>
                <span className="text-lg shrink-0">{over ? '🚨' : '⚠️'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.category.color ?? '#6b7280' }} />
                    <span className={`text-sm font-semibold ${over ? 'text-red-800' : 'text-amber-800'}`}>
                      {item.category.name}
                    </span>
                    <span className={`text-sm ${over ? 'text-red-700' : 'text-amber-700'}`}>
                      {over
                        ? `superó el límite — gastaste ${formatCurrency(item.amount)} de ${formatCurrency(b)} (+${formatCurrency(item.amount - b)})`
                        : `${pct}% del límite — ${formatCurrency(item.amount)} de ${formatCurrency(b)}`}
                    </span>
                  </div>
                  <div className="mt-1.5 w-full bg-white/60 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full ${over ? 'bg-red-500' : 'bg-amber-400'}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      })()}

      {/* Summary cards + charts */}
      {!isLoading && !isError && (<>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <div className="rounded-2xl border border-rose-100 bg-rose-50 shadow-sm p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-rose-400">{view === 'mensual' ? 'Gastos' : 'Gastos del año'}</p>
          <p className="text-3xl font-bold text-rose-900 mt-2 tabular-nums leading-none">{formatCurrency(dashboard.totalExpenses)}</p>
          <p className="text-xs text-rose-300 mt-2">
            {view === 'mensual' ? `${MONTHS[month - 1]} ${year}` : `Año ${year}`}
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 shadow-sm p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-500">{view === 'mensual' ? 'Ingresos' : 'Ingresos del año'}</p>
          <p className="text-3xl font-bold text-emerald-800 mt-2 tabular-nums leading-none">{formatCurrency(dashboard.totalIncome)}</p>
          <p className="text-xs text-emerald-400 mt-2">
            {view === 'mensual' ? `${MONTHS[month - 1]} ${year}` : `Año ${year}`}
          </p>
        </div>
        <div className="rounded-2xl border border-orange-100 bg-orange-50 shadow-sm p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-orange-400">Créditos/mes</p>
          <p className="text-3xl font-bold text-orange-800 mt-2 tabular-nums leading-none">{formatCurrency(dashboard.totalCredits)}</p>
          <p className="text-xs text-orange-300 mt-2">
            {dashboard.totalDebt > 0 ? `${formatCurrency(dashboard.totalDebt)} total` : 'cuotas y créditos activos'}
          </p>
        </div>
        <div className="rounded-2xl border border-violet-100 bg-violet-50 shadow-sm p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-violet-400">Balance neto</p>
          {(() => {
            const net = dashboard.totalIncome - dashboard.totalExpenses - dashboard.totalCredits
            return (
              <>
                <p className={`text-3xl font-bold mt-2 tabular-nums leading-none ${net >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {net >= 0 ? '+' : ''}{formatCurrency(net)}
                </p>
                <p className="text-xs text-violet-300 mt-2">ingresos − gastos − créditos</p>
              </>
            )
          })()}
        </div>
        <div className="rounded-2xl border border-zinc-100 bg-zinc-50 shadow-sm p-5">
          {view === 'mensual' ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Categorías activas</p>
              <p className="text-3xl font-bold text-zinc-800 mt-2 leading-none">{dashboard.byCategory.length}</p>
            </>
          ) : (
            <>
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Promedio mensual</p>
              <p className="text-3xl font-bold text-zinc-800 mt-2 tabular-nums leading-none">{formatCurrency(monthlyAverage)}</p>
              <p className="text-xs text-zinc-400 mt-2">
                {activeMonthsCount} {activeMonthsCount === 1 ? 'mes con datos' : 'meses con datos'}
              </p>
            </>
          )}
        </div>
      </div>

      {/* ── Deuda total ── */}
      {dashboard.creditItems.length > 0 && (() => {
        const paidPct = dashboard.totalOriginalDebt > 0
          ? Math.round(((dashboard.totalOriginalDebt - dashboard.totalDebt) / dashboard.totalOriginalDebt) * 100)
          : 0
        return (
          <div className="card mb-6">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <h2 className="text-base font-semibold text-[#27272A]">Deuda Total</h2>
                <p className="text-xs text-[#A1A1AA] mt-0.5">
                  {formatCurrency(dashboard.totalCredits)}/mes · {dashboard.creditItems.length} {dashboard.creditItems.length === 1 ? 'compromiso activo' : 'compromisos activos'}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xl font-bold text-orange-500">{formatCurrency(dashboard.totalDebt)}</p>
                <p className="text-xs text-[#A1A1AA]">{paidPct}% pagado</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-[#F4F4F5] rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${paidPct}%` }} />
              </div>
              <span className="text-xs text-[#A1A1AA] shrink-0 w-10 text-right">{paidPct}%</span>
            </div>
          </div>
        )
      })()}

      {dashboard.byCategory.length === 0 ? (
        <div className="card text-center py-12 text-[#A1A1AA]">
          <p className="text-lg">Sin datos para este período</p>
          <p className="text-sm mt-1">Sube un estado de cuenta para ver tu resumen</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Annual: monthly trend chart */}
          {view === 'anual' && (
            <div className="card lg:col-span-2">
              <h2 className="text-base font-semibold text-[#27272A] mb-4">Gasto mensual</h2>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={monthlyBarData} barCategoryGap="30%">
                  <defs>
                    <linearGradient id="violetGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#7C3AED" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#A78BFA" stopOpacity={0.5} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#A1A1AA' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#A1A1AA' }} axisLine={false} tickLine={false}
                    tickFormatter={(v: number) => v >= 1000000 ? `$${(v/1000000).toFixed(1)}M` : v >= 1000 ? `$${(v/1000).toFixed(0)}k` : `$${v}`} />
                  <Tooltip
                    cursor={{ fill: '#F4F4F5', radius: 6 }}
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null
                      return (
                        <div className="bg-white border border-[#E4E4E7] rounded-xl shadow-lg px-3 py-2.5">
                          <p className="text-[11px] text-[#71717A] mb-1 font-medium">{label}</p>
                          <p className="text-sm font-bold text-[#18181B] tabular-nums">{formatCurrency(Number(payload[0]?.value ?? 0))}</p>
                        </div>
                      )
                    }}
                  />
                  <Bar dataKey="monto" fill="url(#violetGrad)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Category horizontal bar chart */}
          <div className="card">
            <h2 className="text-base font-semibold text-[#27272A] mb-4">Gasto por categoría</h2>
            <ResponsiveContainer width="100%" height={Math.max(240, dashboard.byCategory.length * 44)}>
              <BarChart data={categoryBarData} layout="vertical" barCategoryGap="25%">
                <XAxis type="number" tick={{ fontSize: 11, fill: '#A1A1AA' }} axisLine={false} tickLine={false}
                  tickFormatter={(v: number) => v >= 1000000 ? `$${(v/1000000).toFixed(1)}M` : v >= 1000 ? `$${(v/1000).toFixed(0)}k` : `$${v}`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#52525B' }} width={104} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: '#F4F4F5', radius: 4 }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    const color = (payload[0] as { fill?: string }).fill
                    return (
                      <div className="bg-white border border-[#E4E4E7] rounded-xl shadow-lg px-3 py-2.5">
                        <p className="text-[11px] text-[#71717A] mb-1 font-medium">{label}</p>
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color ?? '#7C3AED' }} />
                          <span className="text-sm font-bold text-[#18181B] tabular-nums">{formatCurrency(Number(payload[0]?.value ?? 0))}</span>
                        </div>
                      </div>
                    )
                  }}
                />
                <Bar dataKey="monto" radius={[0, 6, 6, 0]}>
                  {categoryBarData.map((_, index) => (
                    <Cell key={index} fill={dashboard.byCategory[index]?.category.color ?? '#7C3AED'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Donut chart */}
          <div className="card">
            <h2 className="text-base font-semibold text-[#27272A] mb-4">Distribución</h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={110}
                  innerRadius={64}
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                  <Label
                    content={({ viewBox }) => {
                      const { cx, cy } = (viewBox ?? {}) as { cx: number; cy: number }
                      return (
                        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
                          <tspan x={cx} dy="-0.5em" fontSize="15" fontWeight="700" fill="#18181B">
                            {formatCurrency(dashboard.totalExpenses)}
                          </tspan>
                          <tspan x={cx} dy="1.6em" fontSize="11" fill="#A1A1AA">
                            total gastos
                          </tspan>
                        </text>
                      )
                    }}
                  />
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const entry = payload[0]
                    const pct = dashboard.totalExpenses > 0
                      ? ((Number(entry?.value ?? 0) / dashboard.totalExpenses) * 100).toFixed(1)
                      : '0'
                    return (
                      <div className="bg-white border border-[#E4E4E7] rounded-xl shadow-lg px-3 py-2.5">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: (entry as { fill?: string }).fill ?? '#7C3AED' }} />
                          <p className="text-[11px] text-[#71717A] font-medium">{entry?.name}</p>
                        </div>
                        <p className="text-sm font-bold text-[#18181B] tabular-nums">{formatCurrency(Number(entry?.value ?? 0))}</p>
                        <p className="text-[11px] text-[#A1A1AA] mt-0.5">{pct}% del total</p>
                      </div>
                    )
                  }}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 12, color: '#71717A' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Account type breakdown */}
          {accountTypes.length > 0 && (
            <div className="card lg:col-span-2">
              <h2 className="text-base font-semibold text-[#27272A] mb-4">Movimientos por Tipo de Cuenta</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
                {accountTypes.map((t) => {
                  const gastos = gastosPerType[t] ?? 0
                  const abonos = abonosPerType[t] ?? 0
                  const neto = gastos - abonos
                  const favorable = neto < 0
                  return (
                    <div key={t} className="bg-[#F4F4F5] rounded-xl p-3 space-y-2">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: TYPE_COLORS[t] ?? '#6b7280' }} />
                        <p className="text-xs font-medium text-[#52525B]">{TYPE_LABELS[t] ?? t}</p>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-[#A1A1AA]">Gastos</span>
                          <span className="text-xs font-medium text-[#3F3F46]">{formatCurrency(gastos)}</span>
                        </div>
                        {abonos > 0 && (
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-[#A1A1AA]">Abonos</span>
                            <span className="text-xs font-medium text-emerald-600">+{formatCurrency(abonos)}</span>
                          </div>
                        )}
                      </div>
                      <div className="border-t border-[#E4E4E7] pt-2 flex justify-between items-center">
                        <span className="text-xs text-[#71717A]">Neto</span>
                        <span className={`text-sm font-bold ${favorable ? 'text-emerald-600' : 'text-[#18181B]'}`}>
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
            <h2 className="text-base font-semibold text-[#27272A] mb-4">Desglose por categoría</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[#71717A] border-b border-[#F4F4F5]">
                  <th className="pb-2 font-medium">Categoría</th>
                  <th className="pb-2 font-medium text-right">Gastos</th>
                  <th className="pb-2 font-medium text-right">Total</th>
                  <th className="pb-2 font-medium text-right hidden md:table-cell">% del total</th>
                  {view === 'mensual' && <th className="pb-2 font-medium text-right">Límite mensual</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#FAFAFA]">
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
                      <td className="py-2 text-right text-[#52525B]">{item.count}</td>
                      <td className={`py-2 text-right font-medium ${over ? 'text-red-600' : ''}`}>{formatCurrency(item.amount)}</td>
                      <td className="py-2 text-right text-[#71717A] hidden md:table-cell">
                        {dashboard.totalAmount > 0 ? `${((item.amount / dashboard.totalAmount) * 100).toFixed(1)}%` : '—'}
                      </td>
                      {view === 'mensual' && (
                        <td className="py-2 text-right min-w-[120px]">
                          {budget != null ? (
                            <div className="flex flex-col items-end gap-1">
                              <span className={`text-xs font-medium ${over ? 'text-red-600' : warn ? 'text-amber-600' : 'text-[#71717A]'}`}>
                                {formatCurrency(budget)}
                                {over && ' ⚠️'}
                              </span>
                              <div className="w-full bg-[#F4F4F5] rounded-full h-1.5">
                                <div
                                  className={`h-1.5 rounded-full transition-all ${over ? 'bg-red-500' : warn ? 'bg-amber-400' : 'bg-emerald-500'}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className={`text-[10px] ${over ? 'text-red-500' : 'text-[#A1A1AA]'}`}>
                                {over
                                  ? `+${formatCurrency(item.amount - budget)} excedido`
                                  : `${Math.round((item.amount / budget) * 100)}% usado`}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-[#D4D4D8]">—</span>
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
