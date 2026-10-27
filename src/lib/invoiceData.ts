import { supabase } from './supabase'
import type { PoLine } from './invoiceMatching'

export interface PoLineFull extends PoLine { unit: string | null; position: number }

export interface MatchData {
  poLines: PoLineFull[]
  received: Map<string, number>
  invoicedElsewhere: Map<string, number>
}

/** Everything needed to match an invoice against a PO: its lines, what was received on it, and
 *  how much of each line is already on other (non-rejected) invoices. */
export async function loadMatchData(poId: string, excludeInvoiceId?: string): Promise<MatchData> {
  const { data: pl } = await supabase.from('po_line_items').select('id, name, quantity, unit, unit_price, position').eq('po_id', poId).order('position')
  const poLines = ((pl ?? []) as PoLineFull[]).map(l => ({ ...l, quantity: Number(l.quantity), unit_price: Number(l.unit_price) }))
  const ids = poLines.map(l => l.id)
  const received = new Map<string, number>()
  const invoicedElsewhere = new Map<string, number>()
  if (ids.length > 0) {
    const { data: rc } = await supabase.from('receipt_line_items').select('po_line_id, quantity_received').in('po_line_id', ids)
    for (const r of rc ?? []) received.set(r.po_line_id as string, (received.get(r.po_line_id as string) ?? 0) + Number(r.quantity_received))
    let q = supabase.from('invoice_line_items').select('po_line_id, quantity, invoice_id, invoices!inner(status)').in('po_line_id', ids).neq('invoices.status', 'rejected')
    if (excludeInvoiceId) q = q.neq('invoice_id', excludeInvoiceId)
    const { data: iv } = await q
    for (const r of iv ?? []) invoicedElsewhere.set(r.po_line_id as string, (invoicedElsewhere.get(r.po_line_id as string) ?? 0) + Number(r.quantity))
  }
  return { poLines, received, invoicedElsewhere }
}
