import { supabase } from './supabase'

/** Stock of tracked catalog items per delivery location. The numbers come from the database function stock_overview(). */

export interface StockRow {
  item_id: string
  location_id: string
  on_hand: number
  min_qty: number | null
  unit_cost?: number | null   // last purchase price at the location, otherwise the catalog price
  on_order: number          // ordered on issued / sent orders, not received yet
}

/** low: under the minimum and not covered by what is on order | ordered: under the minimum but an order is on its way |
 *  ok: at or above the minimum | none: no minimum set | missing: a tracked item that is not in stock at any location yet */
export type StockState = 'low' | 'ordered' | 'ok' | 'none' | 'missing'

export function stockState(r: StockRow): StockState {
  const min = Number(r.min_qty ?? 0)
  const have = Number(r.on_hand)
  // no minimum: an item that only exists because it is on order is shown as ordered
  if (min <= 0) return have <= 0 && Number(r.on_order) > 0 ? 'ordered' : 'none'
  if (have >= min) return 'ok'
  return have + Number(r.on_order) >= min ? 'ordered' : 'low'
}

export const isLow = (r: StockRow) => stockState(r) === 'low'

/** How much to order: enough to bring the stock to twice the minimum stock; what is on order counts as stock.
 */
export function suggestedQty(r: StockRow): number {
  const min = Number(r.min_qty ?? 0)
  const needed = Math.ceil((min * 2 - Number(r.on_hand) - Number(r.on_order)) * 1000) / 1000
  return Math.max(1, needed)
}

export const STATE_BADGE: Record<StockState, string> = {
  low: 'badge-danger',
  ordered: 'badge-info',
  ok: 'badge-success',
  none: 'badge-neutral',
  missing: 'badge-neutral',
}

export type MovementType = 'receipt' | 'usage' | 'waste' | 'count' | 'reversal' | 'transfer'

export const MOVEMENT_BADGE: Record<MovementType, string> = {
  receipt: 'badge-success',
  usage: 'badge-neutral',
  waste: 'badge-warn',
  count: 'badge-info',
  reversal: 'badge-danger',
  transfer: 'badge-purple',
}

/** Value of the stock of one row: what is on hand (never below zero) at the unit cost. */
export const stockValue = (r: StockRow): number | null => (r.unit_cost == null ? null : Math.max(0, Number(r.on_hand)) * Number(r.unit_cost))

/** How an item is used at a location, worked out from usage and write-offs of the last 90 days. */
export interface UsageInfo {
  perDay: number            // average usage per day
  windowDays: number        // the days the average is taken over
  enough: boolean           // there is at least a week of history: before that nothing is worked out, a guess would only mislead
  daysToGo: number          // days of history still missing (0 when there is enough)
  lead: number              // days from the order being marked as sent to the receipt (average of the past receipts of the item, 7 when there are none)
  leadSamples: number       // the receipts the delivery time is averaged over (0 = no receipts yet, the 7 days are an assumption)
  daysLeft: number | null   // how long the stock lasts at this pace
  suggestedMin: number | null
  safetyStock: number | null  // buffer against uneven usage
  targetTurnover: number | null // turnover the stock would have if it were kept at the suggested level
  usedQty: number           // used in the window (usage and write-offs)
  avgQty: number            // average stock over the window
}
export const SAFETY_DAYS = 3
export const MIN_HISTORY_DAYS = 7
const SERVICE_Z = 1.65        // 95 % of the days without running out
const ORDER_CYCLE_DAYS = 14   // how often the stock is topped up, for the target turnover
const DAY = 86400000

/** Average daily usage, how long the stock lasts and a suggested minimum stock (usage per day x (lead time + safety days)).
 *  Counts (inventory corrections) are not usage. `older` holds the rows that had movements before the window, so their average is over the whole window. */
