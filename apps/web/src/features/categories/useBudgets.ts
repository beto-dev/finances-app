import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import client from '../../shared/api/client'

export interface BudgetSuggestions {
  income_avg: number
  suggestions: Record<string, number>
}

export function useBudgets() {
  return useQuery<Record<string, number>>({
    queryKey: ['budgets'],
    queryFn: async () => (await client.get('/api/budgets/')).data,
  })
}

export function useBudgetSuggestions() {
  return useQuery<BudgetSuggestions>({
    queryKey: ['budget-suggestions'],
    queryFn: async () => (await client.get('/api/budgets/suggestions')).data,
  })
}

export function useUpsertBudget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ categoryId, amount }: { categoryId: string; amount: number }) => {
      await client.put(`/api/budgets/${categoryId}`, { amount })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budgets'] }),
  })
}

export function useDeleteBudget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (categoryId: string) => {
      await client.delete(`/api/budgets/${categoryId}`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budgets'] }),
  })
}
