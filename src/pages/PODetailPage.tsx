import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft, ChevronRight, Pencil, XCircle, CheckCircle, Download, FileText, RotateCcw, PackageCheck, Eye, IdCard, Package, Tag, Hash, Ruler, Coins } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { useLanguage } from '../hooks/useLanguage'
import { toast } from '../components/ui/Toast'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import Button from '../components/ui/Button'
import { usePODownload } from '../hooks/usePODownload'
import { format } from 'date-fns'
import type { PoActivityLog } from '../types/database'
import { localizeCountry } from '../lib/countries'
import GridHead from '../components/ui/GridHead'
import { unitLabel } from '../lib/units'

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
  supplier_id: string; location_id: string; department_id: string | null
  suppliers: { name: string; email: string | null; address_street: string | null; address_city: string | null; address_postal_code: string | null; address_country: string | null; vat_number: string | null }
  locations: { name: string; address_street: string | null; address_city: string | null; address_postal_code: string | null }
  departments: { name: string } | null
}

const STATUS_BADGE: Record<string, string> = {
  draft: 'badge-neutral',
  issued: 'badge-warn',
  sent: 'badge-info',
  closed: 'badge-success',
  cancelled: 'badge-danger',
}

/** A titled box of the page. */
function Card({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`bg-white rounded-lg border border-field ${className}`}>
      <h2 className="px-5 py-3 border-b border-field text-[15px] font-semibold text-ink">{title}</h2>
      {children}
    </section>
  )
}

/** Small grey label above a value. */
function Field({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[12.5px] font-medium text-ink2 mb-1">{label}</p>
      <div className="text-sm text-ink">{children || '-'}</div>
    </div>
  )
}

