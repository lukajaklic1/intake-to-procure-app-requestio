import { daysUntil } from './contracts'
import { supabase } from './supabase'

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

/** The invoices in review that this person can decide on now: the approver of the current step (or an admin), never the one who entered the invoice
 *  (an admin may). Invoices that were sent to review before approvers existed go by the permission. */
export async function invoicesToDecide(companyId: string, me: string, isAdmin: boolean, hasApprovePerm: boolean): Promise<string[]> {
  const { data } = await supabase.from('invoices').select('id, created_by, invoice_approvals(step, approver_id, status)').eq('company_id', companyId).eq('status', 'in_review')
  const out: string[] = []
  for (const inv of (data ?? []) as unknown as { id: string; created_by: string | null; invoice_approvals: { step: number; approver_id: string; status: string }[] }[]) {
    if (inv.created_by === me && !isAdmin) continue
    const current = inv.invoice_approvals.filter(a => a.status === 'pending').sort((a, b) => a.step - b.step)[0]
    if (current ? (isAdmin || current.approver_id === me) : (isAdmin || hasApprovePerm)) out.push(inv.id)
  }
  return out
}
