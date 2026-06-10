import { Charge } from '../types'

// Keywords that suggest a transfer description
const TRANSFER_KEYWORDS = ['transf', 'transferencia', 'traspaso', 'envio', 'envío', 'pago a ', 'trf']

/**
 * Returns true if the charge looks like a transfer the user made to themselves
 * (same person, different bank). Criteria:
 *  - Description contains the user's own name (case-insensitive)
 *  - Description contains a transfer keyword
 *  - Amount is positive (expense side — the debit from account A)
 */
export function isSelfTransfer(charge: Charge, fullName: string | null | undefined): boolean {
  if (!fullName || Number(charge.amount) <= 0) return false
  const desc = charge.description.toLowerCase()
  const name = fullName.toLowerCase()

  // Match any word in the name (first name is enough, but require at least 2 chars)
  const nameParts = name.split(/\s+/).filter((p) => p.length >= 3)
  const nameMatch = nameParts.length > 0 && nameParts.every((part) => desc.includes(part))
  if (!nameMatch) return false

  return TRANSFER_KEYWORDS.some((kw) => desc.includes(kw))
}
