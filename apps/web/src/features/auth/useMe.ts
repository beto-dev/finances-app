import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import client from '../../shared/api/client'
import { useAuth } from './useAuth'

interface MeResponse {
  id: string
  email: string
  full_name: string | null
}

export function useMe() {
  const { login, user } = useAuth()
  return useQuery<MeResponse>({
    queryKey: ['me'],
    queryFn: async () => {
      const res = await client.get('/api/auth/me')
      const data = res.data as MeResponse
      // Keep auth context in sync if name changed (e.g. set via another device)
      if (user && data.full_name !== user.full_name) {
        login(user.token, user.email, user.id, data.full_name)
      }
      return data
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useUpdateMe() {
  const queryClient = useQueryClient()
  const { login, user } = useAuth()
  return useMutation({
    mutationFn: async (full_name: string) => {
      const res = await client.patch('/api/auth/me', { full_name })
      return res.data as MeResponse
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['me'], data)
      if (user) login(user.token, user.email, user.id, data.full_name)
    },
  })
}
