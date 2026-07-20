import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ArrowRight } from 'lucide-react'
import { useFamilyCharges, useCategories, sortCharges, filterCharges, SortField, SortOrder } from './useCharges'
import { Charge, FamilyMember } from '../../shared/types'
import { NAME_BY_EMAIL } from '../../shared/utils/memberNames'
import client from '../../shared/api/client'
import Skeleton from '../../shared/components/Skeleton'
import BankBadge from '../../shared/components/BankBadge'

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

interface Contribution { user_id: string; percentage: number }
interface ContributionsResponse { contributions: Contribution[] }

function useFamilyMembers() {
  return useQuery<FamilyMember[]>({
    queryKey: ['family-members'],
    queryFn: async () => (await client.get('/api/families/me/members')).data,
  })
}

function useContributions() {
  return useQuery<ContributionsResponse>({
    queryKey: ['contributions'],
    queryFn: async () => (await client.get('/api/families/me/contributions')).data,
  })
}

function formatCLP(v: number) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(v)
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** Small circular avatar with member initials — consistent brand tint across the page. */
function MemberAvatar({ name, size = 'sm' }: { name: string; size?: 'sm' | 'md' }) {
  const dims = size === 'md' ? 'w-8 h-8 text-xs' : 'w-6 h-6 text-[10px]'
  return (
    <span className={`shrink-0 rounded-full bg-brand-100 text-brand-700 font-bold flex items-center justify-center ${dims}`}>
      {getInitials(name)}
    </span>
  )
}

interface CollapsedCuota { description: string; count: number; totalAmount: number }
interface PossibleDuplicate { description: string; count: number; amount: number }

/**
 * Deduplicates cuota charges (keeps first per description, shows total price)
 * and detects possible duplicate non-cuota charges (same description + same amount).
 */
function analyzeCharges(charges: Charge[]): {
  normalized: Charge[]
  collapsedCuotas: CollapsedCuota[]
  possibleDuplicates: PossibleDuplicate[]
} {
  // --- cuota normalization ---
  const cuotaCounts = new Map<string, number>()
  for (const c of charges) {
    if (!c.cuota_total || c.cuota_total <= 1 || !c.cuota_monto) continue
    const k = c.description.toLowerCase().trim()
    cuotaCounts.set(k, (cuotaCounts.get(k) ?? 0) + 1)
  }

  const processedCuotas = new Set<string>()
  const collapsedCuotas: CollapsedCuota[] = []
  const normalized: Charge[] = []

  for (const charge of charges) {
    if (!charge.cuota_total || charge.cuota_total <= 1 || !charge.cuota_monto) {
      normalized.push(charge)
      continue
    }
    const k = charge.description.toLowerCase().trim()
    if (processedCuotas.has(k)) continue
    processedCuotas.add(k)
    const totalAmount = Number(charge.cuota_monto) * charge.cuota_total
    normalized.push({ ...charge, amount: totalAmount })
    const count = cuotaCounts.get(k) ?? 1
    if (count > 1) collapsedCuotas.push({ description: charge.description, count, totalAmount })
  }

  // --- duplicate detection (non-cuota only) ---
  const dupCounts = new Map<string, number>()
  for (const c of normalized) {
    if (c.cuota_total && c.cuota_total > 1) continue
    const k = `${c.description.toLowerCase().trim()}|${c.amount}`
    dupCounts.set(k, (dupCounts.get(k) ?? 0) + 1)
  }
  const possibleDuplicates: PossibleDuplicate[] = [...dupCounts.entries()]
    .filter(([, n]) => n > 1)
    .map(([k, count]) => {
      const sep = k.lastIndexOf('|')
      return { description: k.slice(0, sep), count, amount: Number(k.slice(sep + 1)) }
    })

  return { normalized, collapsedCuotas, possibleDuplicates }
}

/** Greedy debt-settlement: returns list of {from, to, amount} transfers */
function settleDebts(balances: { userId: string; balance: number }[]) {
  const debtors = balances
    .filter((b) => b.balance < -1)
    .map((b) => ({ ...b, balance: Math.abs(b.balance) }))
    .sort((a, b) => b.balance - a.balance)

  const creditors = balances
    .filter((b) => b.balance > 1)
    .map((b) => ({ ...b }))
    .sort((a, b) => b.balance - a.balance)

  const transfers: { from: string; to: string; amount: number }[] = []

  for (const debtor of debtors) {
    let remaining = debtor.balance
    for (const creditor of creditors) {
      if (remaining <= 1) break
      if (creditor.balance <= 1) continue
      const amount = Math.min(remaining, creditor.balance)
      transfers.push({ from: debtor.userId, to: creditor.userId, amount })
      remaining -= amount
      creditor.balance -= amount
    }
  }

  return transfers
}

