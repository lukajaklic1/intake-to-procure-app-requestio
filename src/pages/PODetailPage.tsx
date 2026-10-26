import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ChevronLeft, Pencil, XCircle, CheckCircle, Download, FileText, RotateCcw, PackageCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { useLanguage } from '../hooks/useLanguage'
import { toast } from '../components/ui/Toast'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import Button from '../components/ui/Button'
import { usePODownload } from '../hooks/usePODownload'
import { format } from 'date-fns'
import type { PoActivityLog } from '../types/database'

interface LineItem {
  id: string; position: number; name: string; long_description: string | null
  quantity: number; unit: string; unit_price: number; line_total: number; item_id: string | null; item_number?: string | null
}

interface POFull {
  id: string; po_number: string; status: string; total_amount: number
  company_id: string; created_at: string; updated_at: string
  payment_terms: string; expected_delivery_date: string | null
  incoterm: string | null; supplier_quote_ref: string | null
  notes: string | null
  discount_amount: number
  request_id: string | null
  version: number
  change_note: string | null
  prev_status: string | null
  received_status: 'none' | 'partial' | 'full'
  supplier_id: string; category_id: string; location_id: string; department_id: string | null
  suppliers: { name: string; email: string | null; address_street: string | null; address_city: string | null; address_postal_code: string | null; address_country: string | null; vat_number: string | null }
  categories: { name: string }
  locations: { name: string; address_street: string | null; address_city: string | null; address_postal_code: string | null }
  departments: { name: string } | null
}

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-selected text-ink2',
  issued: 'bg-warn-light text-warn',
  sent: 'bg-accent-light text-accent-hover',
  closed: 'bg-success-light text-success',
  cancelled: 'bg-danger-light text-danger',
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm text-gray-800 font-medium">{value || '—'}</p>
    </div>
  )
}

