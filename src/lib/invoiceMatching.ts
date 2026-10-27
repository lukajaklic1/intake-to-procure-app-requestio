/** Invoice matching: compares an invoice with its purchase order (2-way) and, once goods were
 *  received, with the receipts (3-way). Pure functions, so the form and the detail page agree. */

export const PRICE_TOLERANCE_PCT = 2     // allowed unit-price difference vs. the PO
export const TOTAL_TOLERANCE = 0.02      // allowed difference between computed and printed total (rounding)
const QTY_EPS = 0.0005

export interface InvLine { id?: string; po_line_id: string | null; name: string; quantity: number; unit_price: number }
export interface PoLine { id: string; name: string; quantity: number; unit_price: number }

export type IssueCode = 'no_po' | 'price' | 'qty_over_received' | 'qty_over_ordered' | 'not_on_po' | 'total' | 'not_received'
export interface Issue { code: IssueCode; severity: 'error' | 'warning'; lineIndex?: number; name?: string; expected?: number; actual?: number }
export type MatchStatus = 'unmatched' | 'matched' | 'mismatch'

export interface MatchInput {
  hasPo: boolean
  lines: InvLine[]
  poLines: PoLine[]
  received: Map<string, number>             // po_line_id -> quantity received (all receipts)
  invoicedElsewhere: Map<string, number>    // po_line_id -> quantity on OTHER invoices (not rejected)
  totalAmount: number
  documentTotal: number | null
}

export interface MatchResult {
  status: MatchStatus
  issues: Issue[]
  perLine: Issue[][]                        // issues by invoice line index
  basis: 'none' | '2-way' | '3-way'
}

export function computeMatch(input: MatchInput): MatchResult {
  const { hasPo, lines, poLines, received, invoicedElsewhere, totalAmount, documentTotal } = input
  const issues: Issue[] = []
  const perLine: Issue[][] = lines.map(() => [])
  const add = (i: Issue) => { issues.push(i); if (i.lineIndex != null) perLine[i.lineIndex].push(i) }

  if (!hasPo) {
    add({ code: 'no_po', severity: 'warning' })
    if (documentTotal != null && Math.abs(documentTotal - totalAmount) > TOTAL_TOLERANCE) add({ code: 'total', severity: 'error', expected: documentTotal, actual: totalAmount })
    return { status: 'unmatched', issues, perLine, basis: 'none' }
  }

  const anyReceipt = [...received.values()].some(q => q > 0)
  const byId = new Map(poLines.map(l => [l.id, l]))

  lines.forEach((l, i) => {
    const po = l.po_line_id ? byId.get(l.po_line_id) : undefined
    if (!po) { add({ code: 'not_on_po', severity: 'error', lineIndex: i, name: l.name }); return }

    if (po.unit_price > 0 && Math.abs(l.unit_price - po.unit_price) / po.unit_price * 100 > PRICE_TOLERANCE_PCT) {
      add({ code: 'price', severity: 'error', lineIndex: i, name: l.name, expected: po.unit_price, actual: l.unit_price })
    }
    const before = invoicedElsewhere.get(po.id) ?? 0
    if (anyReceipt) {
      const limit = (received.get(po.id) ?? 0) - before
      if (l.quantity > limit + QTY_EPS) add({ code: 'qty_over_received', severity: 'error', lineIndex: i, name: l.name, expected: Math.max(0, limit), actual: l.quantity })
    } else {
      const limit = po.quantity - before
      if (l.quantity > limit + QTY_EPS) add({ code: 'qty_over_ordered', severity: 'error', lineIndex: i, name: l.name, expected: Math.max(0, limit), actual: l.quantity })
    }
  })

  if (!anyReceipt) add({ code: 'not_received', severity: 'warning' })
  if (documentTotal != null && Math.abs(documentTotal - totalAmount) > TOTAL_TOLERANCE) add({ code: 'total', severity: 'error', expected: documentTotal, actual: totalAmount })

  const status: MatchStatus = issues.some(i => i.severity === 'error') ? 'mismatch' : 'matched'
  return { status, issues, perLine, basis: anyReceipt ? '3-way' : '2-way' }
}

/** Totals of an invoice from its lines and tax rate. */
export function invoiceTotals(lines: { quantity: number; unit_price: number }[], taxRate: number) {
  const subtotal = Math.round(lines.reduce((n, l) => n + l.quantity * l.unit_price, 0) * 100) / 100
  const tax = Math.round(subtotal * taxRate) / 100
  return { subtotal, tax, total: Math.round((subtotal + tax) * 100) / 100 }
}
