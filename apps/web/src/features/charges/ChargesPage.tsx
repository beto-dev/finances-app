import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useCharges, useCategories, useBulkConfirm, useBulkUnshare, useUpdateCategory, useDeleteCharge, useApplyToSimilar, useCreateCategory, useShareCharge, useShareSimilar, sortCharges, filterCharges, SortField, SortOrder } from './useCharges'
import { Charge, Category } from '../../shared/types'
import ChargeRow from './ChargeRow'
import Spinner from '../../shared/components/Spinner'
import Skeleton from '../../shared/components/Skeleton'
import Toast from '../../shared/components/Toast'
import CategorySheet from '../../shared/components/CategorySheet'
import NewCategoryModal from '../../shared/components/NewCategoryModal'

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

interface SimilarPrompt {
  count: number
  pattern: string
  categoryId: string
  categoryName: string
}

// ── Mobile card component ────────────────────────────────────────────────────
function MobileChargeCard({
  charge, categories,
}: { charge: Charge; categories: Category[] }) {
  const queryClient = useQueryClient()
  const updateCategory = useUpdateCategory()
  const createCategory = useCreateCategory()
  const applyToSimilar = useApplyToSimilar()
  const bulkUnshare = useBulkUnshare()
  const shareCharge = useShareCharge()
  const shareSimilar = useShareSimilar()
  const deleteCharge = useDeleteCharge()
  const [optimisticCatId, setOptimisticCatId] = useState<string | null>(null)
  const [optimisticConfirmed, setOptimisticConfirmed] = useState<boolean | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [showNewModal, setShowNewModal] = useState(false)
  const [similarPrompt, setSimilarPrompt] = useState<SimilarPrompt | null>(null)
  const [similarSharePrompt, setSimilarSharePrompt] = useState<{ count: number; pattern: string } | null>(null)

  const patchCacheCategory = (catId: string | null) => {
    queryClient.setQueriesData<Charge[]>(
      { queryKey: ['charges'] },
      (old) => old?.map((c) => c.id === charge.id ? { ...c, category_id: catId } : c),
    )
  }

  const isShared = optimisticConfirmed ?? charge.is_shared
  const currentCatId = optimisticCatId ?? charge.category_id
  const currentCat = categories.find((c) => c.id === currentCatId)

  const handleCategoryChange = async (categoryId: string) => {
    setSimilarPrompt(null)
    setOptimisticCatId(categoryId || null)
    if (!categoryId) return
    try {
      const result = await updateCategory.mutateAsync({ chargeId: charge.id, categoryId })
      if (result.similar_count > 0) {
        const catName = categories.find((c) => c.id === categoryId)?.name ?? ''
        setSimilarPrompt({ count: result.similar_count, pattern: result.suggested_pattern, categoryId, categoryName: catName })
      } else {
        patchCacheCategory(categoryId)
      }
    } catch {
      setOptimisticCatId(null)
    }
  }

  const handleApplyToSimilar = async () => {
    if (!similarPrompt) return
    try {
      await applyToSimilar.mutateAsync({ pattern: similarPrompt.pattern, categoryId: similarPrompt.categoryId, excludeChargeId: charge.id })
    } finally {
      setSimilarPrompt(null)
    }
  }

  const handleDismissPrompt = () => {
    setSimilarPrompt(null)
    patchCacheCategory(optimisticCatId)
  }

  const handleCreateCategory = async (name: string, color: string) => {
    const newCat = await createCategory.mutateAsync({ name, color })
    setShowNewModal(false)
    await handleCategoryChange(newCat.id)
  }

  const patchCacheShared = (shared: boolean) => {
    queryClient.setQueriesData<Charge[]>(
      { queryKey: ['charges'] },
      (old) => old?.map((c) => c.id === charge.id ? { ...c, is_shared: shared } : c),
    )
  }

  const handleToggleShare = async () => {
    if (shareCharge.isPending || bulkUnshare.isPending) return
    setOptimisticConfirmed(!isShared)
    try {
      if (isShared) {
        await bulkUnshare.mutateAsync([charge.id])
        patchCacheShared(false)
      } else {
        const result = await shareCharge.mutateAsync(charge.id)
        patchCacheShared(true)
        if (result.similar_count > 0) {
          setSimilarSharePrompt({ count: result.similar_count, pattern: result.suggested_pattern })
        }
      }
    } catch {
      setOptimisticConfirmed(null)
    }
  }

  const handleApplyShareToSimilar = async () => {
    if (!similarSharePrompt) return
    try {
      await shareSimilar.mutateAsync({ pattern: similarSharePrompt.pattern, excludeChargeId: charge.id })
    } finally {
      setSimilarSharePrompt(null)
    }
  }

  const isIncome = Number(charge.amount) < 0
  const formattedAmount = new Intl.NumberFormat('es-CL', {
    style: 'currency', currency: charge.currency || 'CLP', maximumFractionDigits: 0,
  }).format(Math.abs(Number(charge.amount)))

  const formattedDate = new Date(charge.date + 'T00:00:00').toLocaleDateString('es-ES', {
    day: 'numeric', month: 'short',
  })

  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-gray-900 line-clamp-2 break-words">{charge.description}</p>
          <p className={`text-sm font-semibold whitespace-nowrap ${isIncome ? 'text-emerald-600' : 'text-gray-900'}`}>
            {isIncome ? '+' : ''}{formattedAmount}
          </p>
        </div>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span className="text-xs text-gray-400">{formattedDate}</span>

          {/* Category trigger — opens bottom sheet */}
          <button
            onClick={() => !updateCategory.isPending && setSheetOpen(true)}
            disabled={updateCategory.isPending}
            className="flex items-center gap-1.5 text-xs rounded-lg px-2 py-1.5 border border-gray-200 active:bg-gray-50 transition-colors disabled:opacity-60 disabled:cursor-wait"
            style={{ borderLeftColor: currentCat?.color ?? undefined, borderLeftWidth: currentCat?.color ? 3 : undefined }}
          >
            {updateCategory.isPending ? (
              <Spinner size="sm" />
            ) : currentCat?.color ? (
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: currentCat.color }} />
            ) : null}
            <span className="max-w-[110px] truncate">{currentCat?.name ?? 'Sin categoría'}</span>
            {!updateCategory.isPending && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
                strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 shrink-0 text-gray-400">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            )}
          </button>

          {!isShared && charge.ai_suggested && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">IA</span>
          )}
          {charge.statement_type === 'manual' && (
            <button
              onClick={() => deleteCharge.mutate(charge.id)}
              disabled={deleteCharge.isPending}
              className="text-xs text-red-400 active:text-red-600 disabled:opacity-40 ml-auto"
            >
              Eliminar
            </button>
          )}
        </div>
      </div>

      {sheetOpen && (
        <CategorySheet
          categories={categories}
          value={currentCatId ?? null}
          onChange={handleCategoryChange}
          onClose={() => setSheetOpen(false)}
          onCreateNew={() => setShowNewModal(true)}
        />
      )}
      {showNewModal && (
        <NewCategoryModal
          onConfirm={handleCreateCategory}
          onClose={() => setShowNewModal(false)}
          isPending={createCategory.isPending}
        />
      )}

      {similarPrompt && (
        <div className="fixed bottom-20 left-4 right-4 z-50 bg-indigo-600 text-white rounded-xl shadow-lg px-4 py-3 flex flex-col gap-2">
          <p className="text-sm">
            ¿Aplicar <strong>{similarPrompt.categoryName}</strong> a {similarPrompt.count} cargo{similarPrompt.count !== 1 ? 's' : ''} con "{similarPrompt.pattern}"?
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleApplyToSimilar}
              disabled={applyToSimilar.isPending}
              className="flex-1 py-2 text-sm font-medium bg-white text-indigo-700 rounded-lg disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {applyToSimilar.isPending ? <Spinner size="sm" /> : 'Sí, aplicar a todos'}
            </button>
            <button
              onClick={handleDismissPrompt}
              className="flex-1 py-2 text-sm font-medium border border-white/40 rounded-lg"
            >
              Solo este
            </button>
          </div>
        </div>
      )}

      {similarSharePrompt && (
        <div className="fixed bottom-20 left-4 right-4 z-50 bg-green-600 text-white rounded-xl shadow-lg px-4 py-3 flex flex-col gap-2">
          <p className="text-sm">
            ¿Compartir también {similarSharePrompt.count} gasto{similarSharePrompt.count !== 1 ? 's' : ''} con <strong>"{similarSharePrompt.pattern}"</strong>?
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleApplyShareToSimilar}
              disabled={shareSimilar.isPending}
              className="flex-1 py-2 text-sm font-medium bg-white text-green-700 rounded-lg disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {shareSimilar.isPending ? <Spinner size="sm" /> : 'Sí, compartir todos'}
            </button>
            <button
              onClick={() => setSimilarSharePrompt(null)}
              className="flex-1 py-2 text-sm font-medium border border-white/40 rounded-lg"
            >
              Solo este
            </button>
          </div>
        </div>
      )}

      {/* Tap-to-confirm button — 44px touch target */}
      <button
        onClick={handleToggleShare}
        disabled={false}
        className={`shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-90 ${
          isShared
            ? 'bg-green-500 text-white'
            : 'border-2 border-gray-300 text-gray-300 hover:border-green-400 hover:text-green-400'
        }`}
        aria-label={isShared ? 'Compartido con familia' : 'Compartir con familia'}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
          strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </button>
    </div>
  )
}

