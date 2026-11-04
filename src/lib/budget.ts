import { supabase } from './supabase'

/** What the database reports: 'ordered' is the part of the orders that is not invoiced yet, 'invoiced' the approved invoices that wait for payment, 'paid' the paid ones. */
export interface UsageRow { kind: 'ordered' | 'invoiced' | 'paid' | 'requested'; dept_id: string; cat_id: string | null; mon: number; amount: number }
/** 'ordered' (as asked for) = everything that is out through orders and invoices; 'open' only the part not invoiced yet; 'actual' = invoiced + paid. */
export type UsageKind = UsageRow['kind'] | 'open' | 'actual'
const KINDS: Record<UsageKind, UsageRow['kind'][]> = {
  ordered: ['ordered', 'invoiced', 'paid'], open: ['ordered'], invoiced: ['invoiced'], paid: ['paid'], actual: ['invoiced', 'paid'], requested: ['requested'],
}

/** Spend and claims of a year per department and main category (see the budget_usage function in the database).
 *  The document that is being edited can be left out so it is not counted twice. */
export async function loadBudgetUsage(year: number, excludeRequest?: string | null, excludePo?: string | null): Promise<UsageRow[]> {
  const { data } = await (supabase as any).rpc('budget_usage', { p_year: year, p_exclude_request: excludeRequest ?? null, p_exclude_po: excludePo ?? null })
  return ((data as UsageRow[] | null) ?? []).map(r => ({ ...r, amount: Number(r.amount) }))
}

/** Amount of one kind for a department; with a category only that main category, without it the whole department; with a month only that month. */
export function usageOf(rows: UsageRow[], deptId: string, catId: string | null, kind: UsageKind, month?: number): number {
  return rows.filter(r => KINDS[kind].includes(r.kind) && r.dept_id === deptId && (catId === null || r.cat_id === catId) && (month === undefined || r.mon === month)).reduce((n, r) => n + r.amount, 0)
}

/** The budget of one month: the entered monthly amount, or a twelfth of the year when it is not split. */
export const monthBudget = (b: { amount: number; months: number[] | null }, month: number) =>
  b.months && b.months.length === 12 ? Number(b.months[month - 1]) : Number(b.amount) / 12

/** How full a budget is, as a whole percent (not capped, so 112 means over budget). */
export const usedPercent = (used: number, budget: number) => (budget > 0 ? Math.round((used / budget) * 100) : used > 0 ? 100 : 0)

/** Colour of a used share: calm up to 80 %, warning above, red over the budget. */
export const usedTone = (pct: number) => (pct > 100 ? 'danger' : pct >= 80 ? 'warn' : 'ok') as 'danger' | 'warn' | 'ok'

/** Use of the budget of the projects over the whole life of a project (see project_usage in the database); same stages as the department budgets. */
export interface ProjectUsageRow { kind: UsageRow['kind']; project_id: string; amount: number }

export async function loadProjectUsage(excludeRequest?: string | null, excludePo?: string | null): Promise<ProjectUsageRow[]> {
  const { data } = await (supabase as any).rpc('project_usage', { p_exclude_request: excludeRequest ?? null, p_exclude_po: excludePo ?? null })
  return ((data as ProjectUsageRow[] | null) ?? []).map(r => ({ ...r, amount: Number(r.amount) }))
}

export function projectUsageOf(rows: ProjectUsageRow[], projectId: string, kind: UsageKind): number {
  return rows.filter(r => r.project_id === projectId && KINDS[kind].includes(r.kind)).reduce((n, r) => n + r.amount, 0)
}
