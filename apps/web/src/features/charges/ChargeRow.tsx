import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Charge, Category } from '../../shared/types'
import { useUpdateCategory, useDeleteCharge, useApplyToSimilar } from './useCharges'
import Spinner from '../../shared/components/Spinner'

interface ChargeRowProps {
  charge: Charge
  categories: Category[]
  selected: boolean
  onSelect: (id: string, checked: boolean) => void
}

interface SimilarPrompt {
  count: number
  pattern: string
  categoryId: string
  categoryName: string
}

export default function ChargeRow({ charge, categories, selected, onSelect }: ChargeRowProps) {
  const queryClient = useQueryClient()
  const updateCategory = useUpdateCategory()
  const applyToSimilar = useApplyToSimilar()
  const deleteCharge = useDeleteCharge()
  const [optimisticCatId, setOptimisticCatId] = useState<string | null>(null)
  const [similarPrompt, setSimilarPrompt] = useState<SimilarPrompt | null>(null)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['charges'] })

  const currentCatId = optimisticCatId ?? charge.category_id
  const currentCat = categories.find((c) => c.id === currentCatId)

  const handleCategoryChange = async (categoryId: string) => {
    setSimilarPrompt(null)
    setOptimisticCatId(categoryId)
    try {
      const result = await updateCategory.mutateAsync({ chargeId: charge.id, categoryId })
      if (result.similar_count > 0) {
        const catName = categories.find((c) => c.id === categoryId)?.name ?? ''
        setSimilarPrompt({ count: result.similar_count, pattern: result.suggested_pattern, categoryId, categoryName: catName })
        // delay invalidation until user decides — keeps the row visible while prompt is shown
      } else {
        invalidate()
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

  const formattedDate = new Date(charge.date).toLocaleDateString('es-ES')

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
        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{formattedDate}</td>
        <td className="px-4 py-3 text-sm text-gray-900 max-w-xs truncate">
          {isIncome && <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1.5 shrink-0" />}
          {charge.description}
        </td>
        <td className={`px-4 py-3 text-sm font-medium text-right whitespace-nowrap ${isIncome ? 'text-emerald-600' : 'text-gray-900'}`}>
          {isIncome ? '+' : ''}{formattedAmount}
        </td>
        <td className="px-4 py-3">
          <select
            value={currentCatId ?? ''}
            onChange={(e) => handleCategoryChange(e.target.value)}
            className="text-sm border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-500 w-40"
            style={{ borderLeftColor: currentCat?.color ?? undefined, borderLeftWidth: currentCat?.color ? 3 : undefined }}
          >
            <option value="">Sin categoría</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
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
    </>
  )
}