export default function PODetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { company, profile, isAdmin, hasPerm } = useCompany()
  const { t } = useLanguage()
  const s = t.po
  const [po, setPo] = useState<POFull | null>(null)
  const [lines, setLines] = useState<LineItem[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const { downloadPO, downloading } = usePODownload()
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [confirmTransition, setConfirmTransition] = useState<{ label: string; status: string } | null>(null)
  const [attachments, setAttachments] = useState<{ id: string; file_name: string; file_path: string }[]>([])
  const [linkedReq, setLinkedReq] = useState<{ id: string; request_number: string } | null>(null)
  const [activity, setActivity] = useState<PoActivityLog[]>([])
  const [actNames, setActNames] = useState<Record<string, string>>({})
  const [receipts, setReceipts] = useState<{ id: string; receipt_number: string; received_date: string }[]>([])

  async function openAttachment(path: string) {
    const { data } = await supabase.storage.from('quotations').createSignedUrl(path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  useEffect(() => { if (id) load() }, [id])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('purchase_orders')
      .select('*, suppliers(name,email,address_street,address_city,address_postal_code,address_country,vat_number), categories(name), locations(name,address_street,address_city,address_postal_code), departments(name)')
      .eq('id', id!)
      .single()
    setPo(data as unknown as POFull)

    if (data?.request_id) {
      const { data: r } = await supabase.from('requests').select('id, request_number').eq('id', data.request_id).single()
      setLinkedReq(r ?? null)
    } else setLinkedReq(null)

    const { data: lineData } = await supabase.from('po_line_items').select('*, items(item_number)').eq('po_id', id!).order('position')
    setLines(lineData ?? [])

    const { data: atts } = await supabase.from('po_attachments').select('id, file_name, file_path').eq('po_id', id!)
    setAttachments(atts ?? [])

    const { data: recs } = await supabase.from('receipts').select('id, receipt_number, received_date').eq('po_id', id!).order('received_date', { ascending: false })
    setReceipts(recs ?? [])

    const { data: acts } = await supabase.from('po_activity_log').select('*').eq('po_id', id!).order('created_at', { ascending: true })
    const aList = (acts as PoActivityLog[]) ?? []
    setActivity(aList)
    const aIds = [...new Set(aList.map(a => a.actor_id).filter(Boolean) as string[])]
    if (aIds.length) {
      const { data: us } = await supabase.from('users').select('id, first_name, last_name').in('id', aIds)
      const m: Record<string, string> = {}
      for (const u of us ?? []) m[u.id] = `${u.first_name} ${u.last_name}`
      setActNames(m)
    }

    setLoading(false)
  }

  async function transition(newStatus: string) {
    if (!po) return
    setActionLoading(true)
    // Remember where to return to when reopening
    const patch: Record<string, unknown> = { status: newStatus, updated_at: new Date().toISOString() }
    if (newStatus === 'cancelled' || newStatus === 'closed') patch.prev_status = po.status
    const { error } = await supabase.from('purchase_orders').update(patch).eq('id', po.id)
    if (!error && profile) {
      await supabase.from('po_activity_log').insert({ company_id: po.company_id, po_id: po.id, actor_id: profile.id, action: newStatus })
    }
    setActionLoading(false); setConfirmTransition(null); setConfirmCancel(false)
    if (error) { toast.error(error.message); return }
    toast.success(t.common.updated)
    load()
  }

  async function reopen() {
    if (!po || !profile) return
    // Return to the exact status it had before being cancelled/closed
    const target = po.prev_status ?? 'draft'
    setActionLoading(true)
    const { error } = await supabase.from('purchase_orders').update({ status: target, prev_status: null, updated_at: new Date().toISOString() }).eq('id', po.id)
    if (!error) await supabase.from('po_activity_log').insert({ company_id: po.company_id, po_id: po.id, actor_id: profile.id, action: 'reopened' })
    setActionLoading(false)
    if (error) { toast.error(error.message); return }
    toast.success(t.common.updated); load()
  }

  function fmt(n: number) {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: company?.currency ?? 'EUR' }).format(n)
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>
  if (!po) return <div className="p-6 text-gray-500">{t.po.title} ni najdeno</div>

  const canEdit = ['draft', 'issued', 'sent'].includes(po.status)
  const canCancel = ['issued', 'sent'].includes(po.status) && po.received_status === 'none'

  // Action buttons — shared between desktop and mobile
  const actionButtons = (
    <>
      <Button variant="secondary" loading={downloading} onClick={() => downloadPO(po.id, po.company_id ?? '')}>
        <Download className="w-4 h-4 mr-1.5" />{t.po.downloadPDF}
      </Button>
      {canEdit && (
        <Link to={`/purchase-orders/${po.id}/edit`}>
          <Button variant="secondary"><Pencil className="w-4 h-4 mr-1.5" />{t.common.edit}</Button>
        </Link>
      )}
      {po.status === 'issued' && (
        <Button onClick={() => setConfirmTransition({ label: t.po.markSent, status: 'sent' })}>
          <CheckCircle className="w-4 h-4 mr-1.5" />{t.po.markSent}
        </Button>
      )}
      {po.status === 'sent' && (hasPerm('receipts', 'create') || isAdmin) && (
        <Link to={`/receive/${po.id}`}>
          <Button><PackageCheck className="w-4 h-4 mr-1.5" />{t.receipts.receive}</Button>
        </Link>
      )}
      {po.status === 'sent' && po.received_status === 'partial' && (hasPerm('purchase_orders', 'create') || isAdmin) && (
        <Button variant="secondary" onClick={() => setConfirmTransition({ label: t.po.finalize, status: 'closed' })}>
          <CheckCircle className="w-4 h-4 mr-1.5" />{t.po.finalize}
        </Button>
      )}
      {canCancel && (
        <Button variant="danger" onClick={() => setConfirmCancel(true)}>
          <XCircle className="w-4 h-4 mr-1.5" />{t.po.cancelPO}
        </Button>
      )}
      {(po.status === 'closed' || po.status === 'cancelled') && isAdmin && (
        <Button variant="secondary" loading={actionLoading} onClick={reopen}>
          <RotateCcw className="w-4 h-4 mr-1.5" />{s.reopen}
        </Button>
      )}
    </>
  )

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto">
      {/* Top bar */}
      <div className="mb-5">
        {/* Row 1: back + PO number + status + desktop buttons */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/purchase-orders')} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-surface rounded-lg transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold text-gray-900 ">{po.po_number}</h1>
                {po.status === 'sent' && po.received_status === 'partial'
                  ? <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-warn-light text-warn">{t.receipts.rsPartial}</span>
                  : po.status === 'closed' && po.received_status !== 'full'
                  ? <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-accent-light text-accent-hover">{t.po.statusFinalized}</span>
                  : <span className={`px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${STATUS_BADGE[po.status]}`}>{t.status[po.status as keyof typeof t.status] ?? po.status}</span>}
              </div>
              <p className="text-xs text-gray-400 mt-0.5">{t.common.created}: {format(new Date(po.created_at), 'dd.MM.yyyy')}</p>
            </div>
          </div>
          {/* Desktop buttons */}
          <div className="hidden lg:flex items-center gap-2 flex-wrap">
            {actionButtons}
          </div>
        </div>

        {/* Mobile buttons — below header, 2-col grid */}
        <div className="lg:hidden mt-3 grid grid-cols-2 gap-2">
          {actionButtons}
        </div>
      </div>

      {linkedReq && (
        <button onClick={() => navigate(`/requests/${linkedReq.id}`)}
          className="w-full flex items-center gap-3 p-4 mb-5 bg-accent-light border border-accent-border rounded-lg text-left hover:bg-accent-light transition-colors">
          <FileText className="w-5 h-5 text-accent shrink-0" />
          <div className="flex-1">
            <p className="text-xs text-accent">{t.requests.fromRequest}</p>
            <p className="text-sm font-semibold text-accent-hover ">{linkedReq.request_number}</p>
          </div>
        </button>
      )}

      {/* Details grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        {/* Supplier */}
        <div className="bg-white rounded-lg border border-field p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">DOBAVITELJ</p>
          <p className="font-semibold text-gray-900 mb-1">{po.suppliers?.name}</p>
          {po.suppliers?.vat_number && <p className="text-xs text-gray-500">VAT: {po.suppliers.vat_number}</p>}
          {po.suppliers?.email && <p className="text-xs text-gray-500">{po.suppliers.email}</p>}
          {po.suppliers?.address_street && <p className="text-xs text-gray-500">{po.suppliers.address_street}</p>}
          {(po.suppliers?.address_postal_code || po.suppliers?.address_city) && (
            <p className="text-xs text-gray-500">{[po.suppliers.address_postal_code, po.suppliers.address_city].filter(Boolean).join(' ')}</p>
          )}
          {po.suppliers?.address_country && <p className="text-xs text-gray-500">{po.suppliers.address_country}</p>}
        </div>

        {/* Delivery */}
        <div className="bg-white rounded-lg border border-field p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">LOKACIJA IN DATUM DOBAVE</p>
          <p className="font-semibold text-gray-900 mb-1">{po.locations?.name}</p>
          {po.locations?.address_street && <p className="text-xs text-gray-500">{po.locations.address_street}</p>}
          {(po.locations?.address_postal_code || po.locations?.address_city) && (
            <p className="text-xs text-gray-500">{[po.locations.address_postal_code, po.locations.address_city].filter(Boolean).join(' ')}</p>
          )}
          {po.expected_delivery_date && (
            <p className="text-xs text-gray-500 mt-2">{s.desiredDelivery}: <span className="font-medium">{format(new Date(po.expected_delivery_date), 'dd.MM.yyyy')}</span></p>
          )}
        </div>

        {/* Order info */}
        <div className="bg-white rounded-lg border border-field p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{s.orderDetails}</p>
          <div className="flex flex-col gap-2">
            <Field label={s.category} value={po.categories?.name} />
            {po.departments && <Field label={s.department} value={po.departments.name} />}
            <Field label={t.po.paymentTermsLabel} value={po.payment_terms} />
            {po.incoterm && <Field label={t.po.incoterm} value={po.incoterm} />}
            {po.supplier_quote_ref && <Field label={t.po.quoteRef} value={po.supplier_quote_ref} />}
          </div>
        </div>
      </div>

      {/* Line items */}
      <div className="bg-white rounded-lg border border-field overflow-hidden mb-5">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">{s.lineItems}</h2>
        </div>
        <div className="overflow-x-auto"><table className="w-full text-sm min-w-[500px]">
          <thead className="bg-surface border-b border-field">
            <tr>
              <th className="text-left px-5 py-2.5 text-xs font-medium text-gray-500 w-12">{t.po.position}</th>
              <th className="text-left px-5 py-2.5 text-xs font-medium text-gray-500 w-24">{t.po.itemCode}</th>
              <th className="text-left px-5 py-2.5 text-xs font-medium text-gray-500">{t.po.description}</th>
              <th className="text-right px-5 py-2.5 text-xs font-medium text-gray-500 w-24">{t.po.qty}</th>
              <th className="text-left px-5 py-2.5 text-xs font-medium text-gray-500 w-20">{t.po.unit}</th>
              <th className="text-right px-5 py-2.5 text-xs font-medium text-gray-500 w-28">{t.po.unitPrice}</th>
              <th className="text-right px-5 py-2.5 text-xs font-medium text-gray-500 w-28">{t.po.amount}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-field">
            {lines.map(line => (
              <tr key={line.id}>
                <td className="px-5 py-3 text-gray-400 text-xs">{line.position}</td>
                <td className="px-5 py-3 text-gray-400 text-xs">{(line as any).items?.item_number ?? '—'}</td>
                <td className="px-5 py-3">
                  <p className="font-medium text-gray-900">{line.name}</p>
                  {line.long_description && <p className="text-xs text-gray-400 mt-0.5">{line.long_description}</p>}
                </td>
                <td className="px-5 py-3 text-right text-gray-700">{line.quantity}</td>
                <td className="px-5 py-3 text-gray-500">{line.unit}</td>
                <td className="px-5 py-3 text-right text-gray-700">{fmt(line.unit_price)}</td>
                <td className="px-5 py-3 text-right font-medium text-gray-900">{fmt(line.line_total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-field bg-surface">
            {(po.discount_amount ?? 0) > 0 && (
              <tr>
                <td colSpan={6} className="px-5 pt-3 pb-1 text-right text-sm text-gray-500">Vmesni znesek</td>
                <td className="px-5 pt-3 pb-1 text-right text-sm text-gray-700">{fmt((po.total_amount) + (po.discount_amount ?? 0))}</td>
              </tr>
            )}
            {(po.discount_amount ?? 0) > 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-1 text-right text-sm text-gray-500">Popust</td>
                <td className="px-5 py-1 text-right text-sm font-semibold text-accent">- {fmt(po.discount_amount ?? 0)}</td>
              </tr>
            )}
            <tr className="border-t-2 border-field">
              <td colSpan={6} className="px-5 py-3 text-right text-sm font-bold text-gray-900">Skupaj (brez DDV)</td>
              <td className="px-5 py-3 text-right text-base font-bold text-accent-hover">{fmt(po.total_amount)}</td>
            </tr>
          </tfoot>
        </table></div>
      </div>

      {/* Notes */}
      {po.notes && (
        <div className="bg-white rounded-lg border border-field p-5 mb-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{s.notes}</p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{po.notes}</p>
        </div>
      )}

      {/* Attachments */}
      {attachments.length > 0 && (
        <div className="bg-white rounded-lg border border-field p-5 mb-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t.po.attachQuotation}</p>
          <div className="flex flex-col gap-2">
            {attachments.map(att => (
              <button key={att.id} type="button" onClick={() => openAttachment(att.file_path)}
                className="flex items-center gap-2.5 px-3 py-2.5 bg-accent-light border border-accent-border rounded-lg text-sm text-accent font-medium hover:bg-accent-light transition-colors text-left w-full">
                <FileText className="w-4 h-4 shrink-0" />
                <span className="truncate">{att.file_name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Receipts */}
      {receipts.length > 0 && (
        <div className="bg-white rounded-lg border border-field p-5 mb-5">
          <p className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5"><PackageCheck className="w-4 h-4" />{t.receipts.title}</p>
          <div className="flex flex-col gap-2">
            {receipts.map(r => (
              <Link key={r.id} to={`/receipts/${r.id}`} className="flex items-center justify-between text-sm border border-gray-100 rounded-lg px-3 py-2 hover:bg-surface">
                <span className=" font-semibold text-accent">{r.receipt_number}</span>
                <span className="text-gray-400 text-xs">{format(new Date(r.received_date), 'dd.MM.yyyy')}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Audit trail */}
      {activity.length > 0 && (
        <div className="bg-white rounded-lg border border-field p-5 mb-5">
          <p className="text-sm font-semibold text-gray-900 mb-4">{s.auditTrail}</p>
          <ol className="flex flex-col gap-4">
            {activity.map(a => {
              const dot = a.action === 'cancelled' ? 'bg-red-500' : a.action === 'closed' ? 'bg-green-500' : a.action === 'sent' ? 'bg-accent' : a.action === 'issued' ? 'bg-amber-500' : 'bg-gray-400'
              return (
                <li key={a.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className={`w-2.5 h-2.5 rounded-full ${dot} mt-1.5`} />
                    <span className="flex-1 w-px bg-gray-100 mt-1" />
                  </div>
                  <div className="flex-1 -mt-0.5">
                    <p className="text-sm text-gray-800"><span className="font-medium">{a.actor_id ? actNames[a.actor_id] ?? '—' : '—'}</span> {s.act[a.action]}</p>
                    <p className="text-xs text-gray-400">{format(new Date(a.created_at), 'dd.MM.yyyy HH:mm')}</p>
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmTransition} onClose={() => setConfirmTransition(null)}
        onConfirm={() => confirmTransition && transition(confirmTransition.status)}
        title={confirmTransition?.label ?? ''} loading={actionLoading}
        message={`${t.po.confirmStatusChange} ${po.po_number} → ${confirmTransition?.label ?? ''}?`}
        confirmLabel={confirmTransition?.label ?? t.common.save}
      />
      <ConfirmDialog
        open={confirmCancel} onClose={() => setConfirmCancel(false)}
        onConfirm={() => transition('cancelled')}
        title={t.po.cancelPO} loading={actionLoading} danger
        message={`${t.po.cancelConfirmMessage} ${po.po_number}? ${t.po.cancelConfirmNote}`}
        confirmLabel={t.po.cancelPO}
      />
    </div>
  )
}
