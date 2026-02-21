import { useState } from 'react'
import { useCharges, useCategories, useBulkConfirm, sortCharges, filterCharges, SortField, SortOrder } from './useCharges'
import ChargeRow from './ChargeRow'
import Spinner from '../../shared/components/Spinner'
import Toast from '../../shared/components/Toast'

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export default function ChargesPage() {
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1

  // Date filter
  const [filterMonth, setFilterMonth] = useState<number | undefined>(currentMonth)
  const [filterYear, setFilterYear] = useState<number | undefined>(currentYear)

  // Sorting
  const [sortField, setSortField] = useState<SortField>('date')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

  // Search and filtering
  const [searchDesc, setSearchDesc] = useState('')
  const [filterCategoryId, setFilterCategoryId] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<'all' | 'confirmed' | 'pending'>('all')

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // Queries
  const { data: allCharges, isLoading } = useCharges(filterMonth, filterYear)
  const { data: categories = [] } = useCategories()
  const bulkConfirm = useBulkConfirm()

  // Apply filters and sorts
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
      setToast({ message: `${result.confirmed} movimientos confirmados`, type: 'success' })
      setSelectedIds(new Set())
    } catch {
      setToast({ message: 'Error al confirmar movimientos', type: 'error' })
    }
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <span className="text-gray-300 ml-1">↕</span>
    return <span className="text-brand-600 ml-1 font-bold">{sortOrder === 'asc' ? '↑' : '↓'}</span>
  }

  const years = Array.from({ length: 5 }, (_, i) => currentYear - i)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Movimientos</h1>
        {selectedIds.size > 0 && (
          <button onClick={handleBulkConfirm} className="btn-primary" disabled={bulkConfirm.isPending}>
            {bulkConfirm.isPending ? <Spinner size="sm" /> : `Confirmar ${selectedIds.size} seleccionados`}
          </button>
        )}
      </div>

      {/* Date filters */}
      <div className="flex gap-3 mb-4">
        <select
          className="input w-40"
          value={filterMonth ?? ''}
          onChange={(e) => setFilterMonth(e.target.value ? Number(e.target.value) : undefined)}
        >
          <option value="">Todos los meses</option>
          {MONTHS.map((m, i) => (
            <option key={i + 1} value={i + 1}>{m}</option>
          ))}
        </select>
        <select
          className="input w-28"
          value={filterYear ?? ''}
          onChange={(e) => setFilterYear(e.target.value ? Number(e.target.value) : undefined)}
        >
          <option value="">Todos los años</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* Search and filter controls */}
      <div className="bg-gray-50 p-4 rounded-lg mb-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Search by description */}
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

          {/* Filter by category */}
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

          {/* Filter by status */}
          <div>
            <label className="label text-xs">Estado</label>
            <select
              className="input"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
            >
              <option value="all">Todos</option>
              <option value="confirmed">✓ Confirmados</option>
              <option value="pending">⊘ Pendientes</option>
            </select>
          </div>
        </div>

        {/* Active filters display */}
        {(searchDesc || filterCategoryId || filterStatus !== 'all') && (
          <div className="text-xs text-gray-600 pt-2">
            Mostrando {charges.length} de {allCharges?.length || 0} movimientos
            {searchDesc && ` • Búsqueda: "${searchDesc}"`}
            {filterCategoryId && ` • Categoría: ${categories.find(c => c.id === filterCategoryId)?.name}`}
            {filterStatus !== 'all' && ` • Estado: ${filterStatus}`}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner size="lg" /></div>
        ) : !charges || charges.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-lg">{allCharges?.length === 0 ? 'No hay movimientos para el período seleccionado' : 'No hay resultados con los filtros aplicados'}</p>
            <p className="text-sm mt-1">Sube una cartola en la sección "Subir Cartola"</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left w-12">
                  <input
                    type="checkbox"
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    checked={selectedIds.size === charges.length && charges.length > 0}
                    className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('date')}
                >
                  Fecha <SortIcon field="date" />
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('description')}
                >
                  Descripción <SortIcon field="description" />
                </th>
                <th
                  className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('amount')}
                >
                  Monto <SortIcon field="amount" />
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('category')}
                >
                  Categoría <SortIcon field="category" />
                </th>
                <th
                  className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('status')}
                >
                  Estado <SortIcon field="status" />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {charges.map((charge) => (
                <ChargeRow
                  key={charge.id}
                  charge={charge}
                  categories={categories}
                  selected={selectedIds.has(charge.id)}
                  onSelect={handleSelect}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
