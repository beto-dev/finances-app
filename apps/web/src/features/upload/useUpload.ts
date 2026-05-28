import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import client from '../../shared/api/client'
import { Statement } from '../../shared/types'

const PROCESSING_STATUSES = new Set(['pending', 'parsing'])

export function useStatements() {
  return useQuery<Statement[]>({
    queryKey: ['statements'],
    queryFn: async () => {
      const res = await client.get('/api/statements/')
      return res.data
    },
    refetchInterval: (query) => {
      const data = query.state.data
      if (data?.some((s) => PROCESSING_STATUSES.has(s.status))) return 3000
      return false
    },
  })
}

export function useDeleteStatement() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (statementId: string) => {
      await client.delete(`/api/statements/${statementId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['statements'] })
      queryClient.invalidateQueries({ queryKey: ['charges'] })
    },
  })
}

export function useDeleteAllStatements() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (statementIds: string[]) => {
      await Promise.all(statementIds.map((id) => client.delete(`/api/statements/${id}`)))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['statements'] })
      queryClient.invalidateQueries({ queryKey: ['charges'] })
    },
  })
}

export function useUploadStatement() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await client.post('/api/statements/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      })
      return res.data as Statement
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['statements'] })
      queryClient.invalidateQueries({ queryKey: ['charges'] })
    },
  })
}
