import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Charge, Category } from '../../shared/types'
import { useUpdateCategory, useDeleteCharge, useApplyToSimilar, useCreateCategory, useShareCharge, useShareSimilar, useBulkUnshare } from './useCharges'
import Spinner from '../../shared/components/Spinner'
import NewCategoryModal from '../../shared/components/NewCategoryModal'
import { isSelfTransfer } from '../../shared/utils/selfTransfer'
import BankBadge from '../../shared/components/BankBadge'

interface ChargeRowProps {
  charge: Charge
  categories: Category[]
  selected: boolean
  onSelect: (id: string, checked: boolean) => void
  viewMonth?: number
  viewYear?: number
  userFullName?: string | null
}

interface SimilarPrompt {
  count: number
  pattern: string
  categoryId: string
  categoryName: string
}

interface SimilarSharePrompt {
  count: number
  pattern: string
}

export default function ChargeRow({ charge, categories, selected, onSelect, viewMonth, viewYear, userFullName }: ChargeRowProps) {
  const queryClient = useQueryClient()
  const updateCategory = useUpdateCategory()
  const createCategory = useCreateCategory()
  const applyToSimilar = useApplyToSimilar()
  const deleteCharge = useDeleteCharge()
  const shareCharge = useShareCharge()
  const shareSimilar = useShareSimilar()
  const bulkUnshare = useBulkUnshare()
  const [optimisticCatId, setOptimisticCatId] = useState<string | null>(null)
  const [optimisticShared, setOptimisticShared] = useState<boolean | null>(null)
  const [similarSharePrompt, setSimilarSharePrompt] = useState<SimilarSharePrompt | null>(null)
  const [similarPrompt, setSimilarPrompt] = useState<SimilarPrompt | null>(null)
  const [showNewModal, setShowNewModal] = useState(false)

  const patchCacheCategory = (catId: string | null) => {
    queryClient.setQueriesData<Charge[]>(
      { queryKey: ['charges'] },
      (old) => old?.map((c) => c.id === charge.id ? { ...c, category_id: catId } : c),
    )
  }

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
        patchCacheCategory(categoryId || null)
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
    patchCacheCategory(optimisticCatId)
  }

  const isShared = optimisticShared ?? charge.is_shared

  const handleShare = async () => {
    setOptimisticShared(true)
    try {
      const result = await shareCharge.mutateAsync(charge.id)
      patchCacheShared(true)
      if (result.similar_count > 0) {
        setSimilarSharePrompt({ count: result.similar_count, pattern: result.suggested_pattern })
      }
    } catch {
      setOptimisticShared(null)
    }
  }

  const handleUnshare = async () => {
    setOptimisticShared(false)
    try {
      await bulkUnshare.mutateAsync([charge.id])
      patchCacheShared(false)
    } catch {
      setOptimisticShared(null)
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

  const patchCacheShared = (isShared: boolean) => {
    queryClient.setQueriesData<Charge[]>(
      { queryKey: ['charges'] },
      (old) => old?.map((c) => c.id === charge.id ? { ...c, is_shared: isShared } : c),
    )
  }

  const isIncome = Number(charge.amount) < 0
  const selfTransfer = isSelfTransfer(charge, userFullName)
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
      <tr className={`transition-colors ${selected ? 'bg-brand-50' : 'hover:bg-[#FAFAFA]'}`}>
        <td className="px-4 py-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onSelect(charge.id, e.target.checked)}
            className="rounded border-[#D4D4D8] text-brand-600 focus:ring-brand-500"
          />
        </td>
        <td className="px-4 py-3 text-sm text-[#71717A] whitespace-nowrap">
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
        <td className="px-4 py-3 text-sm text-[#18181B] max-w-xs" title={charge.description}>
          <div className="flex items-center gap-1.5 min-w-0">
            {isIncome && <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 shrink-0" />}
            <span className="truncate">{charge.description}</span>
            {selfTransfer && (
              <span className="shrink-0 text-xs font-medium px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-600 border border-brand-100 whitespace-nowrap">
                Transf. propia
              </span>
            )}
          </div>
        </td>
        <td className={`px-4 py-3 text-sm font-semibold text-right whitespace-nowrap tabular-nums ${isIncome ? 'text-emerald-600' : selfTransfer ? 'text-blue-500' : 'text-[#18181B]'}`}>
          {isIncome ? '+' : ''}{formattedAmount}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            <select
              value={currentCatId ?? ''}
              onChange={(e) => handleCategoryChange(e.target.value)}
              disabled={updateCategory.isPending}
              className="text-sm border border-[#E4E4E7] rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-500 w-40 disabled:opacity-60 disabled:cursor-wait bg-white"
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
          {isShared ? (
            <button
              onClick={handleUnshare}
              disabled={bulkUnshare.isPending || shareCharge.isPending}
              className="text-xs px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 font-medium border border-brand-200 hover:bg-brand-100 disabled:opacity-60 transition-colors"
            >
              Compartido
            </button>
          ) : (
            <button
              onClick={handleShare}
              disabled={shareCharge.isPending || bulkUnshare.isPending}
              className="text-xs px-2.5 py-1 rounded-full bg-[#F4F4F5] text-[#71717A] border border-[#E4E4E7] hover:bg-[#E4E4E7] disabled:opacity-60 transition-colors"
            >
              {shareCharge.isPending ? <Spinner size="sm" /> : 'Solo mío'}
            </button>
          )}
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          {charge.bank_hint && charge.bank_hint !== 'manual'
            ? <BankBadge bank={charge.bank_hint} />
            : <span className="text-[#D4D4D8]">—</span>}
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
        <tr className="bg-brand-50 border-t border-brand-100">
          <td colSpan={8} className="px-4 py-2">
            <div className="flex items-center gap-3 text-sm">
              <span className="text-brand-700">
                ¿Aplicar <strong>{similarPrompt.categoryName}</strong> a {similarPrompt.count} cargo{similarPrompt.count !== 1 ? 's' : ''} con <strong>"{similarPrompt.pattern}"</strong> en todos los meses? Las próximas cartolas también se categorizarán automáticamente.
              </span>
              <button
                onClick={handleApplyToSimilar}
                disabled={applyToSimilar.isPending}
                className="px-3 py-1 text-xs font-medium bg-brand-600 text-white rounded-md hover:bg-brand-700 disabled:opacity-50 flex items-center gap-1.5 shrink-0"
              >
                {applyToSimilar.isPending ? <Spinner size="sm" /> : 'Sí, aplicar a todos'}
              </button>
              <button
                onClick={handleDismissPrompt}
                className="px-3 py-1 text-xs font-medium text-brand-600 hover:text-brand-800 shrink-0"
              >
                No, solo este
              </button>
            </div>
          </td>
        </tr>
      )}
      {similarSharePrompt && (
        <tr className="bg-green-50 border-t border-green-100">
          <td colSpan={8} className="px-4 py-2">
            <div className="flex items-center gap-3 text-sm">
              <span className="text-green-700">
                ¿Compartir también {similarSharePrompt.count} gasto{similarSharePrompt.count !== 1 ? 's' : ''} con <strong>"{similarSharePrompt.pattern}"</strong>?
              </span>
              <button
                onClick={handleApplyShareToSimilar}
                disabled={shareSimilar.isPending}
                className="px-3 py-1 text-xs font-medium bg-brand-600 text-white rounded-md hover:bg-brand-700 disabled:opacity-50 flex items-center gap-1.5"
              >
                {shareSimilar.isPending ? <Spinner size="sm" /> : 'Sí, compartir todos'}
              </button>
              <button
                onClick={() => setSimilarSharePrompt(null)}
                className="px-3 py-1 text-xs font-medium text-green-600 hover:text-green-800"
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
