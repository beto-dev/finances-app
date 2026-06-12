import { describe, it, expect } from 'vitest'
import { isSelfTransfer } from '../selfTransfer'
import type { Charge } from '../../types'

function makeCharge(overrides: Partial<Charge> = {}): Charge {
  return {
    id: crypto.randomUUID(),
    statement_id: crypto.randomUUID(),
    date: '2026-01-01',
    description: 'TRANSF ALBERTO TEJOS',
    amount: 100000,
    currency: 'CLP',
    category_id: null,
    is_shared: false,
    ai_suggested: false,
    created_at: new Date().toISOString(),
    statement_type: 'checking',
    uploaded_by: null,
    bank_hint: null,
    cuota_numero: null,
    cuota_total: null,
    cuota_monto: null,
    ...overrides,
  }
}

describe('isSelfTransfer', () => {
  it('returns false when fullName is null', () => {
    expect(isSelfTransfer(makeCharge(), null)).toBe(false)
  })

  it('returns false when fullName is undefined', () => {
    expect(isSelfTransfer(makeCharge(), undefined)).toBe(false)
  })

  it('returns false when fullName is empty string', () => {
    expect(isSelfTransfer(makeCharge(), '')).toBe(false)
  })

  it('returns false for income charges (negative amount)', () => {
    const charge = makeCharge({ amount: -100000, description: 'TRANSF ALBERTO TEJOS' })
    expect(isSelfTransfer(charge, 'Alberto Tejos')).toBe(false)
  })

  it('returns true when description contains name parts and a transfer keyword', () => {
    const charge = makeCharge({ description: 'TRANSFERENCIA ALBERTO TEJOS', amount: 50000 })
    expect(isSelfTransfer(charge, 'Alberto Tejos')).toBe(true)
  })

  it('matches case-insensitively', () => {
    const charge = makeCharge({ description: 'traspaso alberto tejos banco bci', amount: 200000 })
    expect(isSelfTransfer(charge, 'Alberto Tejos')).toBe(true)
  })

  it('returns false when description has the name but no transfer keyword', () => {
    const charge = makeCharge({ description: 'PAGO NETFLIX ALBERTO TEJOS', amount: 15000 })
    expect(isSelfTransfer(charge, 'Alberto Tejos')).toBe(false)
  })

  it('returns false when description has a transfer keyword but not the name', () => {
    const charge = makeCharge({ description: 'TRANSF OTRO BANCO', amount: 50000 })
    expect(isSelfTransfer(charge, 'Alberto Tejos')).toBe(false)
  })

  it('handles single-word name with at least 3 chars', () => {
    const charge = makeCharge({ description: 'ENVIO TEJOS BANCO ESTADO', amount: 10000 })
    expect(isSelfTransfer(charge, 'Tejos')).toBe(true)
  })

  it('ignores name parts shorter than 3 characters (particles like "de", "la")', () => {
    // "de" is too short and should be ignored — match still works via the other parts
    const charge = makeCharge({ description: 'TRF CARLOS DE LA VEGA', amount: 20000 })
    expect(isSelfTransfer(charge, 'Carlos de la Vega')).toBe(true)
  })

  it('returns false for zero amount', () => {
    const charge = makeCharge({ amount: 0, description: 'TRANSFERENCIA ALBERTO TEJOS' })
    expect(isSelfTransfer(charge, 'Alberto Tejos')).toBe(false)
  })

  it('matches "trf" keyword abbreviation', () => {
    const charge = makeCharge({ description: 'TRF JOSE GARCIA', amount: 30000 })
    expect(isSelfTransfer(charge, 'Jose Garcia')).toBe(true)
  })

  it('matches "envío" with accent', () => {
    const charge = makeCharge({ description: 'ENVÍO PABLO MORALES', amount: 10000 })
    expect(isSelfTransfer(charge, 'Pablo Morales')).toBe(true)
  })
})
