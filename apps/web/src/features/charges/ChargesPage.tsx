import { useState } from 'react'
import { useCharges, useCategories, useBulkConfirm, useUpdateCategory, sortCharges, filterCharges, SortField, SortOrder } from './useCharges'
import { Charge, Category } from '../../shared/types'
import ChargeRow from './ChargeRow'
import Spinner from '../../shared/components/Spinner'
import Skeleton from '../../shared/components/Skeleton'
import Toast from '../../shared/components/Toast'
import CategorySheet from '../../shared/components/CategorySheet'

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

// ── Mobile card component ────────────────────────────────────────────────────
function MobileChargeCard({
  charge, categories,
}: { charge: Charge; categories: Category[] }) {
  const updateCategory = useUpdateCategory()
  const bulkConfirm = useBulkConfirm()
  const [optimisticCatId, setOptimisticCatId] = useState<string | null>(null)
  const [optimisticConfirmed, setOptimisticConfirmed] = useState<boolean | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const isConfirmed = optimisticConfirmed ?? charge.is_confirmed
  const currentCatId = optimisticCatId ?? charge.category_id
  const currentCat = categories.find((c) => c.id === currentCatId)

  const handleCategoryChange = async (categoryId: string) => {
    setOptimisticCatId(categoryId || null)
    if (!categoryId) return
    try {
      await updateCategory.mutateAsync({ chargeId: charge.id, categoryId })
    } catch {
      setOptimisticCatId(null)
    }
  }

  const handleConfirm = async () => {
    if (isConfirmed || bulkConfirm.isPending) return
    setOptimisticConfirmed(true)
    try {
      await bulkConfirm.mutateAsync([charge.id])
    } catch {
      setOptimisticConfirmed(null)
    }
  }

  const formattedAmount = new Intl.NumberFormat('es-CL', {
    style: 'currency', currency: charge.currency || 'CLP', maximumFractionDigits: 0,
  }).format(charge.amount)

  const formattedDate = new Date(charge.date + 'T00:00:00').toLocaleDateString('es-ES', {
    day: 'numeric', month: 'short',
  })

  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-gray-900 truncate">{charge.description}</p>
          <p className="text-sm font-semibold text-gray-900 whitespace-nowrap">{formattedAmount}</p>
        </div>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span className="text-xs text-gray-400">{formattedDate}</span>

          {/* Category trigger — opens bottom sheet */}
          <button
            onClick={() => setSheetOpen(true)}
            className="flex items-center gap-1.5 text-xs rounded-lg px-2 py-1.5 border border-gray-200 active:bg-gray-50 transition-colors"
            style={{ borderLeftColor: currentCat?.color ?? undefined, borderLeftWidth: currentCat?.color ? 3 : undefined }}
          >
            {currentCat?.color && (
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: currentCat.color }} />
            )}
            <span className="max-w-[110px] truncate">{currentCat?.name ?? 'Sin categoría'}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
              strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 shrink-0 text-gray-400">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {!isConfirmed && charge.ai_suggested && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">IA</span>
          )}
        </div>
      </div>

      {sheetOpen && (
        <CategorySheet
          categories={categories}
          value={currentCatId ?? null}
          onChange={handleCategoryChange}
          onClose={() => setSheetOpen(false)}
        />
      )}

      {/* Tap-to-confirm button — 44px touch target */}
      <button
        onClick={handleConfirm}
        disabled={isConfirmed}
        className={`shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-90 ${
          isConfirmed
            ? 'bg-green-500 text-white'
            : 'border-2 border-gray-300 text-gray-300 hover:border-green-400 hover:text-green-400'
        }`}
        aria-label={isConfirmed ? 'Confirmado' : 'Confirmar'}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
          strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </button>
    </div>
  )
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
  const [filterStatus, setFilterStatus] = useState<'all' | 'confirmed' | 'pending'>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const { data: allCharges, isLoading } = useCharges(filterMonth, filterYear)
  const { data: categories = [] } = useCategories()
  const bulkConfirm = useBulkConfirm()

  let charges = allCharges || []
  charges = filterCharges(charges, searchDesc, filterCategoryId, filterStatus)
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
      setToast({ message: `${result.confirmed} gastos confirmados`, type: 'success' })
      setSelectedIds(new Set())
    } catch {
      setToast({ message: 'Error al confirmar gastos', type: 'error' })
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
      <p className="text-base">{allCharges?.length === 0 ? 'No hay gastos para el período seleccionado' : 'No hay resultados con los filtros aplicados'}</p>
      <p className="text-sm mt-1">Sube una cartola en "Subir"</p>
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Gastos</h1>
        {selectedIds.size > 0 && (
          <button onClick={handleBulkConfirm} className="btn-primary hidden md:inline-flex" disabled={bulkConfirm.isPending}>
            {bulkConfirm.isPending ? <Spinner size="sm" /> : `Confirmar ${selectedIds.size}`}
          </button>
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

      {/* Search and filter controls */}
      <div className="bg-gray-50 p-4 rounded-lg mb-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="label text-xs">Buscar descripción</label>
            <input type="text" placeholder="UBER, JUMBO, Netflix..." className="input" value={searchDesc} onChange={(e) => setSearchDesc(e.target.value)} />
          </div>
          <div>
            <label className="label text-xs">Categoría</label>
            <select className="input" value={filterCategoryId ?? ''} onChange={(e) => setFilterCategoryId(e.target.value || null)}>
              <option value="">Todas las categorías</option>
              {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label text-xs">Estado</label>
            <select className="input" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as 'all' | 'confirmed' | 'pending')}>
              <option value="all">Todos</option>
              <option value="confirmed">✓ Confirmados</option>
              <option value="pending">⊘ Pendientes</option>
            </select>
          </div>
        </div>
        {(searchDesc || filterCategoryId || filterStatus !== 'all') && (
          <div className="text-xs text-gray-600 pt-1">
            Mostrando {charges.length} de {allCharges?.length || 0} gastos
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
            <div className="divide-y divide-gray-100">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                <span className="text-xs text-gray-500 font-medium">{charges.length} gastos</span>
              </div>
              {charges.map((charge) => (
                <MobileChargeCard
                  key={charge.id}
                  charge={charge}
                  categories={categories}
                />
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
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {charges.map((charge) => (
                  <ChargeRow key={charge.id} charge={charge} categories={categories} selected={selectedIds.has(charge.id)} onSelect={handleSelect} />
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
