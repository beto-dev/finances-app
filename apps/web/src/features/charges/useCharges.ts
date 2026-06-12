import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import client from '../../shared/api/client'
import { Charge, Category, CategoryUpdateResult } from '../../shared/types'

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
  return useMutation({
    mutationFn: async ({ chargeId, categoryId }: { chargeId: string; categoryId: string }) => {
      const res = await client.patch(`/api/charges/${chargeId}/category`, { category_id: categoryId })
      return res.data as CategoryUpdateResult
    },
    // intentionally no onSuccess invalidation — callers handle it after the similar-prompt interaction
  })
}

export function useCreateCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string }) => {
      const res = await client.post('/api/charges/categories', { name, color })
      return res.data as { id: string; name: string; color: string | null; is_system: boolean }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
    },
  })
}

export function useShareCharge() {
  return useMutation({
    mutationFn: async (chargeId: string) => {
      const res = await client.patch(`/api/charges/${chargeId}/share`)
      return res.data as { similar_count: number; suggested_pattern: string }
    },
  })
}

export function useShareSimilar() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ pattern, excludeChargeId }: { pattern: string; excludeChargeId: string }) => {
      const res = await client.post('/api/charges/share-similar', { pattern, exclude_charge_id: excludeChargeId })
      return res.data as { shared: number }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['charges'] })
    },
  })
}

export function useApplyToSimilar() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ pattern, categoryId, excludeChargeId }: { pattern: string; categoryId: string; excludeChargeId: string }) => {
      const res = await client.post('/api/charges/apply-to-similar', {
        pattern,
        category_id: categoryId,
        exclude_charge_id: excludeChargeId,
      })
      return res.data as { updated: number }
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

export function useDeleteCharge() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (chargeId: string) => client.delete(`/api/charges/${chargeId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['charges'] })
    },
  })
}

export function useBulkDeleteCharges() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (chargeIds: string[]) =>
      Promise.all(chargeIds.map((id) => client.delete(`/api/charges/${id}`))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['charges'] })
    },
  })
}

export function useUpdateCuotaNumero() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ chargeId, cuotaNumero }: { chargeId: string; cuotaNumero: number }) => {
      const res = await client.patch(`/api/charges/${chargeId}/cuota-numero`, { cuota_numero: cuotaNumero })
      return res.data as Charge
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['charges'] })
    },
  })
}

export function useBulkUnshare() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (chargeIds: string[]) => {
      const res = await client.post('/api/charges/bulk-unshare', { charge_ids: chargeIds })
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
      aVal = Math.abs(Number(aVal) || 0)
      bVal = Math.abs(Number(bVal) || 0)
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
  type?: string,
  kind?: 'all' | 'income' | 'expense',
  bank?: string,
): Charge[] {
  return charges.filter((c) => {
    if (searchDesc && !c.description.toLowerCase().includes(searchDesc.toLowerCase())) return false
    if (categoryId === 'none' && c.category_id !== null) return false
    if (categoryId && categoryId !== 'none' && c.category_id !== categoryId) return false
    if (status === 'shared' && !c.is_shared) return false
    if (status === 'personal' && c.is_shared) return false
    if (type && c.statement_type !== type) return false
    if (kind === 'income' && Number(c.amount) >= 0) return false
    if (kind === 'expense' && Number(c.amount) < 0) return false
    if (bank && c.bank_hint !== bank) return false
    return true
  })
}
