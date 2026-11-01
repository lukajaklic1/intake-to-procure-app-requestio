import { startOfMonth, subMonths } from 'date-fns'

export type Range = '1m' | '3m' | '6m' | '1y' | 'all'
export interface AFilters { dateRange: Range; supplierId: string; categoryId: string; departmentId: string }

const months = (r: Range) => (r === '1m' ? 1 : r === '3m' ? 3 : r === '6m' ? 6 : 12)

/** First day of the chosen period (null for "all time"). */
export const periodStart = (r: Range): Date | null => (r === 'all' ? null : startOfMonth(subMonths(new Date(), months(r) - 1)))

/** The period of the same length right before the chosen one, for comparisons (null for "all time"). */
export function previousPeriod(r: Range): { from: Date; to: Date } | null {
  if (r === 'all') return null
  const n = months(r)
  return { from: startOfMonth(subMonths(new Date(), 2 * n - 1)), to: startOfMonth(subMonths(new Date(), n - 1)) }
}

export const money = (n: number, currency = 'EUR') => new Intl.NumberFormat('de-DE', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)

/** Change against the previous period in whole percent; null when there is nothing to compare with. */
export const deltaPct = (current: number, previous: number | null): number | null =>
  previous == null || previous === 0 ? null : Math.round(((current - previous) / previous) * 100)

export const avg = (xs: number[]): number | null => (xs.length ? Math.round((xs.reduce((a, v) => a + v, 0) / xs.length) * 10) / 10 : null)
export const daysBetween = (from: string | Date, to: string | Date) => (new Date(to).getTime() - new Date(from).getTime()) / 86400000
