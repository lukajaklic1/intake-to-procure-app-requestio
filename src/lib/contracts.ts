import type { Contract } from '../types/database'

export type EffectiveStatus = 'draft' | 'active' | 'expired' | 'terminated'

/** Whole days from today until the given date (negative = in the past). */
export function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null
  const end = new Date(date + 'T00:00:00')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.round((end.getTime() - today.getTime()) / 86_400_000)
}

/** "Active" contracts whose end date has passed count as expired. */
export function effectiveStatus(c: Pick<Contract, 'status' | 'end_date'>): EffectiveStatus {
  if (c.status === 'active') {
    const d = daysUntil(c.end_date)
    if (d != null && d < 0) return 'expired'
  }
  return c.status
}

export const STATUS_BADGE: Record<EffectiveStatus, string> = {
  draft: 'badge-neutral',
  active: 'badge-success',
  expired: 'badge-danger',
  terminated: 'badge-neutral',
}

/** The date by which the contract must be cancelled / renegotiated (end date minus notice period). */
export function noticeDate(c: Pick<Contract, 'end_date' | 'notice_days'>): string | null {
  if (!c.end_date || !c.notice_days) return null
  const d = new Date(c.end_date + 'T00:00:00')
  d.setDate(d.getDate() - c.notice_days)
  return d.toISOString().slice(0, 10)
}

/** Contracts that need attention soon: active, ending (or notice due) within `days`. */
export function needsAttention(c: Pick<Contract, 'status' | 'end_date' | 'notice_days'>, days = 60): boolean {
  if (c.status !== 'active') return false
  const end = daysUntil(c.end_date)
  const notice = daysUntil(noticeDate(c))
  return (end != null && end >= 0 && end <= days) || (notice != null && notice >= 0 && notice <= days)
}
