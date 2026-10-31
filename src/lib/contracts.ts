import type { Contract } from '../types/database'
import { supabase } from './supabase'

export type EffectiveStatus = 'draft' | 'active' | 'expiring' | 'in_notice' | 'cancelled' | 'expired' | 'terminated'

/** Whole days from today until the given date (negative = in the past). */
export function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null
  const end = new Date(date + 'T00:00:00')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.round((end.getTime() - today.getTime()) / 86_400_000)
}

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** A date (yyyy-mm-dd) moved by `n` days; calendar days, no time zone shift. */
export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return isoDay(d)
}

/** When a contract that was given notice ends: the day notice was given plus the notice period, but not after the end date.
 *  Without notice (or without a notice period) it is simply the end date. */
export function closingDate(c: Pick<Contract, 'end_date' | 'notice_days' | 'notice_given_at'>): string | null {
  if (!c.notice_given_at || !c.notice_days) return c.end_date
  const byNotice = addDays(c.notice_given_at, c.notice_days)
  return c.end_date && c.end_date < byNotice ? c.end_date : byNotice
}

/** What the user sees: an "active" contract past its end date is expired, one ending (or reaching its notice date) within 60 days is "expiring". */
export function effectiveStatus(c: Pick<Contract, 'status' | 'end_date' | 'notice_days' | 'notice_given_at' | 'auto_renew'>): EffectiveStatus {
  if (c.status === 'active') {
    // notice given: "in notice period" until it ends, then "cancelled" (it was ended by notice, it did not simply run out)
    if (c.notice_given_at) {
      const closing = daysUntil(closingDate(c))
      return closing != null && closing < 0 ? 'cancelled' : 'in_notice'
    }
    const d = daysUntil(c.end_date)
    if (d != null && d < 0) return 'expired'
    if (needsAttention(c)) return 'expiring'
  }
  return c.status
}

export const STATUS_BADGE: Record<EffectiveStatus, string> = {
  draft: 'badge-neutral',
  active: 'badge-success',
  expiring: 'badge-warn',
  in_notice: 'badge-orange',
  cancelled: 'badge-neutral',
  expired: 'badge-danger',
  terminated: 'badge-neutral',
}

/** The date by which the contract must be cancelled / renegotiated (end date minus notice period). */
export function noticeDate(c: Pick<Contract, 'end_date' | 'notice_days'>): string | null {
  if (!c.end_date || !c.notice_days) return null
  return addDays(c.end_date, -c.notice_days)
}

/** Contracts that need attention soon: active, ending (or notice due) within `days`. */
export function needsAttention(c: Pick<Contract, 'status' | 'end_date' | 'notice_days' | 'auto_renew'>, days = 60): boolean {
  if (c.status !== 'active') return false
  const end = daysUntil(c.end_date)
  // the notice date only matters when the contract renews by itself; otherwise it simply ends
  const notice = c.auto_renew ? daysUntil(noticeDate(c)) : null
  return (end != null && end >= 0 && end <= days) || (notice != null && notice >= 0 && notice <= days)
}

/** Deletes a contract for good: the row (with its price list and document records) and then the uploaded files.
 *  The files go only after the database accepted the deletion, so a blocked delete never loses a document. */
export async function deleteContractCompletely(contractId: string): Promise<{ message: string } | null> {
  const { data: files } = await supabase.from('contract_attachments').select('file_path').eq('contract_id', contractId)
  const { error } = await supabase.from('contracts').delete().eq('id', contractId)
  if (error) return error
  const paths = (files ?? []).map(f => f.file_path)
  if (paths.length) await supabase.storage.from('quotations').remove(paths)
  return null
}