export function computeUsage(
  rows: StockRow[],
  moves: { item_id: string; location_id: string; movement_type: string; quantity: number; created_at: string }[],
  older: Set<string>,
  leadByItem: Map<string, { days: number; n: number }>,
): Map<string, UsageInfo> {
  const out = new Map<string, UsageInfo>()
  const now = Date.now()
  for (const r of rows) {
    const key = `${r.item_id}:${r.location_id}`
    const mine = moves.filter(m => m.item_id === r.item_id && m.location_id === r.location_id)
    const used = mine.filter(m => m.movement_type === 'usage' || m.movement_type === 'waste').reduce((n, m) => n - Number(m.quantity), 0)
    const first = mine.length ? Math.min(...mine.map(m => new Date(m.created_at).getTime())) : now
    const windowDays = older.has(key) ? 90 : Math.min(90, Math.max(7, Math.ceil((now - first) / DAY)))
    const histDays = (now - first) / DAY
    const enough = older.has(key) || histDays >= MIN_HISTORY_DAYS
    const perDay = enough && used > 0 ? used / windowDays : 0
    // the stock at the start of the window = the stock now minus everything that moved since
    const net = mine.reduce((n, m) => n + Number(m.quantity), 0)
    const endQty = Math.max(0, Number(r.on_hand))
    const startQty = Math.max(0, Number(r.on_hand) - net)
    const lead = leadByItem.get(r.item_id)?.days ?? 7
    // safety stock: how much the daily usage varies x the service level x the square root of the delivery time; with little history 3 days of usage
    const perDayUsed = new Map<string, number>()
    for (const m of mine) if (m.movement_type === 'usage' || m.movement_type === 'waste') { const day = m.created_at.slice(0, 10); perDayUsed.set(day, (perDayUsed.get(day) ?? 0) - Number(m.quantity)) }
    const sumSq = [...perDayUsed.values()].reduce((n, v) => n + v * v, 0)
    const sigma = Math.sqrt(Math.max(0, sumSq / windowDays - perDay * perDay))
    const safetyStock = perDay > 0 ? Math.max(1, Math.ceil(windowDays >= 30 && sigma > 0 ? SERVICE_Z * sigma * Math.sqrt(lead) : perDay * SAFETY_DAYS)) : null
    // average stock when it is topped up every two weeks: the safety stock and half an order
    const orderQty = Math.ceil(perDay * ORDER_CYCLE_DAYS)
    const targetAvg = safetyStock != null ? safetyStock + orderQty / 2 : 0
    out.set(key, {
      perDay, windowDays, lead, leadSamples: leadByItem.get(r.item_id)?.n ?? 0, enough, daysToGo: enough ? 0 : Math.max(1, Math.ceil(MIN_HISTORY_DAYS - histDays)),
      daysLeft: perDay > 0 ? Math.max(0, Number(r.on_hand)) / perDay : null,
      suggestedMin: perDay > 0 && safetyStock != null ? Math.max(1, Math.ceil(perDay * lead + safetyStock)) : null,
      safetyStock,
      targetTurnover: targetAvg > 0 ? Math.round(((perDay * 365) / targetAvg) * 10) / 10 : null,
      usedQty: used, avgQty: (startQty + endQty) / 2,
    })
  }
  return out
}

/** The stock overview as numbers. */
export async function loadStockOverview(): Promise<StockRow[]> {
  const { data } = await supabase.rpc('stock_overview')
  return ((data ?? []) as StockRow[]).map(r => ({
    ...r, on_hand: Number(r.on_hand), on_order: Number(r.on_order), min_qty: r.min_qty != null ? Number(r.min_qty) : null,
    unit_cost: r.unit_cost != null ? Number(r.unit_cost) : null,
  }))
}

/** Usage of the last 90 days and the delivery time of each item, then worked out per row. */
export async function loadUsage(companyId: string, rows: StockRow[]): Promise<Map<string, UsageInfo>> {
  const since = new Date(Date.now() - 90 * DAY).toISOString()
  const [mv, old, rc] = await Promise.all([
    supabase.from('stock_movements').select('item_id, location_id, movement_type, quantity, created_at').eq('company_id', companyId).gte('created_at', since).limit(10000),
    supabase.from('stock_movements').select('item_id, location_id').eq('company_id', companyId).lt('created_at', since).limit(5000),
    supabase.from('stock_movements').select('item_id, receipts(received_date, purchase_orders(created_at, po_activity_log(action, created_at)))').eq('company_id', companyId).eq('movement_type', 'receipt').limit(3000),
  ])
  // days from the order being marked as sent (the order being created when that is not logged) to the receipt, per item
  const leads = new Map<string, number[]>()
  for (const x of ((rc.data ?? []) as unknown as { item_id: string; receipts: { received_date: string; purchase_orders: { created_at: string; po_activity_log: { action: string; created_at: string }[] } | null } | null }[])) {
    const r = x.receipts; if (!r?.purchase_orders) continue
    const sent = r.purchase_orders.po_activity_log.filter(a => a.action === 'sent').map(a => a.created_at).sort()[0] ?? r.purchase_orders.created_at
    const days = Math.max(0, Math.round((new Date(r.received_date).getTime() - new Date(sent.slice(0, 10)).getTime()) / DAY))
    leads.set(x.item_id, [...(leads.get(x.item_id) ?? []), days])
  }
  const leadByItem = new Map([...leads].map(([k, v]) => [k, { days: Math.max(1, Math.round(v.reduce((a, b) => a + b, 0) / v.length)), n: v.length }]))
  const olderKeys = new Set(((old.data ?? []) as { item_id: string; location_id: string }[]).map(x => `${x.item_id}:${x.location_id}`))
  return computeUsage(rows, (mv.data ?? []) as { item_id: string; location_id: string; movement_type: string; quantity: number; created_at: string }[], olderKeys, leadByItem)
}

/** Inventory turnover: the usage of a year at the unit cost divided by the average value of the stock (higher is better: money does
 *  not sit in the storeroom). Days of stock = 365 / turnover. Only rows with a price are counted. */
export function stockTurnover(rows: StockRow[], usage: Map<string, UsageInfo>): { turnover: number | null; daysOfStock: number | null; value: number } {
  let used = 0; let avg = 0; let value = 0
  for (const r of rows) {
    const u = usage.get(`${r.item_id}:${r.location_id}`)
    const cost = r.unit_cost == null ? null : Number(r.unit_cost)
    value += stockValue(r) ?? 0
    if (!u || !u.enough || cost == null) continue
    used += u.usedQty * cost * (365 / u.windowDays)
    avg += u.avgQty * cost
  }
  const turnover = avg > 0 && used > 0 ? Math.round((used / avg) * 10) / 10 : null
  return { turnover, daysOfStock: turnover ? Math.round(365 / turnover) : null, value }
}