export default function PODetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { company, profile, isAdmin, hasPerm } = useCompany()
  const { t, lang } = useLanguage()
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
    // spinner only on the first load: later reloads refresh the data in place
    const { data } = await supabase
      .from('purchase_orders')
      .select('*, contracts(id, title, contract_number), suppliers(name,email,address_street,address_city,address_postal_code,address_country,vat_number), locations(name,address_street,address_city,address_postal_code), departments(name)')
      .eq('id', id!)
      .single()
    setPo(data as unknown as POFull)

    if (data?.request_id) {
      const { data: r } = await supabase.from('requests').select('id, request_number').eq('id', data.request_id).single()
      setLinkedReq(r ?? null)
    } else setLinkedReq(null)

    const { data: lineData } = await supabase.from('po_line_items').select('*, items(item_number), categories(name)').eq('po_id', id!).order('position')
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
      <Button variant="secondary" loading={downloading} onClick={() => downloadPO(po.id, po.company_id ?? '')} className="gap-2">
        <Download className="w-4 h-4" />{t.po.downloadPDF}
      </Button>
      {canEdit && (
        <Link to={`/purchase-orders/${po.id}/edit`}>
          <Button variant="secondary" className="gap-2"><Pencil className="w-4 h-4" />{t.common.edit}</Button>
        </Link>
      )}
      {po.status === 'issued' && (
        <Button onClick={() => setConfirmTransition({ label: t.po.markSent, status: 'sent' })} className="gap-2">
          <CheckCircle className="w-4 h-4" />{t.po.markSent}
        </Button>
      )}
      {po.status === 'sent' && (hasPerm('receipts', 'create') || isAdmin) && (
        <Link to={`/receive/${po.id}`}>
          <Button className="gap-2"><PackageCheck className="w-4 h-4" />{t.receipts.receive}</Button>
        </Link>
      )}
      {po.status === 'sent' && po.received_status === 'partial' && (hasPerm('purchase_orders', 'create') || isAdmin) && (
        <Button variant="secondary" onClick={() => setConfirmTransition({ label: t.po.finalize, status: 'closed' })} className="gap-2">
          <CheckCircle className="w-4 h-4" />{t.po.finalize}
        </Button>
      )}
      {canCancel && (
        <Button variant="secondary" onClick={() => setConfirmCancel(true)} className="gap-2 !text-danger !border-line">
          <XCircle className="w-4 h-4" />{t.po.cancelPO}
        </Button>
      )}
      {(po.status === 'closed' || po.status === 'cancelled') && isAdmin && (
        <Button variant="secondary" loading={actionLoading} onClick={reopen} className="gap-2">
          <RotateCcw className="w-4 h-4" />{s.reopen}
        </Button>
      )}
    </>
  )

  const statusBadge = po.status === 'sent' && po.received_status === 'partial'
    ? <span className="badge badge-warn">{t.receipts.rsPartial}</span>
    : po.status === 'closed' && po.received_status !== 'full'
    ? <span className="badge badge-info">{t.po.statusFinalized}</span>
    : <span className={`badge ${STATUS_BADGE[po.status]}`}>{t.status[po.status as keyof typeof t.status] ?? po.status}</span>
  const contract = (po as unknown as { contracts?: { title: string; contract_number: string } | null }).contracts
  const addressOf = (a: { address_street?: string | null; address_postal_code?: string | null; address_city?: string | null; address_country?: string | null } | null | undefined) =>
    [a?.address_street, [a?.address_postal_code, a?.address_city].filter(Boolean).join(' '), a?.address_country ? localizeCountry(a.address_country, lang) : null].filter(Boolean)

  return (
    <div className="p-4 lg:p-6">
      <nav className="flex items-center gap-2 text-sm text-ink2 mb-5">
        <button type="button" onClick={() => navigate('/purchase-orders')} aria-label={t.nav.purchaseOrders} title={t.nav.purchaseOrders}
          className="w-7 h-7 -ml-1.5 mr-1 inline-flex items-center justify-center rounded-lg text-icon hover:bg-selected hover:text-ink transition-colors">
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
        </button>
        <Link to="/purchase-orders" className="hover:text-ink transition-colors">{t.nav.purchaseOrders}</Link>
        <ChevronRight className="w-3.5 h-3.5 text-icon" />
        <span className="text-ink font-medium">{po.po_number}</span>
      </nav>

      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-semibold text-ink tracking-tight">{po.po_number}</h1>
            {statusBadge}
          </div>
          <p className="mt-2 text-sm text-ink2">{po.suppliers?.name} · {format(new Date(po.created_at), 'dd.MM.yyyy')}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">{actionButtons}</div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        {/* left: what is ordered */}
        <div className="xl:col-span-2 flex flex-col gap-4">
          <Card title={s.lineItems} className="overflow-hidden">
            <div className="overflow-x-auto"><table className="table-grid w-full text-sm min-w-[760px]">
              <GridHead cols={[[t.po.itemCode, IdCard], [t.po.description, Package], [s.category, Tag], [t.po.qty, Hash, 'right'], [t.po.unit, Ruler], [t.po.unitPrice, Coins, 'right'], [t.po.amount, Coins, 'right']]} />
              <tbody className="divide-y divide-field">
                {lines.map(line => (
                  <tr key={line.id}>
                    <td className="px-4 py-3 text-ink2 whitespace-nowrap">{(line as any).items?.item_number ?? '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-baseline gap-2 min-w-0">
                        <span className="font-medium text-ink whitespace-nowrap">{line.name}</span>
                        {line.long_description && <span className="text-xs text-gray-400 truncate max-w-[220px]">{line.long_description}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink2">{(line as any).categories?.name ?? '-'}</td>
                    <td className="px-4 py-3 text-right text-ink2 tabular-nums">{line.quantity}</td>
                    <td className="px-4 py-3 text-ink2">{unitLabel(line.unit, lang) || '-'}</td>
                    <td className="px-4 py-3 text-right text-ink2 tabular-nums">{fmt(line.unit_price)}</td>
                    <td className="px-4 py-3 text-right text-ink tabular-nums">{fmt(line.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            <div className="flex justify-end px-5 py-4 border-t border-field">
              <div className="w-72 flex flex-col gap-1.5 text-sm">
                {(po.discount_amount ?? 0) > 0 && (
                  <>
                    <div className="flex justify-between"><span className="text-ink2">{s.subtotal}</span><span className="tabular-nums text-ink2">{fmt(po.total_amount + (po.discount_amount ?? 0))}</span></div>
                    <div className="flex justify-between"><span className="text-ink2">{s.discount}</span><span className="tabular-nums">-{fmt(po.discount_amount ?? 0)}</span></div>
                  </>
                )}
                <div className="flex justify-between items-baseline pt-2 border-t border-field"><span className="font-medium text-ink2">{s.totalExVat}</span><span className="text-lg font-semibold text-ink tabular-nums">{fmt(po.total_amount)}</span></div>
              </div>
            </div>
          </Card>

          {attachments.length > 0 && (
            <Card title={t.po.attachQuotation}>
              <ul className="divide-y divide-field">
                {attachments.map(att => (
                  <li key={att.id}>
                    <button type="button" onClick={() => openAttachment(att.file_path)} className="w-full flex items-center gap-2.5 px-5 py-2.5 text-left hover:bg-surface transition-colors">
                      <FileText className="w-4 h-4 text-icon shrink-0" strokeWidth={1.75} />
                      <span className="text-sm font-medium text-ink flex-1 truncate">{att.file_name}</span>
                      <Eye className="w-4 h-4 text-icon shrink-0" strokeWidth={1.75} />
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {activity.length > 0 && (
            <Card title={s.auditTrail}>
              <ol className="flex flex-col gap-4 p-5">
                {activity.map((a, i) => {
                  const dot = a.action === 'cancelled' ? 'bg-danger' : a.action === 'closed' ? 'bg-success' : a.action === 'sent' ? 'bg-primary' : a.action === 'issued' ? 'bg-warn' : 'bg-icon'
                  return (
                    <li key={a.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span className={`w-2.5 h-2.5 rounded-full ${dot} mt-1.5`} />
                        {i < activity.length - 1 && <span className="flex-1 w-px bg-line mt-1" />}
                      </div>
                      <div className="flex-1 -mt-0.5">
                        <p className="text-sm text-ink"><span className="font-medium">{a.actor_id ? actNames[a.actor_id] ?? '-' : '-'}</span> {s.act[a.action]}</p>
                        <p className="text-xs text-ink2">{format(new Date(a.created_at), 'dd.MM.yyyy HH:mm')}</p>
                      </div>
                    </li>
                  )
                })}
              </ol>
            </Card>
          )}
        </div>

        {/* right: with whom, where to, on what terms */}
        <div className="flex flex-col gap-4 order-first xl:order-none">
          <Card title={s.supplier}>
            <div className="p-5 text-sm">
              <p className="font-medium text-ink">{po.suppliers?.name}</p>
              <div className="mt-1.5 flex flex-col gap-0.5 text-ink2">
                {po.suppliers?.vat_number && <p>{t.suppliers.vatNumber}: {po.suppliers.vat_number}</p>}
                {po.suppliers?.email && <p>{po.suppliers.email}</p>}
                {addressOf(po.suppliers).map(l => <p key={l}>{l}</p>)}
              </div>
            </div>
          </Card>

          <Card title={s.location}>
            <div className="p-5 text-sm">
              <p className="font-medium text-ink">{po.locations?.name}</p>
              <div className="mt-1.5 flex flex-col gap-0.5 text-ink2">
                {addressOf(po.locations).map(l => <p key={l}>{l}</p>)}
              </div>
              <div className="mt-4"><Field label={s.desiredDelivery}>{po.expected_delivery_date ? format(new Date(po.expected_delivery_date), 'dd.MM.yyyy') : null}</Field></div>
            </div>
          </Card>

          <Card title={s.orderDetails}>
            <div className="p-5 grid grid-cols-2 gap-x-6 gap-y-5">
              <Field label={s.department}>{po.departments?.name}</Field>
              <Field label={s.incoterm}>{po.incoterm}</Field>
              <div className="col-span-2"><Field label={s.paymentTermsLabel}>{po.payment_terms}</Field></div>
              {contract && <div className="col-span-2"><Field label={t.contracts.linkedContract}>{contract.contract_number} · {contract.title}</Field></div>}
              {po.supplier_quote_ref && <div className="col-span-2"><Field label={s.quoteRef}>{po.supplier_quote_ref}</Field></div>}
              {linkedReq && (
                <div className="col-span-2">
                  <Field label={t.requests.fromRequest}><Link to={`/requests/${linkedReq.id}`} className="hover:underline">{linkedReq.request_number}</Link></Field>
                </div>
              )}
              {po.notes && <div className="col-span-2"><Field label={s.notes}><span className="whitespace-pre-wrap">{po.notes}</span></Field></div>}
            </div>
          </Card>

          {receipts.length > 0 && (
            <Card title={t.receipts.title}>
              <ul className="divide-y divide-field">
                {receipts.map(r => (
                  <li key={r.id}>
                    <Link to={`/receipts/${r.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm hover:bg-surface transition-colors">
                      <span className="inline-flex items-center gap-2 font-medium text-ink"><PackageCheck className="w-4 h-4 text-icon" strokeWidth={1.75} />{r.receipt_number}</span>
                      <span className="text-xs text-ink2">{format(new Date(r.received_date), 'dd.MM.yyyy')}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <ConfirmDialog open={!!confirmTransition} onClose={() => setConfirmTransition(null)}
        onConfirm={() => confirmTransition && transition(confirmTransition.status)}
        title={t.po.statusChangeTitle} message={t.po.statusChangeQuestion.replace('{status}', confirmTransition?.label ?? '')} name={po.po_number}
        loading={actionLoading} confirmLabel={confirmTransition?.label ?? t.common.save} />
      <ConfirmDialog open={confirmCancel} onClose={() => setConfirmCancel(false)} onConfirm={() => transition('cancelled')}
        title={t.po.cancelTitle} message={t.po.cancelQuestion} name={po.po_number} danger loading={actionLoading} confirmLabel={t.po.cancelPO} />
    </div>
  )
}
