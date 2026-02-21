import { useQuery } from '@tanstack/react-query'
import client from '../../shared/api/client'
import { Charge, Category } from '../../shared/types'

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
  currency: string
  byCategory: CategoryBreakdown[]
  byMonth: MonthBreakdown[]
  charges: Charge[]
}

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export function useDashboard(month: number | undefined, year: number): DashboardData & { isLoading: boolean } {
  const { data: charges, isLoading } = useQuery<Charge[]>({
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

  const dashboard: DashboardData = {
    totalAmount: 0,
    currency: 'CLP',
    byCategory: [],
    byMonth: [],
    charges: charges ?? [],
  }

  if (!charges || charges.length === 0) return { ...dashboard, isLoading }

  const catMap = new Map(categories.map((c) => [c.id, c]))
  const byCat = new Map<string, { amount: number; count: number }>()
  const byMonth = new Map<number, { amount: number; count: number }>()

  for (const charge of charges) {
    const amt = Number(charge.amount)
    dashboard.totalAmount += amt
    dashboard.currency = charge.currency

    // category grouping
    const catId = charge.category_id ?? 'sin-categoria'
    const cat = byCat.get(catId) ?? { amount: 0, count: 0 }
    byCat.set(catId, { amount: cat.amount + amt, count: cat.count + 1 })

    // month grouping (for annual view)
    const m = new Date(charge.date).getMonth() + 1
    const mon = byMonth.get(m) ?? { amount: 0, count: 0 }
    byMonth.set(m, { amount: mon.amount + amt, count: mon.count + 1 })
  }

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

  return { ...dashboard, isLoading }
}
