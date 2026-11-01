/** Sourcing (povpraševanja): types, status colours and the evaluation of the offers. Pure functions, so the pages agree. */

export type EventType = 'rfq' | 'rfp' | 'rfi'
export type EventStatus = 'draft' | 'sent' | 'evaluation' | 'awarded' | 'cancelled'
export type InvitationStatus = 'invited' | 'responded' | 'declined'
export type CriterionKind = 'price' | 'delivery' | 'manual'

export interface SEvent {
  id: string; company_id: string; event_number: string; title: string; event_type: EventType; status: EventStatus
  description: string | null; department_id: string | null; location_id: string | null; category_id: string | null; request_id: string | null
  deadline: string | null; sent_at: string | null; current_round: number; baseline_amount: number | null
  awarded_invitation_id: string | null; awarded_at: string | null; awarded_by: string | null; award_note: string | null
  awarded_total: number | null; baseline_total: number | null; notes: string | null
  created_by: string | null; created_at: string; updated_at: string
}
export interface SItem { id: string; event_id: string; position: number; item_id: string | null; name: string; description: string | null; quantity: number; unit: string | null; target_price: number | null; category_id: string | null }
export interface SInvitation { id: string; event_id: string; supplier_id: string; contact_email: string | null; sent_at: string | null; status: InvitationStatus; responded_at: string | null; decline_reason: string | null; notes: string | null }
export interface SBid { id: string; event_id: string; invitation_id: string; round: number; total_amount: number; complete: boolean; delivery_days: number | null; payment_terms: string | null; valid_until: string | null; notes: string | null; submitted_at: string }
export interface SBidLine { id: string; bid_id: string; item_id: string; unit_price: number | null }
export interface SCriterion { id: string; event_id: string; position: number; name: string; weight: number; kind: CriterionKind }
export interface SScore { id?: string; criterion_id: string; invitation_id: string; evaluator_id: string; score: number }

export const STATUS_BADGE: Record<EventStatus, string> = {
  draft: 'badge-neutral',
  sent: 'badge-info',
  evaluation: 'badge-warn',
  awarded: 'badge-success',
  cancelled: 'badge-neutral',
}
export const TYPE_BADGE: Record<EventType, string> = { rfq: 'badge-info', rfp: 'badge-purple', rfi: 'badge-neutral' }
export const INVITATION_BADGE: Record<InvitationStatus, string> = { invited: 'badge-neutral', responded: 'badge-success', declined: 'badge-danger' }

/** Criteria a new event starts with (the weights add up to 100). */
export const DEFAULT_CRITERIA: { name: 'price' | 'delivery' | 'quality' | 'payment'; weight: number; kind: CriterionKind }[] = [
  { name: 'price', weight: 60, kind: 'price' },
  { name: 'delivery', weight: 20, kind: 'delivery' },
  { name: 'quality', weight: 10, kind: 'manual' },
  { name: 'payment', weight: 10, kind: 'manual' },
]

/** Total of an offer from the prices per item, and whether every item has a price. */
export function bidTotal(items: Pick<SItem, 'id' | 'quantity'>[], prices: Map<string, number | null>) {
  let total = 0; let complete = items.length > 0
  for (const it of items) {
    const p = prices.get(it.id)
    if (p == null) { complete = false; continue }
    total += Math.round(Number(it.quantity) * p * 100) / 100
  }
  return { total: Math.round(total * 100) / 100, complete }
}

export interface Evaluation {
  invitationId: string
  bid: SBid
  total: number
  complete: boolean
  /** points 0-10 per criterion id, null when it is not scored yet */
  points: Record<string, number | null>
  /** weighted result 0-10 */
  weighted: number
  rank: number
  /** a criterion that is scored by hand has no score yet */
  unscored: boolean
}

/** Scores the offers of one round: price and delivery are calculated against the best offer, the other criteria are the
 *  average of what the evaluators entered. An incomplete offer (not every item priced) gets no points for price. */
export function evaluate(round: number, bids: SBid[], criteria: SCriterion[], scores: SScore[]): Map<string, Evaluation> {
  const inRound = bids.filter(b => b.round === round)
  const completeTotals = inRound.filter(b => b.complete && Number(b.total_amount) > 0).map(b => Number(b.total_amount))
  const bestTotal = completeTotals.length ? Math.min(...completeTotals) : 0
  const days = inRound.map(b => Number(b.delivery_days ?? 0)).filter(d => d > 0)
  const bestDays = days.length ? Math.min(...days) : 0

  const out: Evaluation[] = inRound.map(b => {
    const points: Record<string, number | null> = {}
    let unscored = false
    for (const c of criteria) {
      if (c.kind === 'price') points[c.id] = b.complete && bestTotal > 0 && Number(b.total_amount) > 0 ? Math.round((10 * bestTotal / Number(b.total_amount)) * 100) / 100 : 0
      else if (c.kind === 'delivery') points[c.id] = bestDays > 0 && Number(b.delivery_days ?? 0) > 0 ? Math.round((10 * bestDays / Number(b.delivery_days)) * 100) / 100 : 0
      else {
        const given = scores.filter(x => x.criterion_id === c.id && x.invitation_id === b.invitation_id).map(x => Number(x.score))
        if (given.length === 0) { points[c.id] = null; unscored = true } else points[c.id] = Math.round((given.reduce((a, v) => a + v, 0) / given.length) * 100) / 100
      }
    }
    const weighted = criteria.reduce((sum, c) => sum + (Number(c.weight) / 100) * (points[c.id] ?? 0), 0)
    return { invitationId: b.invitation_id, bid: b, total: Number(b.total_amount), complete: b.complete, points, weighted: Math.round(weighted * 100) / 100, rank: 0, unscored }
  })
  out.sort((a, b) => b.weighted - a.weighted)
  out.forEach((e, i) => { e.rank = i + 1 })
  return new Map(out.map(e => [e.invitationId, e]))
}

/** The starting value the savings are measured from: the amount typed by the buyer, otherwise the average of the complete offers. */
export function baselineOf(event: Pick<SEvent, 'baseline_amount'>, bids: SBid[], round: number): number | null {
  if (event.baseline_amount != null && Number(event.baseline_amount) > 0) return Number(event.baseline_amount)
  const totals = bids.filter(b => b.round === round && b.complete && Number(b.total_amount) > 0).map(b => Number(b.total_amount))
  return totals.length ? Math.round((totals.reduce((a, v) => a + v, 0) / totals.length) * 100) / 100 : null
}
