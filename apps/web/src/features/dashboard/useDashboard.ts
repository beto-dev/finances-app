import { useQuery } from '@tanstack/react-query'
import client from '../../shared/api/client'
import { Charge, Category, Credit } from '../../shared/types'
import { isSelfTransfer } from '../../shared/utils/selfTransfer'
import { groupCuotas } from '../../shared/utils/cuotas'
import { useAuth } from '../auth/useAuth'

interface CategoryBreakdown {
  category: Category
  amount: number
  count: number
}

interface MonthBreakdown {
  month: number   // 1-12
  label: string   // "Ene", "Feb", ...
  amount: number
  count: number
}

interface DashboardData {
  totalAmount: number
  totalExpenses: number
  totalIncome: number
  totalCredits: number
  currency: string
  byCategory: CategoryBreakdown[]
  byMonth: MonthBreakdown[]
  charges: Charge[]
}

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export function useDashboard(month: number | undefined, year: number): DashboardData & { isLoading: boolean; isError: boolean } {
  const { user } = useAuth()
  const { data: charges, isLoading, isError } = useQuery<Charge[]>({
    queryKey: ['charges', month ?? 'all', year],
    queryFn: async () => {
      const res = await client.get('/api/charges/', { params: { month, year } })
      return res.data
    },
  })

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await client.get('/api/charges/categories')
      return res.data
    },
  })

  const { data: credits = [] } = useQuery<Credit[]>({
    queryKey: ['credits'],
    queryFn: async () => {
      const res = await client.get('/api/credits/')
      return res.data
    },
  })

  // All charges (no month filter) — needed to detect active tarjeta cuotas across history
  const { data: allCharges } = useQuery<Charge[]>({
    queryKey: ['charges', undefined, undefined],
    queryFn: async () => {
      const res = await client.get('/api/charges/')
      return res.data
    },
    staleTime: 5 * 60 * 1000,
  })

  // Sum of active bank credit monthly payments (cuota_numero < cuota_total)
  const activeBankCreditsTotal = credits
    .filter((c) => c.cuota_numero < c.cuota_total)
    .reduce((sum, c) => sum + c.cuota_monto, 0)

  // Sum of active tarjeta cuotas detected from uploaded statements
  const activeTarjetaCuotasTotal = groupCuotas(allCharges)
    .filter((g) => g.cuota_numero < g.cuota_total)
    .reduce((sum, g) => sum + g.cuota_monto, 0)

  const activeCreditsTotal = activeBankCreditsTotal + activeTarjetaCuotasTotal

  const dashboard: DashboardData = {
    totalAmount: 0,
    totalExpenses: 0,
    totalIncome: 0,
    totalCredits: activeCreditsTotal,
    currency: 'CLP',
    byCategory: [],
    byMonth: [],
    charges: charges ?? [],
  }

  if (!charges || charges.length === 0) return { ...dashboard, isLoading, isError }

  const catMap = new Map(categories.map((c) => [c.id, c]))
  const byCat = new Map<string, { amount: number; count: number }>()
  const byMonth = new Map<number, { amount: number; count: number }>()

  for (const charge of charges) {
    const amt = Number(charge.amount)
    const isIncome = amt < 0
    const isSelf = isSelfTransfer(charge, user?.full_name)
    dashboard.currency = charge.currency

    if (isIncome) {
      dashboard.totalIncome += Math.abs(amt)
    } else if (!isSelf) {
      dashboard.totalExpenses += amt
      // category grouping: expenses only, excluding self-transfers
      const catId = charge.category_id ?? 'sin-categoria'
      const cat = byCat.get(catId) ?? { amount: 0, count: 0 }
      byCat.set(catId, { amount: cat.amount + amt, count: cat.count + 1 })
    }

    // month grouping uses expenses only (excluding self-transfers) for the monthly trend
    if (!isIncome && !isSelf) {
      const m = new Date(charge.date).getMonth() + 1
      const mon = byMonth.get(m) ?? { amount: 0, count: 0 }
      byMonth.set(m, { amount: mon.amount + amt, count: mon.count + 1 })
    }
  }

  dashboard.totalAmount = dashboard.totalExpenses + activeCreditsTotal

  dashboard.byCategory = Array.from(byCat.entries())
    .map(([catId, data]) => ({
      category: catMap.get(catId) ?? { id: catId, name: 'Sin categoría', color: '#6b7280', is_system: false },
      ...data,
    }))
    .sort((a, b) => b.amount - a.amount)

  dashboard.byMonth = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1
    const data = byMonth.get(m) ?? { amount: 0, count: 0 }
    return { month: m, label: MONTH_LABELS[i], ...data }
  })

  return { ...dashboard, isLoading, isError }
}
