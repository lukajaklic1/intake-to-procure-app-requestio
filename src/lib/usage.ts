import { supabase } from './supabase'
import { countByKey } from './usageCounts'

/** One place that can reference a record: `table.column` points at the record's id.
 *  Child tables without their own company_id (lines) are scoped through `parent`. */
export interface UsageSource { key: string; table: string; column: string; parent?: string }
export type UsageMaps = Record<string, Map<string, number>>
export type UsageCounts = Record<string, number>

/** Where each kind of record is referenced. A record with any reference cannot be deleted. */
export const USAGE = {
  supplier: [
    { key: 'requests', table: 'requests', column: 'supplier_id' },
    { key: 'orders', table: 'purchase_orders', column: 'supplier_id' },
    { key: 'contracts', table: 'contracts', column: 'supplier_id' },
    { key: 'invoices', table: 'invoices', column: 'supplier_id' },
  ],
  location: [
    { key: 'requests', table: 'requests', column: 'location_id' },
    { key: 'orders', table: 'purchase_orders', column: 'location_id' },
  ],
  department: [
    { key: 'requests', table: 'requests', column: 'department_id' },
    { key: 'orders', table: 'purchase_orders', column: 'department_id' },
    { key: 'users', table: 'users', column: 'department_id' },
    { key: 'invitations', table: 'user_invitations', column: 'department_id' },
  ],
  item: [
    { key: 'requestLines', table: 'request_line_items', column: 'item_id', parent: 'requests' },
    { key: 'poLines', table: 'po_line_items', column: 'item_id', parent: 'purchase_orders' },
    { key: 'contractItems', table: 'contract_items', column: 'item_id', parent: 'contracts' },
  ],
  category: [
    { key: 'subcategories', table: 'categories', column: 'parent_id' },
    { key: 'items', table: 'items', column: 'category_id' },
    { key: 'requestLines', table: 'request_line_items', column: 'category_id', parent: 'requests' },
    { key: 'poLines', table: 'po_line_items', column: 'category_id', parent: 'purchase_orders' },
    { key: 'requests', table: 'requests', column: 'category_id' },
    { key: 'orders', table: 'purchase_orders', column: 'category_id' },
  ],
} satisfies Record<string, UsageSource[]>

/** Reference counts per record id, for every source (used to disable the delete button up front). */
export async function loadUsage(companyId: string, sources: UsageSource[]): Promise<UsageMaps> {
  const results = await Promise.all(sources.map(s => {
    const q = s.parent
      ? supabase.from(s.table).select(`${s.column}, ${s.parent}!inner(company_id)`).eq(`${s.parent}.company_id`, companyId)
      : supabase.from(s.table).select(s.column).eq('company_id', companyId)
    return q.not(s.column, 'is', null)
  }))
  const out: UsageMaps = {}
  sources.forEach((s, i) => { out[s.key] = countByKey(results[i].data as unknown as Record<string, unknown>[] | null, s.column) })
  return out
}

export function usageFor(maps: UsageMaps, id: string): UsageCounts {
  return Object.fromEntries(Object.entries(maps).map(([k, m]) => [k, m.get(id) ?? 0]))
}

/** Fresh check against the database right before deleting; the list on screen may be stale. */
export async function recheckUsage(sources: UsageSource[], id: string): Promise<UsageCounts> {
  const results = await Promise.all(sources.map(s =>
    supabase.from(s.table).select('*', { count: 'exact', head: true }).eq(s.column, id)))
  return Object.fromEntries(sources.map((s, i) => [s.key, results[i].count ?? 0]))
}

export const isUsed = (c: UsageCounts) => Object.values(c).some(n => n > 0)

/** "Cannot delete — used in: orders 2, requests 1. Set status to Inactive instead." */
export function usageMessage(
  t: { common: { cannotDelete: string; usedIn: string; usage: Record<string, string> } },
  counts: UsageCounts,
  instead: string,
) {
  const parts = Object.entries(counts).filter(([, n]) => n > 0).map(([k, n]) => `${t.common.usage[k] ?? k} ${n}`)
  return `${t.common.cannotDelete} ${t.common.usedIn}: ${parts.join(', ')}. ${instead}`
}
