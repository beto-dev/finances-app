import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import client from '../../shared/api/client'
import type { Credit } from '../../shared/types'

export function useCredits() {
  return useQuery<Credit[]>({
    queryKey: ['credits'],
    queryFn: async () => {
      const res = await client.get('/api/credits/')
      return res.data
    },
  })
}

export function useCreateCredit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: Omit<Credit, 'id' | 'user_id' | 'created_at'>) => {
      const res = await client.post('/api/credits/', body)
      return res.data as Credit
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['credits'] }),
  })
}

export function useUpdateCredit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...body }: Omit<Credit, 'user_id' | 'created_at'>) => {
      const res = await client.patch(`/api/credits/${id}`, body)
      return res.data as Credit
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['credits'] }),
  })
}

export function useDeleteCredit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => client.delete(`/api/credits/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['credits'] }),
  })
}
