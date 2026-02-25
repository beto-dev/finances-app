import { useQuery } from '@tanstack/react-query'
import client from '../../shared/api/client'
import { useAuth } from '../auth/useAuth'

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