/** Groups already-sorted charges by calendar date for the mobile card list, mirroring ChargesPage. */
function groupFamilyChargesByDate(charges: Charge[]) {
  const today = new Date().toISOString().split('T')[0]
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]

  const groups: { label: string; date: string; charges: Charge[]; total: number }[] = []
  const seen = new Map<string, number>()

  for (const charge of charges) {
    const d = charge.date
    if (!seen.has(d)) {
      let label: string
      if (d === today) label = 'Hoy'
      else if (d === yesterday) label = 'Ayer'
      else label = new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })
      seen.set(d, groups.length)
      groups.push({ label, date: d, charges: [], total: 0 })
    }
    const idx = seen.get(d)!
    groups[idx].charges.push(charge)
    groups[idx].total += charge.amount
  }

  return groups
}

export default function FamilyChargesPage() {
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1

  const [filterMonth, setFilterMonth] = useState<number | undefined>(currentMonth)
  const [filterYear, setFilterYear] = useState<number | undefined>(currentYear)
  const [sortField, setSortField] = useState<SortField>('date')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [searchDesc, setSearchDesc] = useState('')
  const [filterCategoryId, setFilterCategoryId] = useState<string | null>(null)
  const [filterBank, setFilterBank] = useState<string>('')
  const [warningsOpen, setWarningsOpen] = useState(true)

  const { data: rawCharges, isLoading } = useFamilyCharges(filterMonth, filterYear)
  const { data: categories = [] } = useCategories()
  const { data: members = [] } = useFamilyMembers()
  const { data: contribData } = useContributions()

  const { normalized: allCharges, collapsedCuotas, possibleDuplicates } = analyzeCharges(rawCharges ?? [])
  const totalWarnings = collapsedCuotas.length + possibleDuplicates.length

  const memberNameById = new Map(
    members.map((m) => [m.user_id, NAME_BY_EMAIL[m.email.toLowerCase()] ?? m.email])
  )
  const pctById = new Map(
    (contribData?.contributions ?? []).map((c) => [c.user_id, Number(c.percentage)])
  )

  // Settlement calculation (uses all normalized charges for the period)
  const totalExpense = allCharges.reduce((s, c) => s + Number(c.amount), 0)

  const actualById = new Map<string, number>()
  for (const c of allCharges) {
    if (c.uploaded_by) {
      actualById.set(c.uploaded_by, (actualById.get(c.uploaded_by) ?? 0) + Number(c.amount))
    }
  }

  const memberStats = members.map((m) => {
    const pct = pctById.get(m.user_id) ?? 0
    const expected = totalExpense * (pct / 100)
    const actual = actualById.get(m.user_id) ?? 0
    const balance = actual - expected  // positive = spent more than share, negative = owes
    return { userId: m.user_id, name: memberNameById.get(m.user_id) ?? m.email, pct, expected, actual, balance }
  })

  const transfers = settleDebts(memberStats.map((s) => ({ userId: s.userId, balance: s.balance })))

  const availableBanks = [...new Set(allCharges.map((c) => c.bank_hint).filter((b): b is string => !!b && b !== 'manual'))].sort()

  // Filtered charges for table
  let charges = allCharges
  charges = filterCharges(charges, searchDesc, filterCategoryId, 'all', undefined, undefined, filterBank || undefined)
  charges = sortCharges(charges, sortField, sortOrder)

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortOrder('asc') }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <span className="text-[#D4D4D8] ml-1">↕</span>
    return <span className="text-brand-600 ml-1 font-bold">{sortOrder === 'asc' ? '↑' : '↓'}</span>
  }

  const years = Array.from({ length: 5 }, (_, i) => currentYear - i)
  const periodLabel = filterMonth && filterYear
    ? `${MONTHS[filterMonth - 1]} ${filterYear}`
    : filterYear ? `Año ${filterYear}` : 'Todo el período'

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#18181B]">Gastos Familia</h1>
        <p className="text-sm text-[#71717A] mt-0.5">Gastos confirmados por todos los miembros</p>
      </div>

      {/* Date filters */}
      <div className="flex gap-2 mb-4">
        <select
          className="input flex-1"
          value={filterMonth ?? ''}
          onChange={(e) => setFilterMonth(e.target.value ? Number(e.target.value) : undefined)}
        >
          <option value="">Todos los meses</option>
          {MONTHS.map((m, i) => (
            <option key={i + 1} value={i + 1}>{m}</option>
          ))}
        </select>
        <select
          className="input w-24"
          value={filterYear ?? ''}
          onChange={(e) => setFilterYear(e.target.value ? Number(e.target.value) : undefined)}
        >
          <option value="">Todos los años</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Warnings panel */}
      {!isLoading && totalWarnings > 0 && (
        <div className="mb-4 border border-amber-200 bg-amber-50 rounded-xl overflow-hidden shadow-sm">
          <button
            onClick={() => setWarningsOpen((o) => !o)}
            className="w-full flex items-center justify-between gap-2 px-4 py-3 min-h-[44px] text-sm font-semibold text-amber-800 hover:bg-amber-100/70 transition-colors"
          >
            <span className="flex items-center gap-2 text-left">
              <span className="text-base shrink-0">⚠️</span>
              <span>{totalWarnings} situación{totalWarnings !== 1 ? 'es' : ''} para revisar</span>
            </span>
            <ChevronDown className={`w-4 h-4 text-amber-500 shrink-0 transition-transform duration-200 ${warningsOpen ? 'rotate-180' : ''}`} />
          </button>
          {warningsOpen && (
            <div className="border-t border-amber-200 px-4 py-3 space-y-4">
              {collapsedCuotas.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
                    Cuotas unificadas ({collapsedCuotas.length})
                  </p>
                  <div className="space-y-1.5">
                    {collapsedCuotas.map((w) => (
                      <div key={w.description} className="text-sm text-amber-800 flex items-start gap-2">
                        <span className="shrink-0 mt-0.5">🔗</span>
                        <span>
                          <strong>{w.description}</strong> — se encontraron {w.count} cuotas en distintos meses,
                          unificadas en 1 pago total de <strong>{formatCLP(w.totalAmount)}</strong>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {possibleDuplicates.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
                    Posibles duplicados ({possibleDuplicates.length})
                  </p>
                  <div className="space-y-1.5">
                    {possibleDuplicates.map((w) => (
                      <div key={`${w.description}|${w.amount}`} className="text-sm text-amber-800 flex items-start gap-2">
                        <span className="shrink-0 mt-0.5">🔁</span>
                        <span>
                          <strong>{w.description}</strong> aparece {w.count} veces
                          con el mismo monto (<strong>{formatCLP(w.amount)}</strong>).
                          ¿La cartola fue cargada más de una vez?
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Settlement panel — only when there's data and contributions configured */}
      {totalExpense > 0 && memberStats.some((s) => s.pct > 0) && (
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-4 gap-2">
            <h2 className="text-base font-semibold text-[#27272A]">Liquidación — {periodLabel}</h2>
            <span className="text-sm font-semibold text-[#18181B] whitespace-nowrap">{formatCLP(totalExpense)}</span>
          </div>

          {/* Mobile: stacked member cards */}
          <div className="md:hidden space-y-2.5 mb-4">
            {memberStats.map((s) => (
              <div key={s.userId} className="rounded-xl border border-[#E4E4E7] bg-[#FAFAFA] p-3">
                <div className="flex items-center gap-2.5 mb-2.5">
                  <MemberAvatar name={s.name} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#18181B] truncate">{s.name}</p>
                    <p className="text-xs text-[#A1A1AA]">{s.pct.toFixed(1)}% de aporte</p>
                  </div>
                  {Math.abs(s.balance) <= 1 ? (
                    <span className="text-xs font-medium text-[#A1A1AA] shrink-0">Al día</span>
                  ) : s.balance > 0 ? (
                    <span className="text-xs font-bold text-emerald-600 shrink-0 whitespace-nowrap">+{formatCLP(s.balance)}</span>
                  ) : (
                    <span className="text-xs font-bold text-red-500 shrink-0 whitespace-nowrap">{formatCLP(s.balance)}</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs pt-2.5 border-t border-[#E4E4E7]">
                  <div>
                    <p className="text-[#A1A1AA]">Debería pagar</p>
                    <p className="font-medium text-[#3F3F46] tabular-nums">{formatCLP(s.expected)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[#A1A1AA]">Pagó (gastos)</p>
                    <p className="font-medium text-[#3F3F46] tabular-nums">{formatCLP(s.actual)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden md:block overflow-x-auto mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[#71717A] border-b border-[#F4F4F5]">
                  <th className="pb-2 font-medium">Miembro</th>
                  <th className="pb-2 font-medium text-right">% aporte</th>
                  <th className="pb-2 font-medium text-right">Debería pagar</th>
                  <th className="pb-2 font-medium text-right">Pagó (gastos)</th>
                  <th className="pb-2 font-medium text-right">Diferencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#FAFAFA]">
                {memberStats.map((s) => (
                  <tr key={s.userId}>
                    <td className="py-2.5 font-medium text-[#27272A]">
                      <div className="flex items-center gap-2">
                        <MemberAvatar name={s.name} />
                        {s.name}
                      </div>
                    </td>
                    <td className="py-2.5 text-right text-[#71717A]">{s.pct.toFixed(1)}%</td>
                    <td className="py-2.5 text-right text-[#3F3F46] tabular-nums">{formatCLP(s.expected)}</td>
                    <td className="py-2.5 text-right text-[#3F3F46] tabular-nums">{formatCLP(s.actual)}</td>
                    <td className="py-2.5 text-right tabular-nums">
                      {Math.abs(s.balance) <= 1 ? (
                        <span className="text-[#A1A1AA]">—</span>
                      ) : s.balance > 0 ? (
                        <span className="text-emerald-600 font-medium">+{formatCLP(s.balance)}</span>
                      ) : (
                        <span className="text-red-500 font-medium">{formatCLP(s.balance)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Transfer instructions */}
          {transfers.length > 0 && (
            <div className="border-t border-[#F4F4F5] pt-4">
              <p className="text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-2">
                Transferencias a realizar
              </p>
              <div className="space-y-2">
                {transfers.map((t, i) => (
                  <div key={i} className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 min-h-[44px]">
                    <span className="text-sm font-medium text-[#27272A] truncate">
                      {memberNameById.get(t.from) ?? t.from}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span className="text-sm font-medium text-[#27272A] truncate">
                      {memberNameById.get(t.to) ?? t.to}
                    </span>
                    <span className="ml-auto text-sm font-bold text-amber-700 whitespace-nowrap shrink-0">
                      {formatCLP(t.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {transfers.length === 0 && memberStats.every((s) => Math.abs(s.balance) <= 1) && (
            <div className="border-t border-[#F4F4F5] pt-3 text-sm text-emerald-600 font-medium">
              ✓ Todos los miembros están al día
            </div>
          )}
        </div>
      )}

      {/* Search and filter */}
      <div className="bg-[#FAFAFA] p-4 rounded-lg mb-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="label text-xs">Buscar descripción</label>
            <input
              type="text"
              placeholder="UBER, JUMBO, Netflix..."
              className="input"
              value={searchDesc}
              onChange={(e) => setSearchDesc(e.target.value)}
            />
          </div>
          <div>
            <label className="label text-xs">Filtrar por categoría</label>
            <select
              className="input"
              value={filterCategoryId ?? ''}
              onChange={(e) => setFilterCategoryId(e.target.value || null)}
            >
              <option value="">Todas las categorías</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>
          {availableBanks.length > 0 && (
            <div>
              <label className="label text-xs">Banco</label>
              <select className="input" value={filterBank} onChange={(e) => setFilterBank(e.target.value)}>
                <option value="">Todos los bancos</option>
                {availableBanks.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">

        {/* ── Mobile card list ── */}
        <div className="md:hidden">
          {isLoading ? (
            <div className="divide-y divide-[#F4F4F5]">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                  <Skeleton className="w-6 h-6 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="flex justify-between gap-2">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-4 w-16 shrink-0" />
                    </div>
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
              ))}
            </div>
          ) : charges.length === 0 ? (
            <div className="text-center py-12 text-[#A1A1AA] px-4">
              <p className="text-base">Sin gastos confirmados para este período</p>
              <p className="text-sm mt-1">Los gastos aparecen aquí cuando un miembro los confirma</p>
            </div>
          ) : (
            <div>
              <div className="px-4 py-2.5 bg-[#FAFAFA] border-b border-[#E4E4E7]">
                <span className="text-xs text-[#71717A] font-medium">{charges.length} gastos</span>
              </div>
              {groupFamilyChargesByDate(charges).map((group) => (
                <div key={group.date}>
                  <div className="flex items-center justify-between px-4 py-2 bg-[#FAFAFA] border-b border-[#F4F4F5]">
                    <span className="text-xs font-semibold text-[#71717A] uppercase tracking-wide">{group.label}</span>
                    <span className="text-xs font-medium text-[#A1A1AA]">
                      {formatCLP(group.total)}
                    </span>
                  </div>
                  <div className="divide-y divide-[#F4F4F5]">
                    {group.charges.map((charge) => {
                      const cat = categories.find((c) => c.id === charge.category_id)
                      const memberName = charge.uploaded_by ? (memberNameById.get(charge.uploaded_by) ?? '—') : '—'
                      const isIncome = Number(charge.amount) < 0
                      const formattedAmount = new Intl.NumberFormat('es-CL', { style: 'currency', currency: charge.currency || 'CLP', maximumFractionDigits: 0 }).format(Math.abs(charge.amount))
                      const formattedDate = new Date(charge.date + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
                      return (
                        <div key={charge.id} className="flex items-center gap-3 px-4 py-3.5">
                          <MemberAvatar name={memberName} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-medium text-[#18181B] line-clamp-2 break-words">{charge.description}</p>
                              <p className={`text-sm font-semibold whitespace-nowrap ${isIncome ? 'text-emerald-600' : 'text-[#18181B]'}`}>
                                {isIncome ? '+' : ''}{formattedAmount}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              <span className="text-xs text-[#A1A1AA]">{formattedDate}</span>
                              <span className="text-xs text-[#A1A1AA] truncate max-w-[100px]">· {memberName}</span>
                              {charge.bank_hint && charge.bank_hint !== 'manual' && (
                                <BankBadge bank={charge.bank_hint} showName={false} />
                              )}
                              {cat && (
                                <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                                  style={{ backgroundColor: cat.color ? `${cat.color}20` : '#F4F4F5', color: cat.color ?? '#374151' }}>
                                  {cat.name}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Desktop table ── */}
        <div className="hidden md:block">
          {isLoading ? (
            <table className="w-full">
              <tbody>
                {[...Array(8)].map((_, i) => (
                  <tr key={i} className="border-b border-[#F4F4F5]">
                    <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-48" /></td>
                    <td className="px-4 py-3 text-right"><Skeleton className="h-4 w-16 ml-auto" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-20 rounded-full" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : charges.length === 0 ? (
            <div className="text-center py-12 text-[#A1A1AA]">
              <p className="text-lg">Sin gastos confirmados para este período</p>
              <p className="text-sm mt-1">Los gastos aparecen aquí cuando un miembro los confirma en "Gastos"</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-[#FAFAFA] border-b border-[#E4E4E7]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#71717A] uppercase tracking-wide cursor-pointer hover:bg-[#F4F4F5]" onClick={() => handleSort('date')}>Fecha <SortIcon field="date" /></th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#71717A] uppercase tracking-wide cursor-pointer hover:bg-[#F4F4F5]" onClick={() => handleSort('description')}>Descripción <SortIcon field="description" /></th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#71717A] uppercase tracking-wide cursor-pointer hover:bg-[#F4F4F5]" onClick={() => handleSort('amount')}>Monto <SortIcon field="amount" /></th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#71717A] uppercase tracking-wide cursor-pointer hover:bg-[#F4F4F5]" onClick={() => handleSort('category')}>Categoría <SortIcon field="category" /></th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#71717A] uppercase tracking-wide">Banco</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#71717A] uppercase tracking-wide">Miembro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F4F4F5]">
                {charges.map((charge) => {
                  const cat = categories.find((c) => c.id === charge.category_id)
                  const memberName = charge.uploaded_by ? (memberNameById.get(charge.uploaded_by) ?? '—') : '—'
                  const isIncome = Number(charge.amount) < 0
                  const formattedAmount = new Intl.NumberFormat('es-CL', { style: 'currency', currency: charge.currency || 'CLP', maximumFractionDigits: 0 }).format(Math.abs(charge.amount))
                  return (
                    <tr key={charge.id} className="hover:bg-[#FAFAFA]">
                      <td className="px-4 py-3 text-sm text-[#52525B] whitespace-nowrap">{new Date(charge.date + 'T00:00:00').toLocaleDateString('es-ES')}</td>
                      <td className="px-4 py-3 text-sm text-[#18181B] max-w-xs truncate">{charge.description}</td>
                      <td className={`px-4 py-3 text-sm font-medium text-right whitespace-nowrap tabular-nums ${isIncome ? 'text-emerald-600' : 'text-[#18181B]'}`}>
                        {isIncome ? '+' : ''}{formattedAmount}
                      </td>
                      <td className="px-4 py-3">
                        {cat ? (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: cat.color ? `${cat.color}20` : '#F4F4F5', color: cat.color ?? '#374151' }}>{cat.name}</span>
                        ) : <span className="text-xs text-[#A1A1AA]">—</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {charge.bank_hint && charge.bank_hint !== 'manual'
                          ? <BankBadge bank={charge.bank_hint} />
                          : <span className="text-[#D4D4D8]">—</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-[#52525B]">
                        <div className="flex items-center gap-2">
                          <MemberAvatar name={memberName} />
                          {memberName}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </div>
  )
}
