export type StatementType = 'checking' | 'credit_card' | 'credit_line'
export type StatementStatus = 'pending' | 'parsing' | 'parsed' | 'error'

export interface Statement {
  id: string
  family_id: string
  filename: string
  bank_hint: string | null
  type: StatementType
  status: StatementStatus
  uploaded_at: string
}

export interface Category {
  id: string
  name: string
  color: string | null
  is_system: boolean
}

export interface Charge {
  id: string
  statement_id: string
  date: string
  description: string
  amount: number
  currency: string
  category_id: string | null
  is_confirmed: boolean
  ai_suggested: boolean
  created_at: string
  statement_type: string
  uploaded_by: string | null
}

export interface Family {
  id: string
  name: string
  owner_id: string
  created_at: string
}

export interface FamilyMember {
  user_id: string
  email: string
  role: string
  joined_at: string
}

export interface GoogleAuthStatus {
  connected: boolean
  spreadsheet_url: string | null
  last_sync_at: string | null
}

export interface AuthUser {
  id: string
  email: string
  token: string
}
