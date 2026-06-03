import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Charge, Category } from '../../shared/types'
import { useUpdateCategory, useDeleteCharge, useApplyToSimilar, useCreateCategory } from './useCharges'
import Spinner from '../../shared/components/Spinner'
import NewCategoryModal from '../../shared/components/NewCategoryModal'

interface ChargeRowProps {
  charge: Charge
  categories: Category[]
  selected: boolean
  onSelect: (id: string, checked: boolean) => void
  viewMonth?: number
  viewYear?: number
}

interface SimilarPrompt {
  count: number
  pattern: string
  categoryId: string
  categoryName: string
}

export default function ChargeRow({ charge, categories, selected, onSelect, viewMonth, viewYear }: ChargeRowProps) {
  const queryClient = useQueryClient()
  const updateCategory = useUpdateCategory()
  const createCategory = useCreateCategory()
  const applyToSimilar = useApplyToSimilar()
  const deleteCharge = useDeleteCharge()
  const [optimisticCatId, setOptimisticCatId] = useState<string | null>(null)
  const [similarPrompt, setSimilarPrompt] = useState<SimilarPrompt | null>(null)
  const [showNewModal, setShowNewModal] = useState(false)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['charges'] })

  const currentCatId = optimisticCatId ?? charge.category_id
  const currentCat = categories.find((c) => c.id === currentCatId)

  const handleCategoryChange = async (categoryId: string) => {
    if (categoryId === '__new__') {
      setShowNewModal(true)
      return
    }
    setSimilarPrompt(null)
    setOptimisticCatId(categoryId)
    try {
      const result = await updateCategory.mutateAsync({ chargeId: charge.id, categoryId })
      if (result.similar_count > 0) {
        const catName = categories.find((c) => c.id === categoryId)?.name ?? ''
        setSimilarPrompt({ count: result.similar_count, pattern: result.suggested_pattern, categoryId, categoryName: catName })
      } else {
        invalidate()
      }
    } catch {
      setOptimisticCatId(null)
    }
  }

  const handleCreateCategory = async (name: string, color: string) => {
    const newCat = await createCategory.mutateAsync({ name, color })
    setShowNewModal(false)
    await handleCategoryChange(newCat.id)
  }

  const handleApplyToSimilar = async () => {
    if (!similarPrompt) return
    try {
      await applyToSimilar.mutateAsync({ pattern: similarPrompt.pattern, categoryId: similarPrompt.categoryId, excludeChargeId: charge.id })
    } finally {
      setSimilarPrompt(null)
      // applyToSimilar.onSuccess already invalidates
    }
  }

  const handleDismissPrompt = () => {
    setSimilarPrompt(null)
    invalidate()
  }

  const isIncome = Number(charge.amount) < 0
  const formattedAmount = new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: charge.currency || 'CLP',
    maximumFractionDigits: 0,
  }).format(Math.abs(Number(charge.amount)))

  // Parse date as local time (appending T12:00:00 avoids UTC-midnight timezone shifts)
  const chargeDate = new Date(charge.date + 'T12:00:00')
  const formattedDate = chargeDate.toLocaleDateString('es-ES')
  const isOutOfMonth =
    viewMonth !== undefined && viewYear !== undefined &&
    (chargeDate.getMonth() + 1 !== viewMonth || chargeDate.getFullYear() !== viewYear)

  return (
    <>
      <tr className={`hover:bg-gray-50 ${selected ? 'bg-brand-50' : ''}`}>
        <td className="px-4 py-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onSelect(charge.id, e.target.checked)}
            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
        </td>
        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
          <span className="flex items-center gap-1.5">
            {formattedDate}
            {isOutOfMonth && (
              <span
                title="La fecha de este gasto no corresponde al mes visualizado"
                className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-100 text-amber-600 text-[9px] font-bold leading-none cursor-default shrink-0"
              >
                !
              </span>
            )}
          </span>
        </td>
        <td className="px-4 py-3 text-sm text-gray-900 max-w-xs truncate" title={charge.description}>
          {isIncome && <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1.5 shrink-0" />}
          {charge.description}
        </td>
        <td className={`px-4 py-3 text-sm font-medium text-right whitespace-nowrap ${isIncome ? 'text-emerald-600' : 'text-gray-900'}`}>
          {isIncome ? '+' : ''}{formattedAmount}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            <select
              value={currentCatId ?? ''}
              onChange={(e) => handleCategoryChange(e.target.value)}
              disabled={updateCategory.isPending}
              className="text-sm border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-500 w-40 disabled:opacity-60 disabled:cursor-wait"
              style={{ borderLeftColor: currentCat?.color ?? undefined, borderLeftWidth: currentCat?.color ? 3 : undefined }}
            >
              <option value="">Sin categoría</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
              <option value="__new__">➕ Nueva categoría...</option>
            </select>
            {updateCategory.isPending && <Spinner size="sm" />}
          </div>
        </td>
        <td className="px-4 py-3 text-center">
          {charge.is_shared ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800 font-medium">Compartido</span>
          ) : (
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">Solo mío</span>
          )}
        </td>
        <td className="px-2 py-3 text-center">
          {charge.statement_type === 'manual' && (
            <button
              onClick={() => deleteCharge.mutate(charge.id)}
              disabled={deleteCharge.isPending}
              className="text-xs text-red-400 hover:text-red-600 disabled:opacity-40"
            >
              Eliminar
            </button>
          )}
        </td>
      </tr>
      {similarPrompt && (
        <tr className="bg-indigo-50 border-t border-indigo-100">
          <td colSpan={7} className="px-4 py-2">
            <div className="flex items-center gap-3 text-sm">
              <span className="text-indigo-700">
                ¿Aplicar <strong>{similarPrompt.categoryName}</strong> a {similarPrompt.count} cargo{similarPrompt.count !== 1 ? 's' : ''} con <strong>"{similarPrompt.pattern}"</strong>?
              </span>
              <button
                onClick={handleApplyToSimilar}
                disabled={applyToSimilar.isPending}
                className="px-3 py-1 text-xs font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5"
              >
                {applyToSimilar.isPending ? <Spinner size="sm" /> : 'Sí, aplicar a todos'}
              </button>
              <button
                onClick={handleDismissPrompt}
                className="px-3 py-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
              >
                Solo este
              </button>
            </div>
          </td>
        </tr>
      )}
      {showNewModal && (
        <NewCategoryModal
          onConfirm={handleCreateCategory}
          onClose={() => setShowNewModal(false)}
          isPending={createCategory.isPending}
        />
      )}
    </>
  )
}
