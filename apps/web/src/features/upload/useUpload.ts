import { useEffect, useRef, useState } from 'react'
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

interface StatementNotification {
  filename: string
  type: 'success' | 'error'
}

export function useStatementNotifier() {
  const [notification, setNotification] = useState<StatementNotification | null>(null)
  const prevStatuses = useRef<Record<string, string>>({})
  const initialized = useRef(false)

  const { data: statements } = useQuery<Statement[]>({
    queryKey: ['statements'],
    queryFn: async () => (await client.get('/api/statements/')).data,
    refetchInterval: (query) => {
      const data = query.state.data
      return data?.some((s) => PROCESSING_STATUSES.has(s.status)) ? 3000 : false
    },
  })

  useEffect(() => {
    if (!statements) return
    if (!initialized.current) {
      statements.forEach((s) => { prevStatuses.current[s.id] = s.status })
      initialized.current = true
      return
    }
    for (const s of statements) {
      const prev = prevStatuses.current[s.id]
      if (prev && PROCESSING_STATUSES.has(prev)) {
        if (s.status === 'parsed') setNotification({ filename: s.filename, type: 'success' })
        else if (s.status === 'error') setNotification({ filename: s.filename, type: 'error' })
      }
      prevStatuses.current[s.id] = s.status
    }
  }, [statements])

  return { notification, clearNotification: () => setNotification(null) }
}

export interface StatementSummary {
  id: string
  filename: string
  type: string
  status: string
  total_charges: number
  categorized: number
  uncategorized: number
}

export function useStatementsSummary() {
  return useQuery<StatementSummary[]>({
    queryKey: ['statements-summary'],
    queryFn: async () => {
      const res = await client.get('/api/statements/summary')
      return res.data
    },
    refetchInterval: 5000,
  })
}

export function useUpdateStatement() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, statementType, bankHint }: { id: string; statementType: string; bankHint: string }) => {
      const form = new FormData()
      form.append('statement_type', statementType)
      if (bankHint) form.append('bank_hint', bankHint)
      const res = await client.patch(`/api/statements/${id}`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return res.data as Statement
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
