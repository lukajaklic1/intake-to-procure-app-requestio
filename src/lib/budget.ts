import { supabase } from './supabase'

export interface UsageRow { kind: 'ordered' | 'requested'; dept_id: string; cat_id: string | null; mon: number; amount: number }

/** Spend and claims of a year per department and main category (see the budget_usage function in the database).
 *  The document that is being edited can be left out so it is not counted twice. */
export async function loadBudgetUsage(year: number, excludeRequest?: string | null, excludePo?: string | null): Promise<UsageRow[]> {
  const { data } = await (supabase as any).rpc('budget_usage', { p_year: year, p_exclude_request: excludeRequest ?? null, p_exclude_po: excludePo ?? null })
  return ((data as UsageRow[] | null) ?? []).map(r => ({ ...r, amount: Number(r.amount) }))
}

/** Amount of one kind for a department; with a category only that main category, without it the whole department; with a month only that month. */
export function usageOf(rows: UsageRow[], deptId: string, catId: string | null, kind: UsageRow['kind'], month?: number): number {
  return rows.filter(r => r.kind === kind && r.dept_id === deptId && (catId === null || r.cat_id === catId) && (month === undefined || r.mon === month)).reduce((n, r) => n + r.amount, 0)
}

/** The budget of one month: the entered monthly amount, or a twelfth of the year when it is not split. */
export const monthBudget = (b: { amount: number; months: number[] | null }, month: number) =>
  b.months && b.months.length === 12 ? Number(b.months[month - 1]) : Number(b.amount) / 12

/** How full a budget is, as a whole percent (not capped, so 112 means over budget). */
export const usedPercent = (used: number, budget: number) => (budget > 0 ? Math.round((used / budget) * 100) : used > 0 ? 100 : 0)

/** Colour of a used share: calm up to 80 %, warning above, red over the budget. */
export const usedTone = (pct: number) => (pct > 100 ? 'danger' : pct >= 80 ? 'warn' : 'ok') as 'danger' | 'warn' | 'ok'
