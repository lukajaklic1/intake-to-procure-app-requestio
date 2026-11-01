import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft, ChevronRight, FileText, Package, Hash, Check, PackageX, PackageCheck, Undo2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { useLanguage } from '../hooks/useLanguage'
import { toast } from '../components/ui/Toast'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import ModalActions from '../components/ui/ModalActions'
import GridHead from '../components/ui/GridHead'
import PersonCell from '../components/ui/PersonCell'
import { Card, Field } from '../components/ui/DetailCard'
import { unitLabel } from '../lib/units'
import { format } from 'date-fns'

interface Full {
  id: string; receipt_number: string; received_date: string; received_by: string; created_at: string; reversal_of: string | null
  supplier_receipt_no: string | null; note: string | null; po_id: string
  purchase_orders: { po_number: string; received_status: 'none' | 'partial' | 'full'; status: string; suppliers: { name: string } | null; locations: { name: string } | null } | null
}
interface RLine {
  id: string; po_line_id: string; quantity_received: number; quantity_rejected: number
  po_line_items: { name: string; unit: string; quantity: number } | null
}
interface Link2 { id: string; receipt_number: string; received_date: string; note: string | null }

const fmtQty = (n: number) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 }).format(n)

export default function ReceiptDetailPage() {
  const { id } = useParams()
  const { profile, isAdmin, hasPerm } = useCompany()
  const { t, lang } = useLanguage()
  const s = t.receipts
  const navigate = useNavigate()
  const [rec, setRec] = useState<Full | null>(null)
  const [lines, setLines] = useState<RLine[]>([])
  const [totals, setTotals] = useState<Record<string, number>>({})   // received on each order line over all receipts
  const [atts, setAtts] = useState<{ id: string; file_name: string; file_path: string }[]>([])
  const [receiverName, setReceiverName] = useState('')
  const [original, setOriginal] = useState<Link2 | null>(null)       // this receipt is a cancellation of this one
  const [cancelledBy, setCancelledBy] = useState<Link2 | null>(null) // this receipt was cancelled by this one
  const [invoiceBlock, setInvoiceBlock] = useState(false)             // an invoice of the order is already approved
  const [loading, setLoading] = useState(true)
  const [reverseOpen, setReverseOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [reasonErr, setReasonErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { load() }, [id])

  async function load() {
    // spinner only on the first load: later reloads refresh the data in place
    const { data } = await supabase.from('receipts')
      .select('id, receipt_number, received_date, created_at, received_by, reversal_of, supplier_receipt_no, note, po_id, purchase_orders(po_number, received_status, status, suppliers(name), locations(name))')
      .eq('id', id!).single()
    if (!data) { toast.error(t.common.notFound); navigate('/receipts'); return }
    const r = data as unknown as Full
    setRec(r)
    const { data: ls } = await supabase.from('receipt_line_items').select('id, po_line_id, quantity_received, quantity_rejected, po_line_items(name, unit, quantity)').eq('receipt_id', id!)
    const rl = (ls as unknown as RLine[]) ?? []
    setLines(rl)
    if (rl.length) {
      const { data: all } = await supabase.from('receipt_line_items').select('po_line_id, quantity_received').in('po_line_id', rl.map(l => l.po_line_id))
      const m: Record<string, number> = {}
      for (const x of all ?? []) m[x.po_line_id] = (m[x.po_line_id] ?? 0) + Number(x.quantity_received)
      setTotals(m)
    }
    const { data: a } = await supabase.from('receipt_attachments').select('id, file_name, file_path').eq('receipt_id', id!)
    setAtts(a ?? [])
    const { data: u } = await supabase.from('users').select('first_name, last_name').eq('id', r.received_by).single()
    if (u) setReceiverName(`${u.first_name} ${u.last_name}`)

    // the receipt this one cancels, or the one that cancels this one
    const cols = 'id, receipt_number, received_date, note'
    if (r.reversal_of) {
      const { data: o } = await supabase.from('receipts').select(cols).eq('id', r.reversal_of).single()
      setOriginal((o as Link2) ?? null); setCancelledBy(null)
    } else {
      const { data: c } = await supabase.from('receipts').select(cols).eq('reversal_of', id!).maybeSingle()
      setCancelledBy((c as Link2) ?? null); setOriginal(null)
    }
    const { count } = await supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('po_id', r.po_id).in('status', ['approved', 'paid'])
    setInvoiceBlock((count ?? 0) > 0)
    setLoading(false)
  }

  async function openAttachment(path: string) {
    const { data } = await supabase.storage.from('quotations').createSignedUrl(path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function reverse() {
    if (!reason.trim()) { setReasonErr(s.reverseReasonRequired); return }
    setBusy(true)
    const { data: newId, error } = await supabase.rpc('reverse_receipt', { p_receipt_id: id!, p_reason: reason.trim() })
    setBusy(false)
    if (error) { toast.error(error.message); return }
    setReverseOpen(false); setReason('')
    toast.success(s.reverseDone)
    navigate(`/receipts/${newId}`)
  }

  if (loading || !rec) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>

  const po = rec.purchase_orders
  const isReversal = !!rec.reversal_of
  const hasRejected = lines.some(l => Number(l.quantity_rejected) > 0)
  // the creator of a receipt or an admin may cancel it, once, and not a cancellation itself
  const canReverse = !isReversal && !cancelledBy && po?.status !== 'cancelled' && (isAdmin || (hasPerm('receipts', 'create') && rec.received_by === profile?.id))
  // state of the order as it is now (not as it was at the time of this receipt)
  const poBadge = po?.received_status === 'full'
    ? <span className="badge badge-success">{s.rsFull}</span>
    : po?.status === 'closed'
    ? <span className="badge badge-info">{t.po.statusFinalized}</span>
    : po?.received_status === 'partial'
    ? <span className="badge badge-warn">{s.rsPartial}</span>
    : null

  return (
    <div className="p-4 lg:p-6">
      <nav className="flex items-center gap-2 text-sm text-ink2 mb-5">
        <button type="button" onClick={() => navigate('/receipts')} aria-label={s.title} title={s.title}
          className="w-7 h-7 -ml-1.5 mr-1 inline-flex items-center justify-center rounded-lg text-icon hover:bg-selected hover:text-ink transition-colors">
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
        </button>
        <Link to="/receipts" className="hover:text-ink transition-colors">{s.title}</Link>
        <ChevronRight className="w-3.5 h-3.5 text-icon" />
        <span className="text-ink font-medium">{rec.receipt_number}</span>
      </nav>

      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-semibold text-ink tracking-tight">{rec.receipt_number}</h1>
            {isReversal && <span className="badge badge-warn">{s.reversalBadge}</span>}
            {cancelledBy && <span className="badge badge-neutral">{s.reversedBadge}</span>}
            {!isReversal && !cancelledBy && poBadge}
          </div>
          <p className="mt-2 text-sm text-ink2">{po?.suppliers?.name} · {format(new Date(rec.received_date), 'dd.MM.yyyy')}</p>
        </div>
        {canReverse && (
          <Button variant="secondary" onClick={() => { setReason(''); setReasonErr(''); setReverseOpen(true) }} disabled={invoiceBlock} title={invoiceBlock ? s.reverseBlocked : undefined} className="gap-2">
            <Undo2 className="w-4 h-4" />{s.reverse}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        {/* left: what arrived */}
        <div className="xl:col-span-2 flex flex-col gap-4">
          <Card title={t.po.lineItems} className="overflow-hidden">
            <div className="overflow-x-auto"><table className="table-grid w-full text-sm min-w-[640px]">
              <GridHead cols={[[t.po.description, Package], [s.orderedQty, Hash, 'right'], [s.received, Check, 'right'], [s.rejected, PackageX, 'right'], [s.receivedTotal, PackageCheck, 'right']]} />
              <tbody className="divide-y divide-field">
                {lines.map(l => {
                  const ordered = Number(l.po_line_items?.quantity ?? 0)
                  const total = totals[l.po_line_id] ?? 0
                  const received = Number(l.quantity_received)
                  return (
                    <tr key={l.id}>
                      <td className="px-4 py-3 text-ink">
                        <span className="font-medium">{l.po_line_items?.name ?? '-'}</span>
                        <span className="text-ink2"> · {unitLabel(l.po_line_items?.unit ?? '', lang) || l.po_line_items?.unit}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-ink2 tabular-nums">{fmtQty(ordered)}</td>
                      <td className={`px-4 py-3 text-right font-medium tabular-nums ${received < 0 ? 'text-danger' : 'text-ink'}`}>{fmtQty(received)}</td>
                      <td className={`px-4 py-3 text-right tabular-nums ${Number(l.quantity_rejected) > 0 ? 'text-danger font-medium' : 'text-ink2'}`}>{Number(l.quantity_rejected) > 0 ? fmtQty(Number(l.quantity_rejected)) : '-'}</td>
                      <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                        <span className={total >= ordered ? 'text-success font-medium' : 'text-ink2'}>{fmtQty(total)} / {fmtQty(ordered)}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table></div>
          </Card>
        </div>

        {/* right: the delivery itself */}
        <div className="flex flex-col gap-4 order-first xl:order-none">
          <Card title={s.orderCard}>
            <div className="p-5 grid grid-cols-2 gap-x-6 gap-y-5">
              <Field label={t.po.poNumber}>
                <Link to={`/purchase-orders/${rec.po_id}`} className="font-medium hover:underline">{po?.po_number}</Link>
              </Field>
              <Field label={s.location}>{po?.locations?.name}</Field>
              <div className="col-span-2"><Field label={t.po.supplier}>{po?.suppliers?.name}</Field></div>
            </div>
          </Card>

          <Card title={s.receiptDetails}>
            <div className="p-5 grid grid-cols-2 gap-x-6 gap-y-5">
              <Field label={s.receivedDate}>{format(new Date(rec.received_date), 'dd.MM.yyyy')}</Field>
              <Field label={s.receivedBy}>{receiverName ? <PersonCell name={receiverName} /> : null}</Field>
              {!isReversal && <div className="col-span-2"><Field label={s.supplierReceiptNo}>{rec.supplier_receipt_no}</Field></div>}
              {isReversal && original && (
                <div className="col-span-2">
                  <Field label={s.cancellationOf}><Link to={`/receipts/${original.id}`} className="font-medium hover:underline">{original.receipt_number}</Link></Field>
                </div>
              )}
              {rec.note && (
                <div className="col-span-2">
                  <Field label={isReversal ? s.reverseReason : hasRejected ? s.rejectedNote : s.note}><span className="whitespace-pre-wrap">{rec.note}</span></Field>
                </div>
              )}
            </div>
          </Card>

          {cancelledBy && (
            <Card title={s.reversedBadge}>
              <div className="p-5 grid grid-cols-2 gap-x-6 gap-y-5">
                <Field label={s.cancelledBy}><Link to={`/receipts/${cancelledBy.id}`} className="font-medium hover:underline">{cancelledBy.receipt_number}</Link></Field>
                <Field label={s.cancelledOn}>{format(new Date(cancelledBy.received_date), 'dd.MM.yyyy')}</Field>
                {cancelledBy.note && <div className="col-span-2"><Field label={s.reverseReason}><span className="whitespace-pre-wrap">{cancelledBy.note}</span></Field></div>}
              </div>
            </Card>
          )}

          {atts.length > 0 && (
            <Card title={s.attachments}>
              <div className="p-5 flex flex-col gap-2">
                {atts.map(a => (
                  <button key={a.id} type="button" onClick={() => openAttachment(a.file_path)}
                    className="flex items-center gap-2.5 px-3 py-2 bg-surface hover:bg-hover rounded-lg text-left transition-colors">
                    <FileText className="w-4 h-4 text-icon shrink-0" strokeWidth={1.75} />
                    <span className="text-sm text-ink font-medium truncate">{a.file_name}</span>
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      <Modal open={reverseOpen} onClose={() => setReverseOpen(false)} title={s.reverseTitle} size="sm" icon={Undo2}>
        <p className="text-sm text-ink2 mb-4">{s.reverseHint}</p>
        <div className="flex flex-col gap-1">
          <label htmlFor="rev-reason" className="text-sm font-medium text-gray-700">{s.reverseReason} *</label>
          <textarea id="rev-reason" rows={3} value={reason} onChange={e => { setReasonErr(''); setReason(e.target.value) }}
            className={`rounded-lg border px-3 py-2 text-sm focus:outline-none resize-none ${reasonErr ? 'border-red-500' : 'border-field hover:border-field-hover focus:border-field-focus'}`} />
          {reasonErr && <p className="text-xs text-red-600">{reasonErr}</p>}
        </div>
        <ModalActions className="justify-end">
          <Button variant="secondary" onClick={() => setReverseOpen(false)}>{t.common.cancel}</Button>
          <Button variant="danger" loading={busy} onClick={reverse}>{s.reverse}</Button>
        </ModalActions>
      </Modal>
    </div>
  )
}
