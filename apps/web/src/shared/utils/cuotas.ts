import type { Charge } from '../types'

export interface CuotaGroup {
  charge_id: string
  description: string
  cuota_numero: number
  cuota_total: number
  cuota_monto: number
  date: string
}

function normalizeDesc(desc: string): string {
  return desc.trim().toLowerCase().replace(/\s+\d+[,.]\d+\s*%\s*$/, '').trim()
}

function descsShouldMerge(a: string, b: string): boolean {
  if (b.startsWith(a + ' ') || a.startsWith(b + ' ')) return true
  const shorter = a.length <= b.length ? a : b
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return i >= 20 && i / shorter.length >= 0.5
}

export function groupCuotas(charges: Charge[] | undefined): CuotaGroup[] {
  if (!charges) return []

  const buckets = new Map<string, Charge[]>()
  for (const c of charges) {
    if (c.cuota_numero == null || c.cuota_total == null) continue
    const key = `${normalizeDesc(c.description)}|${c.cuota_total}`
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(c)
  }

  const keyList = [...buckets.keys()]
  for (let i = 0; i < keyList.length; i++) {
    const keyA = keyList[i]
    if (!buckets.has(keyA)) continue
    const sepA = keyA.lastIndexOf('|')
    const descA = keyA.slice(0, sepA)
    const totalA = keyA.slice(sepA + 1)
    for (let j = i + 1; j < keyList.length; j++) {
      const keyB = keyList[j]
      if (!buckets.has(keyB)) continue
      const sepB = keyB.lastIndexOf('|')
      const descB = keyB.slice(0, sepB)
      const totalB = keyB.slice(sepB + 1)
      if (totalA !== totalB || !descsShouldMerge(descA, descB)) continue
      buckets.get(keyA)!.push(...buckets.get(keyB)!)
      buckets.delete(keyB)
    }
  }

  for (const [key, list] of buckets.entries()) {
    if (list.length < 2) continue
    const byNum = new Map<number, Charge>()
    for (const c of list) {
      const existing = byNum.get(c.cuota_numero!)
      if (!existing || c.date > existing.date) byNum.set(c.cuota_numero!, c)
    }
    buckets.set(key, [...byNum.values()])
  }

  const groups: CuotaGroup[] = []

  for (const list of buckets.values()) {
    const sorted = [...list].sort((a, b) => a.cuota_numero! - b.cuota_numero!)

    const runs: { last: number; charge: Charge }[] = []
    for (const c of sorted) {
      let best: { last: number; charge: Charge } | null = null
      for (const r of runs) {
        if (r.last < c.cuota_numero! && (!best || r.last > best.last)) best = r
      }
      if (best) {
        best.last = c.cuota_numero!
        best.charge = c
      } else {
        runs.push({ last: c.cuota_numero!, charge: c })
      }
    }

    for (const run of runs) {
      const c = run.charge
      groups.push({
        charge_id: c.id,
        description: c.description,
        cuota_numero: c.cuota_numero!,
        cuota_total: c.cuota_total!,
        cuota_monto: Number(c.cuota_monto ?? c.amount),
        date: c.date,
      })
    }
  }

  return groups.sort((a, b) => {
    const aDone = a.cuota_numero >= a.cuota_total
    const bDone = b.cuota_numero >= b.cuota_total
    if (aDone !== bDone) return aDone ? 1 : -1
    return (b.cuota_total - b.cuota_numero) - (a.cuota_total - a.cuota_numero)
  })
}