// ── Date grouping helper ──────────────────────────────────────────────────────
function groupChargesByDate(charges: Charge[]) {
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

// ── Page ─────────────────────────────────────────────────────────────────────
export default function ChargesPage() {
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1

  const [filterMonth, setFilterMonth] = useState<number | undefined>(currentMonth)
  const [filterYear, setFilterYear] = useState<number | undefined>(currentYear)
  const [sortField, setSortField] = useState<SortField>('date')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [searchDesc, setSearchDesc] = useState('')
  const [filterCategoryId, setFilterCategoryId] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<'all' | 'shared' | 'personal'>('all')
  const [filterType, setFilterType] = useState<string>('')
  const [filterKind, setFilterKind] = useState<'all' | 'income' | 'expense'>('all')
  const [filterBank, setFilterBank] = useState<string>('')

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const [warningsOpen, setWarningsOpen] = useState(true)

  const { data: allCharges, isLoading } = useCharges(filterMonth, filterYear)
  const { data: categories = [] } = useCategories()
  const bulkConfirm = useBulkConfirm()
  const bulkUnshare = useBulkUnshare()

  const availableBanks = [...new Set((allCharges || []).map((c) => c.bank_hint).filter((b): b is string => !!b && b !== 'manual'))].sort()

  const possibleDuplicates = (() => {
    const counts = new Map<string, number>()
    for (const c of allCharges ?? []) {
      if (c.cuota_total && c.cuota_total > 1) continue
      const k = `${c.description.toLowerCase().trim()}|${c.amount}`
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    return [...counts.entries()]
      .filter(([, n]) => n > 1)
      .map(([k, count]) => {
        const sep = k.lastIndexOf('|')
        return { description: k.slice(0, sep), count, amount: Number(k.slice(sep + 1)) }
      })
  })()

  let charges = allCharges || []
  charges = filterCharges(charges, searchDesc, filterCategoryId, filterStatus, filterType, filterKind, filterBank || undefined)
  charges = sortCharges(charges, sortField, sortOrder)

  const handleSelect = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked && charges) setSelectedIds(new Set(charges.map((c) => c.id)))
    else setSelectedIds(new Set())
  }

  const handleBulkConfirm = async () => {
    if (selectedIds.size === 0) return
    try {
      const result = await bulkConfirm.mutateAsync(Array.from(selectedIds))
      setToast({ message: `${result.confirmed} gastos compartidos con la familia`, type: 'success' })
      setSelectedIds(new Set())
    } catch {
      setToast({ message: 'Error al compartir gastos', type: 'error' })
    }
  }

  const handleBulkUnshare = async () => {
    if (selectedIds.size === 0) return
    try {
      const result = await bulkUnshare.mutateAsync(Array.from(selectedIds))
      setToast({ message: `${result.unshared} gastos dejaron de compartirse`, type: 'success' })
      setSelectedIds(new Set())
    } catch {
      setToast({ message: 'Error al dejar de compartir gastos', type: 'error' })
    }
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortOrder('asc') }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <span className="text-gray-300 ml-1">↕</span>
    return <span className="text-brand-600 ml-1 font-bold">{sortOrder === 'asc' ? '↑' : '↓'}</span>
  }

  const years = Array.from({ length: 5 }, (_, i) => currentYear - i)

  const emptyMessage = (
    <div className="text-center py-12 text-gray-400 px-4">
      <p className="text-base">{allCharges?.length === 0 ? 'No hay movimientos para el período seleccionado' : 'No hay resultados con los filtros aplicados'}</p>
      <p className="text-sm mt-1">Sube una cartola en "Subir"</p>
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {filterKind === 'income' ? 'Ingresos' : filterKind === 'expense' ? 'Gastos' : 'Movimientos'}
        </h1>
        {selectedIds.size > 0 && (
          <div className="hidden md:flex gap-2">
            <button onClick={handleBulkConfirm} className="btn-primary" disabled={bulkConfirm.isPending}>
              {bulkConfirm.isPending ? <Spinner size="sm" /> : `Compartir ${selectedIds.size}`}
            </button>
            <button onClick={handleBulkUnshare} className="btn-secondary" disabled={bulkUnshare.isPending}>
              {bulkUnshare.isPending ? <Spinner size="sm" /> : `Dejar de compartir ${selectedIds.size}`}
            </button>
          </div>
        )}
      </div>

      {/* Date filters */}
      <div className="flex gap-2 mb-4">
        <select className="input flex-1" value={filterMonth ?? ''} onChange={(e) => setFilterMonth(e.target.value ? Number(e.target.value) : undefined)}>
          <option value="">Todos los meses</option>
          {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
        </select>
        <select className="input w-24" value={filterYear ?? ''} onChange={(e) => setFilterYear(e.target.value ? Number(e.target.value) : undefined)}>
          <option value="">Todos los años</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Counters */}
      <div className="flex gap-2 mb-4">
        {isLoading ? (
          <>
            <Skeleton className="h-9 w-28 rounded-xl" />
            <Skeleton className="h-9 w-28 rounded-xl" />
            <Skeleton className="h-9 w-28 rounded-xl" />
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-xl">
              <span className="text-sm">📋</span>
              <span className="text-sm font-bold text-gray-800">{allCharges?.length ?? 0}</span>
              <span className="text-xs text-gray-500">movimientos</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-xl">
              <span className="text-sm">🙋</span>
              <span className="text-sm font-bold text-gray-800">{allCharges?.filter((c) => !c.is_shared).length ?? 0}</span>
              <span className="text-xs text-gray-500">solo míos</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-xl">
              <span className="text-sm">👨‍👩‍👧</span>
              <span className="text-sm font-bold text-green-700">{allCharges?.filter((c) => c.is_shared).length ?? 0}</span>
              <span className="text-xs text-green-600">compartidos</span>
            </div>
          </>
        )}
      </div>

      {/* Duplicate charges warning */}
      {!isLoading && possibleDuplicates.length > 0 && (
        <div className="mb-4 border border-amber-200 bg-amber-50 rounded-lg overflow-hidden">
          <button
            onClick={() => setWarningsOpen((o) => !o)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-amber-800 hover:bg-amber-100 transition-colors"
          >
            <span className="flex items-center gap-2">
              <span>⚠️</span>
              <span>
                {possibleDuplicates.length} posible{possibleDuplicates.length !== 1 ? 's' : ''} duplicado{possibleDuplicates.length !== 1 ? 's' : ''}
              </span>
            </span>
            <span className="text-amber-500 text-xs">{warningsOpen ? '▲ Ocultar' : '▼ Ver'}</span>
          </button>
          {warningsOpen && (
            <div className="border-t border-amber-200 px-4 py-3 space-y-1.5">
              {possibleDuplicates.map((w) => (
                <div key={`${w.description}|${w.amount}`} className="text-sm text-amber-800 flex items-start gap-2">
                  <span className="shrink-0 mt-0.5">🔁</span>
                  <span>
                    <strong className="capitalize">{w.description}</strong> aparece {w.count} veces
                    con el mismo monto (<strong>{new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Math.abs(w.amount))}</strong>).
                    ¿La cartola fue cargada más de una vez?
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Search and filter controls */}
      <div className="bg-gray-50 p-4 rounded-lg mb-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="label text-xs">Tipo de movimiento</label>
            <select className="input" value={filterKind} onChange={(e) => setFilterKind(e.target.value as 'all' | 'income' | 'expense')}>
              <option value="all">Todos</option>
              <option value="expense">Gastos</option>
              <option value="income">Ingresos</option>
            </select>
          </div>
          <div>
            <label className="label text-xs">Buscar descripción</label>
            <input type="text" placeholder="UBER, JUMBO, Netflix..." className="input" value={searchDesc} onChange={(e) => setSearchDesc(e.target.value)} />
          </div>
          <div>
            <label className="label text-xs">Categoría</label>
            <select className="input" value={filterCategoryId ?? ''} onChange={(e) => setFilterCategoryId(e.target.value || null)}>
              <option value="">Todas las categorías</option>
              <option value="none">Sin categoría</option>
              {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label text-xs">Tipo de cuenta</label>
            <select className="input" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="">Todos los tipos</option>
              <option value="checking">Cuenta Corriente</option>
              <option value="credit_card">Tarjeta de Crédito</option>
              <option value="credit_line">Línea de Crédito</option>
              <option value="manual">Efectivo</option>
            </select>
          </div>
          <div>
            <label className="label text-xs">Estado</label>
            <select className="input" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as 'all' | 'shared' | 'personal')}>
              <option value="all">Todos</option>
              <option value="shared">✓ Compartidos con familia</option>
              <option value="personal">⊘ Solo míos</option>
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
        {(filterKind !== 'all' || searchDesc || filterCategoryId || filterStatus !== 'all' || filterType || filterBank) && (
          <div className="text-xs text-gray-600 pt-1">
            Mostrando {charges.length} de {allCharges?.length || 0} movimientos
          </div>
        )}
      </div>

      <div className="card p-0 overflow-hidden">

        {/* ── Mobile card list ── */}
        <div className="md:hidden">
          {isLoading ? (
            <div className="divide-y divide-gray-100">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                  <div className="flex-1 space-y-2">
                    <div className="flex justify-between gap-2">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-4 w-16 shrink-0" />
                    </div>
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                </div>
              ))}
            </div>
          ) : !charges.length ? emptyMessage : (
            <div>
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                <span className="text-xs text-gray-500 font-medium">{charges.length} movimientos</span>
              </div>
              {groupChargesByDate(charges).map((group) => (
                <div key={group.date}>
                  <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-100">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{group.label}</span>
                    <span className={`text-xs font-medium ${group.total < 0 ? 'text-emerald-500' : 'text-gray-400'}`}>
                      {group.total < 0 ? '+' : ''}{new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Math.abs(group.total))}
                    </span>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {group.charges.map((charge) => (
                      <MobileChargeCard key={charge.id} charge={charge} categories={categories} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Desktop table ── */}
        <div className="hidden md:block">
          {isLoading ? (
            <div className="flex justify-center py-12"><Spinner size="lg" /></div>
          ) : !charges.length ? emptyMessage : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left w-12">
                    <input type="checkbox" onChange={(e) => handleSelectAll(e.target.checked)} checked={selectedIds.size === charges.length && charges.length > 0} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:bg-gray-100" onClick={() => handleSort('date')}>Fecha <SortIcon field="date" /></th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:bg-gray-100" onClick={() => handleSort('description')}>Descripción <SortIcon field="description" /></th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:bg-gray-100" onClick={() => handleSort('amount')}>Monto <SortIcon field="amount" /></th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:bg-gray-100" onClick={() => handleSort('category')}>Categoría <SortIcon field="category" /></th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:bg-gray-100" onClick={() => handleSort('status')}>Estado <SortIcon field="status" /></th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Banco</th>
                  <th className="w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {charges.map((charge) => (
                  <ChargeRow key={charge.id} charge={charge} categories={categories} selected={selectedIds.has(charge.id)} onSelect={handleSelect} viewMonth={filterMonth} viewYear={filterYear} />
                ))}
              </tbody>
            </table>
          )}
        </div>

      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
