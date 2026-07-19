import { useQuery } from '@tanstack/react-query'
import client from '../../shared/api/client'
import { useAuth } from '../auth/useAuth'
import { Family } from '../../shared/types'

export function useMyRole() {
  const { user } = useAuth()
  return useQuery<{ role: string | null }>({
    queryKey: ['my-role'],
    queryFn: async () => {
      const res = await client.get('/api/families/me/role')
      return res.data
    },
    enabled: !!user,
    staleTime: 60_000,
  })
}

export function useFamily() {
  const { user } = useAuth()
  return useQuery<Family>({
    queryKey: ['family'],
    queryFn: async () => {
      const res = await client.get('/api/families/me')
      return res.data
    },
    enabled: !!user,
    retry: false,
    staleTime: 60_000,
  })
}
