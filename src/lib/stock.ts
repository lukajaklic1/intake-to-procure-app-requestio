/** Stock of tracked catalog items per delivery location. The numbers come from the database function stock_overview(). */

export interface StockRow {
  item_id: string
  location_id: string
  on_hand: number
  min_qty: number | null
  target_qty: number | null
  on_order: number          // ordered on issued / sent orders, not received yet
}

/** low: under the minimum and not covered by what is on order | ordered: under the minimum but an order is on its way |
 *  ok: at or above the minimum | none: no minimum set */
export type StockState = 'low' | 'ordered' | 'ok' | 'none'

export function stockState(r: StockRow): StockState {
  const min = Number(r.min_qty ?? 0)
  if (min <= 0) return 'none'
  const have = Number(r.on_hand)
  if (have >= min) return 'ok'
  return have + Number(r.on_order) >= min ? 'ordered' : 'low'
}

export const isLow = (r: StockRow) => stockState(r) === 'low'

/** How much to order: up to the "order up to" quantity, otherwise up to twice the minimum; what is on order counts as stock. */
export function suggestedQty(r: StockRow): number {
  const min = Number(r.min_qty ?? 0)
  const goal = r.target_qty != null && Number(r.target_qty) > 0 ? Number(r.target_qty) : min * 2
  return Math.max(1, Math.ceil((goal - Number(r.on_hand) - Number(r.on_order)) * 1000) / 1000)
}

export const STATE_BADGE: Record<StockState, string> = {
  low: 'badge-danger',
  ordered: 'badge-info',
  ok: 'badge-success',
  none: 'badge-neutral',
}

export type MovementType = 'receipt' | 'usage' | 'waste' | 'count'

export const MOVEMENT_BADGE: Record<MovementType, string> = {
  receipt: 'badge-success',
  usage: 'badge-neutral',
  waste: 'badge-warn',
  count: 'badge-info',
}
