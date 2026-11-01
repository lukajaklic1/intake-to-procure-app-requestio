/** Stock of tracked catalog items per delivery location. The numbers come from the database function stock_overview(). */

export interface StockRow {
  item_id: string
  location_id: string
  on_hand: number
  min_qty: number | null
  moq: number | null          // minimum order quantity
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
 *  Never less than the minimum order quantity (MOQ) of the supplier. */
export function suggestedQty(r: StockRow): number {
  const min = Number(r.min_qty ?? 0)
  const needed = Math.ceil((min * 2 - Number(r.on_hand) - Number(r.on_order)) * 1000) / 1000
  return Math.max(1, needed, Number(r.moq ?? 0))
}

export const STATE_BADGE: Record<StockState, string> = {
  low: 'badge-danger',
  ordered: 'badge-info',
  ok: 'badge-success',
  none: 'badge-neutral',
  missing: 'badge-neutral',
}

export type MovementType = 'receipt' | 'usage' | 'waste' | 'count' | 'reversal'

export const MOVEMENT_BADGE: Record<MovementType, string> = {
  receipt: 'badge-success',
  usage: 'badge-neutral',
  waste: 'badge-warn',
  count: 'badge-info',
  reversal: 'badge-danger',
}
