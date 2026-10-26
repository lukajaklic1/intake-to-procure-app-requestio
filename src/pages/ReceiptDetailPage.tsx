import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ChevronLeft, FileText } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../hooks/useLanguage'
import { toast } from '../components/ui/Toast'
import { format } from 'date-fns'

interface Full {
  id: string; receipt_number: string; received_date: string; received_by: string
  supplier_receipt_no: string | null; note: string | null; po_id: string
  purchase_orders: { po_number: string; suppliers: { name: string } | null } | null
}
interface RLine { id: string; quantity_received: number; quantity_rejected: number; po_line_items: { name: string; unit: string } | null }

function Field({ label, value }: { label: string; value?: string | null }) {
  return <div><p className="text-xs text-gray-400 mb-0.5">{label}</p><p className="text-sm text-gray-800 font-medium">{value || '—'}</p></div>
}

export default function ReceiptDetailPage() {
  const { id } = useParams()
  const { t } = useLanguage()
  const s = t.receipts
  const navigate = useNavigate()
  const [rec, setRec] = useState<Full | null>(null)
  const [lines, setLines] = useState<RLine[]>([])
  const [atts, setAtts] = useState<{ id: string; file_name: string; file_path: string }[]>([])
  const [receiverName, setReceiverName] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [id])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('receipts')
      .select('id, receipt_number, received_date, received_by, supplier_receipt_no, note, po_id, purchase_orders(po_number, suppliers(name))')
      .eq('id', id!).single()
    if (!data) { toast.error(t.common.notFound); navigate('/receipts'); return }
    setRec(data as unknown as Full)
    const { data: ls } = await supabase.from('receipt_line_items').select('id, quantity_received, quantity_rejected, po_line_items(name, unit)').eq('receipt_id', id!)
    setLines((ls as unknown as RLine[]) ?? [])
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

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto">
      <button onClick={() => navigate('/receipts')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4"><ChevronLeft className="w-4 h-4" />{s.title}</button>
      <h1 className="text-2xl font-bold text-gray-900 mb-5">{rec.receipt_number}</h1>

      <div className="bg-white rounded-lg border border-field p-6 mb-5 grid grid-cols-2 sm:grid-cols-3 gap-5">
        <div>
          <p className="text-xs text-gray-400 mb-0.5">{s.fromPo}</p>
          <Link to={`/purchase-orders/${rec.po_id}`} className="text-sm font-medium text-gray-400 hover:text-gray-600">{rec.purchase_orders?.po_number ?? '—'}</Link>
        </div>
        <Field label={t.po.supplier} value={rec.purchase_orders?.suppliers?.name} />
        <Field label={s.receivedDate} value={format(new Date(rec.received_date), 'dd.MM.yyyy')} />
        <Field label={s.receivedBy} value={receiverName} />
        <Field label={s.supplierReceiptNo} value={rec.supplier_receipt_no} />
        {rec.note && <div className="col-span-2 sm:col-span-3"><Field label={s.note} value={rec.note} /></div>}
      </div>

      {atts.length > 0 && (
        <div className="bg-white rounded-lg border border-field p-5 mb-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{s.attachSlip}</p>
          <div className="flex flex-col gap-2">
            {atts.map(a => (
              <button key={a.id} type="button" onClick={() => openAttachment(a.file_path)} className="flex items-center gap-2 p-2.5 bg-accent-light border border-accent-border rounded-lg text-sm text-accent font-medium hover:bg-accent-light text-left">
                <FileText className="w-4 h-4 shrink-0" /><span className="truncate">{a.file_name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-field overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="bg-surface border-b border-field"><tr>
            <th className="text-left px-4 py-2.5 text-sm font-medium text-ink2">{t.po.description}</th>
            <th className="text-right px-4 py-2.5 text-sm font-medium text-ink2">{s.received}</th>
            <th className="text-right px-4 py-2.5 text-sm font-medium text-ink2">{s.rejected}</th>
          </tr></thead>
          <tbody className="divide-y divide-field">
            {lines.map(l => (
              <tr key={l.id}>
                <td className="px-4 py-2.5 text-gray-800">{l.po_line_items?.name ?? '—'}<span className="text-gray-400"> · {l.po_line_items?.unit}</span></td>
                <td className="px-4 py-2.5 text-right font-medium text-gray-800">{l.quantity_received}</td>
                <td className="px-4 py-2.5 text-right text-red-600">{l.quantity_rejected > 0 ? l.quantity_rejected : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div>
  )
}
