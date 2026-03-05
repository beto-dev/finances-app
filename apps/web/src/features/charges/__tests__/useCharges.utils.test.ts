import { describe, it, expect } from 'vitest'
import { sortCharges, filterCharges } from '../useCharges'
import type { Charge } from '../../../shared/types'

function makeCharge(overrides: Partial<Charge> = {}): Charge {
  return {
    id: crypto.randomUUID(),
    statement_id: crypto.randomUUID(),
    date: '2026-03-01',
    description: 'Test charge',
    amount: 1000,
    currency: 'CLP',
    category_id: null,
    is_shared: false,
    ai_suggested: false,
    created_at: new Date().toISOString(),
    statement_type: 'manual',
    uploaded_by: null,
    ...overrides,
  }
}

// ── sortCharges ────────────────────────────────────────────────────────────────
describe('sortCharges', () => {
  it('sorts by amount ascending', () => {
    const charges = [
      makeCharge({ amount: 5000 }),
      makeCharge({ amount: 1000 }),
      makeCharge({ amount: 3000 }),
    ]
    const result = sortCharges(charges, 'amount', 'asc')
    expect(result.map((c) => c.amount)).toEqual([1000, 3000, 5000])
  })

  it('sorts by amount descending', () => {
    const charges = [
      makeCharge({ amount: 5000 }),
      makeCharge({ amount: 1000 }),
      makeCharge({ amount: 3000 }),
    ]
    const result = sortCharges(charges, 'amount', 'desc')
    expect(result.map((c) => c.amount)).toEqual([5000, 3000, 1000])
  })

  it('sorts by description alphabetically ascending', () => {
    const charges = [
      makeCharge({ description: 'Uber' }),
      makeCharge({ description: 'Amazon' }),
      makeCharge({ description: 'Netflix' }),
    ]
    const result = sortCharges(charges, 'description', 'asc')
    expect(result.map((c) => c.description)).toEqual(['Amazon', 'Netflix', 'Uber'])
  })

  it('sorts by description case-insensitively', () => {
    const charges = [
      makeCharge({ description: 'Zoom' }),
      makeCharge({ description: 'amazon' }),
    ]
    const result = sortCharges(charges, 'description', 'asc')
    expect(result[0].description).toBe('amazon')
  })

  it('sorts by date ascending', () => {
    const charges = [
      makeCharge({ date: '2026-03-15' }),
      makeCharge({ date: '2026-01-01' }),
      makeCharge({ date: '2026-06-30' }),
    ]
    const result = sortCharges(charges, 'date', 'asc')
    expect(result.map((c) => c.date)).toEqual(['2026-01-01', '2026-03-15', '2026-06-30'])
  })

  it('does not mutate the original array', () => {
    const charges = [makeCharge({ amount: 500 }), makeCharge({ amount: 200 })]
    const original = [...charges]
    sortCharges(charges, 'amount', 'asc')
    expect(charges[0].amount).toBe(original[0].amount)
  })

  it('returns empty array when given empty array', () => {
    expect(sortCharges([], 'amount', 'asc')).toEqual([])
  })
})

// ── filterCharges ──────────────────────────────────────────────────────────────
describe('filterCharges', () => {
  it('returns all charges when no filters applied', () => {
    const charges = [makeCharge(), makeCharge(), makeCharge()]
    expect(filterCharges(charges, '', null, 'all')).toHaveLength(3)
  })

  it('filters by description substring (case-insensitive)', () => {
    const charges = [
      makeCharge({ description: 'Netflix' }),
      makeCharge({ description: 'Uber Eats' }),
      makeCharge({ description: 'Amazon Prime' }),
    ]
    const result = filterCharges(charges, 'net', null, 'all')
    expect(result).toHaveLength(1)
    expect(result[0].description).toBe('Netflix')
  })

  it('filters by category_id', () => {
    const catId = crypto.randomUUID()
    const charges = [
      makeCharge({ category_id: catId }),
      makeCharge({ category_id: crypto.randomUUID() }),
      makeCharge({ category_id: null }),
    ]
    const result = filterCharges(charges, '', catId, 'all')
    expect(result).toHaveLength(1)
    expect(result[0].category_id).toBe(catId)
  })

  it('filters by status "shared" — only is_shared=true', () => {
    const charges = [
      makeCharge({ is_shared: true }),
      makeCharge({ is_shared: false }),
      makeCharge({ is_shared: true }),
    ]
    const result = filterCharges(charges, '', null, 'shared')
    expect(result).toHaveLength(2)
    expect(result.every((c) => c.is_shared)).toBe(true)
  })

  it('filters by status "personal" — only is_shared=false', () => {
    const charges = [
      makeCharge({ is_shared: true }),
      makeCharge({ is_shared: false }),
      makeCharge({ is_shared: false }),
    ]
    const result = filterCharges(charges, '', null, 'personal')
    expect(result).toHaveLength(2)
    expect(result.every((c) => !c.is_shared)).toBe(true)
  })

  it('combines description and category filters', () => {
    const catId = crypto.randomUUID()
    const charges = [
      makeCharge({ description: 'Netflix', category_id: catId }),
      makeCharge({ description: 'Netflix', category_id: null }),
      makeCharge({ description: 'Uber', category_id: catId }),
    ]
    const result = filterCharges(charges, 'netflix', catId, 'all')
    expect(result).toHaveLength(1)
    expect(result[0].description).toBe('Netflix')
    expect(result[0].category_id).toBe(catId)
  })

  it('returns empty array when no matches', () => {
    const charges = [makeCharge({ description: 'Netflix' })]
    expect(filterCharges(charges, 'amazon', null, 'all')).toHaveLength(0)
  })
})
