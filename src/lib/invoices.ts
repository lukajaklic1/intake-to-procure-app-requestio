import { daysUntil } from './contracts'

export type InvoiceStatus = 'draft' | 'in_review' | 'approved' | 'rejected' | 'paid'

export const INVOICE_BADGE: Record<InvoiceStatus, string> = {
  draft: 'badge-neutral',
  in_review: 'badge-warn',
  approved: 'badge-info',
  rejected: 'badge-danger',
  paid: 'badge-success',
}

export const MATCH_BADGE: Record<string, string> = {
  matched: 'badge-success',
  mismatch: 'badge-danger',
  unmatched: 'badge-neutral',
}

/** Payment state of an unpaid invoice: overdue, due within a week, or neither. */
export function dueState(inv: { status: string; due_date: string | null }): 'paid' | 'overdue' | 'soon' | 'ok' {
  if (inv.status === 'paid') return 'paid'
  const d = daysUntil(inv.due_date)
  if (d == null) return 'ok'
  if (d < 0) return 'overdue'
  return d <= 7 ? 'soon' : 'ok'
}
