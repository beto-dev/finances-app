import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import client from '../../shared/api/client'
import { Charge, Category } from '../../shared/types'

export type SortField = 'date' | 'description' | 'amount' | 'category' | 'status'
export type SortOrder = 'asc' | 'desc'

export function useCharges(month?: number, year?: number) {
  return useQuery<Charge[]>({
    queryKey: ['charges', month, year],
    queryFn: async () => {
      const params: Record<string, number> = {}
      if (month) params.month = month
      if (year) params.year = year
      const res = await client.get('/api/charges/', { params })
      return res.data
    },
  })
}

export function useFamilyCharges(month?: number, year?: number) {
  return useQuery<Charge[]>({
    queryKey: ['charges', 'family', month, year],
    queryFn: async () => {
      const params: Record<string, number> = {}
      if (month) params.month = month
      if (year) params.year = year
      const res = await client.get('/api/charges/family', { params })
      return res.data
    },
  })
}

export function useCategories() {
  return useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await client.get('/api/charges/categories')
      return res.data
    },
  })
}

export function useUpdateCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ chargeId, categoryId }: { chargeId: string; categoryId: string }) => {
      const res = await client.patch(`/api/charges/${chargeId}/category`, { category_id: categoryId })
      return res.data as Charge
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['charges'] })
    },
  })
}

export function useBulkConfirm() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (chargeIds: string[]) => {
      const res = await client.post('/api/charges/bulk-confirm', { charge_ids: chargeIds })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['charges'] })
    },
  })
}

// Client-side sorting and filtering utilities
export function sortCharges(charges: Charge[], field: SortField, order: SortOrder): Charge[] {
  const sorted = [...charges].sort((a, b) => {
    const key = field === 'status' ? 'is_shared' : field === 'category' ? 'category_id' : field
    let aVal: any = a[key as keyof Charge]
    let bVal: any = b[key as keyof Charge]

    if (field === 'amount') {
      aVal = Number(aVal) || 0
      bVal = Number(bVal) || 0
    } else if (field === 'date') {
      aVal = new Date(aVal).getTime()
      bVal = new Date(bVal).getTime()
    } else if (field === 'description') {
      aVal = String(aVal).toLowerCase()
      bVal = String(bVal).toLowerCase()
    }

    if (aVal < bVal) return order === 'asc' ? -1 : 1
    if (aVal > bVal) return order === 'asc' ? 1 : -1
    return 0
  })
  return sorted
}

export function filterCharges(
  charges: Charge[],
  searchDesc: string,
  categoryId: string | null,
  status: 'all' | 'shared' | 'personal',
): Charge[] {
  return charges.filter((c) => {
    if (searchDesc && !c.description.toLowerCase().includes(searchDesc.toLowerCase())) return false
    if (categoryId && c.category_id !== categoryId) return false
    if (status === 'shared' && !c.is_shared) return false
    if (status === 'personal' && c.is_shared) return false
    return true
  })
}
