import { useState } from 'react'
import { Charge, Category } from '../../shared/types'
import { useUpdateCategory } from './useCharges'

interface ChargeRowProps {
  charge: Charge
  categories: Category[]
  selected: boolean
  onSelect: (id: string, checked: boolean) => void
}

export default function ChargeRow({ charge, categories, selected, onSelect }: ChargeRowProps) {
  const updateCategory = useUpdateCategory()
  const [optimisticCatId, setOptimisticCatId] = useState<string | null>(null)

  const currentCatId = optimisticCatId ?? charge.category_id
  const currentCat = categories.find((c) => c.id === currentCatId)

  const handleCategoryChange = async (categoryId: string) => {
    setOptimisticCatId(categoryId)
    try {
      await updateCategory.mutateAsync({ chargeId: charge.id, categoryId })
    } catch {
      setOptimisticCatId(null)
    }
  }

  const formattedAmount = new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: charge.currency || 'CLP',
    maximumFractionDigits: 0,
  }).format(charge.amount)

  const formattedDate = new Date(charge.date).toLocaleDateString('es-ES')

  return (
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
      <td className="px-4 py-3 text-sm text-gray-900 max-w-xs truncate">{charge.description}</td>
      <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right whitespace-nowrap">
        {formattedAmount}
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
        ) : charge.ai_suggested ? (
          <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 font-medium">IA</span>
        ) : (
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">Solo mío</span>
        )}
      </td>
    </tr>
  )
}
