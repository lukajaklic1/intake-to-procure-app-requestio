import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft, ChevronRight, FileText, Package, Hash, Check, PackageX, PackageCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../hooks/useLanguage'
import { toast } from '../components/ui/Toast'
import GridHead from '../components/ui/GridHead'
import PersonCell from '../components/ui/PersonCell'
import { Card, Field } from '../components/ui/DetailCard'
import { unitLabel } from '../lib/units'
import { format } from 'date-fns'

interface Full {
  id: string; receipt_number: string; received_date: string; received_by: string; created_at: string
  supplier_receipt_no: string | null; note: string | null; po_id: string
  purchase_orders: { po_number: string; received_status: 'none' | 'partial' | 'full'; status: string; suppliers: { name: string } | null; locations: { name: string } | null } | null
}
interface RLine {
  id: string; po_line_id: string; quantity_received: number; quantity_rejected: number
  po_line_items: { name: string; unit: string; quantity: number } | null
}

export default function ReceiptDetailPage() {
  const { id } = useParams()
  const { t, lang } = useLanguage()
  const s = t.receipts
  const navigate = useNavigate()
  const [rec, setRec] = useState<Full | null>(null)
  const [lines, setLines] = useState<RLine[]>([])
  const [totals, setTotals] = useState<Record<string, number>>({})   // received on each order line over all receipts
  const [atts, setAtts] = useState<{ id: string; file_name: string; file_path: string }[]>([])
  const [receiverName, setReceiverName] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [id])

  async function load() {
    // spinner only on the first load: later reloads refresh the data in place
    const { data } = await supabase.from('receipts')
      .select('id, receipt_number, received_date, created_at, received_by, supplier_receipt_no, note, po_id, purchase_orders(po_number, received_status, status, suppliers(name), locations(name))')
      .eq('id', id!).single()
    if (!data) { toast.error(t.common.notFound); navigate('/receipts'); return }
    setRec(data as unknown as Full)
    const { data: ls } = await supabase.from('receipt_line_items').select('id, po_line_id, quantity_received, quantity_rejected, po_line_items(name, unit, quantity)').eq('receipt_id', id!)
    const rl = (ls as unknown as RLine[]) ?? []
    setLines(rl)
    if (rl.length) {
      const { data: all } = await supabase.from('receipt_line_items').select('po_line_id, quantity_received').in('po_line_id', rl.map(l => l.po_line_id))
      const m: Record<string, number> = {}
      for (const r of all ?? []) m[r.po_line_id] = (m[r.po_line_id] ?? 0) + Number(r.quantity_received)
      setTotals(m)
    }
    const { data: a } = await supabase.from('receipt_attachments').select('id, file_name, file_path').eq('receipt_id', id!)
    setAtts(a ?? [])
    const { data: u } = await supabase.from('users').select('first_name, last_name').eq('id', (data as any).received_by).single()
    if (u) setReceiverName(`${u.first_name} ${u.last_name}`)
    setLoading(false)
  }

  async function openAttachment(path: string) {
    const { data } = await supabase.storage.from('quotations').createSignedUrl(path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  if (loading || !rec) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>

  const po = rec.purchase_orders
  const hasRejected = lines.some(l => Number(l.quantity_rejected) > 0)
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

      <div className="mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-semibold text-ink tracking-tight">{rec.receipt_number}</h1>
          {poBadge}
        </div>
        <p className="mt-2 text-sm text-ink2">{po?.suppliers?.name} · {format(new Date(rec.received_date), 'dd.MM.yyyy')}</p>
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
                  return (
                    <tr key={l.id}>
                      <td className="px-4 py-3 text-ink">
                        <span className="font-medium">{l.po_line_items?.name ?? '-'}</span>
                        <span className="text-ink2"> · {unitLabel(l.po_line_items?.unit ?? '', lang) || l.po_line_items?.unit}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-ink2 tabular-nums">{ordered}</td>
                      <td className="px-4 py-3 text-right text-ink font-medium tabular-nums">{l.quantity_received}</td>
                      <td className={`px-4 py-3 text-right tabular-nums ${Number(l.quantity_rejected) > 0 ? 'text-danger font-medium' : 'text-ink2'}`}>{Number(l.quantity_rejected) > 0 ? l.quantity_rejected : '-'}</td>
                      <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                        <span className={total >= ordered ? 'text-success font-medium' : 'text-ink2'}>{total} / {ordered}</span>
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
              <div className="col-span-2"><Field label={s.supplierReceiptNo}>{rec.supplier_receipt_no}</Field></div>
              {rec.note && (
                <div className="col-span-2">
                  <Field label={hasRejected ? s.rejectedNote : s.note}><span className="whitespace-pre-wrap">{rec.note}</span></Field>
                </div>
              )}
            </div>
          </Card>

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
    </div>
  )
}
