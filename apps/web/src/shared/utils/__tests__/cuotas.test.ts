import { describe, it, expect } from 'vitest'
import { groupCuotas, type CuotaGroup } from '../cuotas'
import type { Charge } from '../../types'

function makeCharge(overrides: Partial<Charge> = {}): Charge {
  return {
    id: crypto.randomUUID(),
    statement_id: crypto.randomUUID(),
    date: '2026-01-01',
    description: 'COMPRA CUOTAS',
    amount: 50000,
    currency: 'CLP',
    category_id: null,
    is_shared: false,
    ai_suggested: false,
    created_at: new Date().toISOString(),
    statement_type: 'credit_card',
    uploaded_by: null,
    bank_hint: null,
    cuota_numero: null,
    cuota_total: null,
    cuota_monto: null,
    ...overrides,
  }
}

describe('groupCuotas', () => {
  it('returns empty array when charges is undefined', () => {
    expect(groupCuotas(undefined)).toEqual([])
  })

  it('returns empty array when no charge has cuota fields', () => {
    const charges = [makeCharge(), makeCharge()]
    expect(groupCuotas(charges)).toEqual([])
  })

  it('groups two charges of same purchase into one group', () => {
    const charges = [
      makeCharge({ description: 'NETFLIX', cuota_numero: 1, cuota_total: 6, cuota_monto: 10000, date: '2026-01-01' }),
      makeCharge({ description: 'NETFLIX', cuota_numero: 2, cuota_total: 6, cuota_monto: 10000, date: '2026-02-01' }),
    ]
    const groups = groupCuotas(charges)
    expect(groups).toHaveLength(1)
    expect(groups[0].cuota_numero).toBe(2)
    expect(groups[0].cuota_total).toBe(6)
    expect(groups[0].cuota_monto).toBe(10000)
  })

  it('keeps the latest cuota_numero as the current position', () => {
    const charges = [
      makeCharge({ description: 'UBER', cuota_numero: 3, cuota_total: 12, cuota_monto: 5000, date: '2026-03-01' }),
      makeCharge({ description: 'UBER', cuota_numero: 1, cuota_total: 12, cuota_monto: 5000, date: '2026-01-01' }),
      makeCharge({ description: 'UBER', cuota_numero: 2, cuota_total: 12, cuota_monto: 5000, date: '2026-02-01' }),
    ]
    const groups = groupCuotas(charges)
    expect(groups).toHaveLength(1)
    expect(groups[0].cuota_numero).toBe(3)
  })

  it('separates two purchases with different cuota_total', () => {
    const charges = [
      makeCharge({ description: 'AMAZON', cuota_numero: 1, cuota_total: 6, cuota_monto: 8000 }),
      makeCharge({ description: 'AMAZON', cuota_numero: 1, cuota_total: 12, cuota_monto: 4000 }),
    ]
    const groups = groupCuotas(charges)
    expect(groups).toHaveLength(2)
  })

  it('separates two purchases with completely different descriptions', () => {
    const charges = [
      makeCharge({ description: 'NETFLIX', cuota_numero: 2, cuota_total: 6, cuota_monto: 10000 }),
      makeCharge({ description: 'SPOTIFY', cuota_numero: 1, cuota_total: 6, cuota_monto: 5000 }),
    ]
    const groups = groupCuotas(charges)
    expect(groups).toHaveLength(2)
  })

  it('correctly computes remaining debt: (cuota_total - cuota_numero) * cuota_monto', () => {
    const charges = [
      makeCharge({ description: 'TV 48"', cuota_numero: 6, cuota_total: 24, cuota_monto: 20000, date: '2026-06-01' }),
      makeCharge({ description: 'TV 48"', cuota_numero: 5, cuota_total: 24, cuota_monto: 20000, date: '2026-05-01' }),
    ]
    const groups = groupCuotas(charges)
    expect(groups).toHaveLength(1)
    const g = groups[0]
    const remaining = (g.cuota_total - g.cuota_numero) * g.cuota_monto
    expect(remaining).toBe(18 * 20000) // 24 - 6 = 18 cuotas restantes
  })

  it('marks a fully paid purchase as finished (cuota_numero >= cuota_total)', () => {
    const charges = [
      makeCharge({ description: 'CELULAR', cuota_numero: 12, cuota_total: 12, cuota_monto: 30000, date: '2026-12-01' }),
    ]
    const groups = groupCuotas(charges)
    expect(groups).toHaveLength(1)
    expect(groups[0].cuota_numero).toBe(12)
    expect(groups[0].cuota_total).toBe(12)
  })

  it('sorts active before finished', () => {
    const charges = [
      makeCharge({ description: 'DONE ITEM', cuota_numero: 6, cuota_total: 6, cuota_monto: 5000, date: '2026-06-01' }),
      makeCharge({ description: 'ACTIVE ITEM', cuota_numero: 2, cuota_total: 12, cuota_monto: 5000, date: '2026-02-01' }),
    ]
    const groups = groupCuotas(charges)
    expect(groups[0].description).toBe('ACTIVE ITEM')
    expect(groups[1].description).toBe('DONE ITEM')
  })

  it('uses cuota_monto field when present, falls back to amount', () => {
    const charges = [
      makeCharge({ description: 'LAPTOP', amount: 99000, cuota_numero: 1, cuota_total: 3, cuota_monto: 33000, date: '2026-01-01' }),
    ]
    const groups = groupCuotas(charges)
    expect(groups[0].cuota_monto).toBe(33000)
  })

  it('falls back to charge amount when cuota_monto is null', () => {
    const charges = [
      makeCharge({ description: 'TABLET', amount: 25000, cuota_numero: 1, cuota_total: 3, cuota_monto: null, date: '2026-01-01' }),
    ]
    const groups = groupCuotas(charges)
    expect(groups[0].cuota_monto).toBe(25000)
  })

  it('deduplicates charges with same cuota_numero, keeping the most recent', () => {
    const charges = [
      makeCharge({ description: 'SMARTWATCH', cuota_numero: 2, cuota_total: 6, cuota_monto: 15000, date: '2026-02-15' }),
      makeCharge({ description: 'SMARTWATCH', cuota_numero: 2, cuota_total: 6, cuota_monto: 15000, date: '2026-02-01' }),
    ]
    const groups = groupCuotas(charges)
    expect(groups).toHaveLength(1)
    expect(groups[0].date).toBe('2026-02-15')
  })

  it('merges two independent purchases into separate groups even when descriptions are similar but cuota_totals differ', () => {
    const charges = [
      makeCharge({ description: 'MERCADOPAGO COMERCIO', cuota_numero: 1, cuota_total: 3, cuota_monto: 5000 }),
      makeCharge({ description: 'MERCADOPAGO COMERCIO', cuota_numero: 1, cuota_total: 6, cuota_monto: 5000 }),
    ]
    const groups = groupCuotas(charges)
    expect(groups).toHaveLength(2)
  })

  it('returns correct active count for totalCredits calculation', () => {
    const charges = [
      makeCharge({ description: 'A', cuota_numero: 3, cuota_total: 12, cuota_monto: 10000, date: '2026-03-01' }),
      makeCharge({ description: 'A', cuota_numero: 2, cuota_total: 12, cuota_monto: 10000, date: '2026-02-01' }),
      makeCharge({ description: 'B', cuota_numero: 6, cuota_total: 6, cuota_monto: 20000, date: '2026-06-01' }),
    ]
    const groups = groupCuotas(charges)
    const active = groups.filter((g: CuotaGroup) => g.cuota_numero < g.cuota_total)
    const monthlyTotal = active.reduce((sum: number, g: CuotaGroup) => sum + g.cuota_monto, 0)
    const totalDebt = active.reduce((sum: number, g: CuotaGroup) => sum + (g.cuota_total - g.cuota_numero) * g.cuota_monto, 0)
    expect(active).toHaveLength(1)
    expect(monthlyTotal).toBe(10000)
    expect(totalDebt).toBe(9 * 10000) // 12 - 3 = 9 remaining
  })
})
