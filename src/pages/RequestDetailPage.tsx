import { useEffect, useState, Fragment } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Pencil, XCircle, Check, X, FileText, ShoppingCart } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { refreshCounts } from '../lib/refreshCounts'
import { useCompany } from '../hooks/useCompany'
import { useLanguage } from '../hooks/useLanguage'
import { toast } from '../components/ui/Toast'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { format } from 'date-fns'
import type { Request, RequestLineItem, RequestStatus, Approval, ActivityLog } from '../types/database'

const STATUS_BADGE: Record<string, string> = {
  draft: 'badge-neutral',
  pending: 'badge-warn',
  approved: 'badge-success',
  rejected: 'badge-danger',
  cancelled: 'badge-neutral',
  completed: 'badge-info',
}

type ReqFull = Request & {
  suppliers: { name: string } | null
  locations: { name: string } | null
  departments: { name: string } | null
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return <div><p className="text-xs text-gray-400 mb-0.5">{label}</p><p className="text-sm text-gray-800 font-medium">{value || '—'}</p></div>
}

export default function RequestDetailPage() {
  const { id } = useParams()
  const { company, profile, isAdmin, hasPerm } = useCompany()
  const { t } = useLanguage()
  const s = t.requests
  const navigate = useNavigate()

  const [req, setReq] = useState<ReqFull | null>(null)
  const [lines, setLines] = useState<(RequestLineItem & { categories?: { name: string } | null })[]>([])
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [activity, setActivity] = useState<ActivityLog[]>([])
  const [linkedPo, setLinkedPo] = useState<{ id: string; po_number: string; status: string; total_amount: number; created_at: string } | null>(null)
  const [attachments, setAttachments] = useState<{ id: string; file_name: string; file_path: string }[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [decision, setDecision] = useState<null | 'approve' | 'reject'>(null)
  const [note, setNote] = useState('')

  useEffect(() => { if (company) load() }, [company, id])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('requests')
      .select('*, suppliers(name), locations(name), departments(name)')
      .eq('id', id!).single()
    if (!data) { toast.error(t.common.notFound); navigate('/requests'); return }
    setReq(data as unknown as ReqFull)
    if (data.po_id) {
      const { data: po } = await supabase.from('purchase_orders').select('id, po_number, status, total_amount, created_at').eq('id', data.po_id).single()
      setLinkedPo(po ?? null)
    } else setLinkedPo(null)
    const { data: ls } = await supabase.from('request_line_items').select('*, categories(name)').eq('request_id', id!).order('position')
    setLines((ls as any[]) ?? [])
    const { data: aps } = await supabase.from('approvals').select('*').eq('request_id', id!).order('step')
    const apList = (aps as Approval[]) ?? []
    setApprovals(apList)
    const { data: atts } = await supabase.from('request_attachments').select('id, file_name, file_path').eq('request_id', id!)
    setAttachments(atts ?? [])
    const { data: acts } = await supabase.from('activity_log').select('*').eq('request_id', id!).order('created_at', { ascending: true })
    const actList = (acts as ActivityLog[]) ?? []
    setActivity(actList)
    const ids = [data.created_by, data.approver_id, data.decided_by, company?.second_approver_id, ...apList.map(a => a.approver_id), ...actList.map(a => a.actor_id)].filter(Boolean)
    if (ids.length) {
      const { data: us } = await supabase.from('users').select('id, first_name, last_name').in('id', ids)
      const m: Record<string, string> = {}
      for (const u of us ?? []) m[u.id] = `${u.first_name} ${u.last_name}`
      setNames(m)
    }
    setLoading(false)
  }

  const fmt = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: company?.currency ?? 'EUR' }).format(n)

  async function openAttachment(path: string) {
    const { data } = await supabase.storage.from('quotations').createSignedUrl(path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function doCancel() {
    setActionLoading(true)
    const { error } = await (supabase as any).rpc('cancel_request', { p_request_id: id })
    setActionLoading(false); setConfirmCancel(false)
    if (error) { toast.error(error.message); return }
    toast.success(s.st.cancelled); load(); refreshCounts()
  }

  async function doCreatePo() {
    setActionLoading(true)
    const { data: poId, error } = await (supabase as any).rpc('create_po_from_request', { p_request_id: id })
    if (error) { setActionLoading(false); toast.error(error.message); return }
    // Carry the request's attachments (offers) over to the new PO — independent copies
    if (company && poId) {
      const { data: atts } = await supabase.from('request_attachments').select('file_path, file_name, file_size').eq('request_id', id!)
      for (let i = 0; i < (atts?.length ?? 0); i++) {
        const att = atts![i]
        const newPath = `${company.id}/${poId}/${Date.now()}-${i}-${att.file_name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
        const { error: cpErr } = await supabase.storage.from('quotations').copy(att.file_path, newPath)
        if (!cpErr) await supabase.from('po_attachments').insert({ po_id: poId, company_id: company.id, file_path: newPath, file_name: att.file_name, file_size: att.file_size })
      }
    }
    setActionLoading(false)
    toast.success(s.poCreatedToast)
    refreshCounts()
    navigate(`/purchase-orders/${poId}/edit`)
  }

  async function doDecide() {
    if (!decision || !myPending) return
    setActionLoading(true)
    const { data, error } = await (supabase as any).rpc('decide_approval', { p_approval_id: myPending.id, p_approved: decision === 'approve', p_note: note.trim() || null })
    setActionLoading(false); setDecision(null); setNote('')
    if (error) { toast.error(error.message); return }
    toast.success(decision === 'reject' ? s.st.rejected : (data?.status === 'pending' ? s.escalated : s.st.approved))
    load(); refreshCounts()
  }

  if (loading || !req) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>

  const isCreator = profile?.id === req.created_by
  const myPending = approvals.find(a => a.status === 'pending' && (a.approver_id === profile?.id || isAdmin))
  const st = req.status as RequestStatus

  type FlowState = 'done' | 'current' | 'upcoming' | 'rejected' | 'cancelled'
  const flowSteps: { label: string; name?: string; state: FlowState }[] = (() => {
    if (st === 'draft') return []
    const pendingState: FlowState = st === 'pending' ? 'current' : 'upcoming'
    const steps: { label: string; name?: string; state: FlowState }[] = []

    // 1. Created
    steps.push({ label: s.flowCreated, name: req.created_by ? names[req.created_by] : undefined, state: 'done' })

    // 2. Approvers (manager + director)
    const a1 = approvals.find(a => a.step === 1)
    const a1Approver = a1?.approver_id ?? req.approver_id
    steps.push({
      label: s.roleManager,
      name: a1Approver ? names[a1Approver] : undefined,
      state: a1?.status === 'approved' ? 'done' : a1?.status === 'rejected' ? 'rejected' : pendingState,
    })
    const a2 = approvals.find(a => a.step === 2)
    if (a2) {
      steps.push({ label: s.roleDirector, name: a2.approver_id ? names[a2.approver_id] : undefined, state: a2.status === 'approved' ? 'done' : a2.status === 'rejected' ? 'rejected' : pendingState })
    } else {
      const threshold = company?.approval_second_over
      const director = company?.second_approver_id
      if (threshold && threshold > 0 && director && director !== a1Approver && req.total_estimate > threshold) {
        steps.push({ label: s.roleDirector, name: director ? names[director] : undefined, state: a1?.status === 'approved' ? (st === 'pending' ? 'current' : 'upcoming') : 'upcoming' })
      }
    }

    // 3. Outcome
    if (st === 'approved') steps.push({ label: s.st.approved, state: 'done' })
    else if (st === 'rejected') steps.push({ label: s.st.rejected, state: 'rejected' })
    else if (st === 'cancelled') steps.push({ label: s.st.cancelled, state: 'cancelled' })
    else steps.push({ label: s.st.approved, state: 'upcoming' })

    // 4. Purchase (only when relevant)
    if (req.po_id) steps.push({ label: s.flowPurchased, name: linkedPo?.po_number, state: 'done' })
    else if (st === 'approved') steps.push({ label: s.flowPurchase, state: 'upcoming' })

    return steps
  })()

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto">
      <button onClick={() => navigate('/requests')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4"><ChevronLeft className="w-4 h-4" />{s.title}</button>

      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 ">{req.request_number}</h1>
            {req.title && <p className="text-sm text-ink2 mt-0.5">{req.title}</p>}
          </div>
          <span className={`badge ${STATUS_BADGE[st]}`}>{s.st[st]}</span>
        </div>
        <div className="flex items-center gap-2">
          {st === 'approved' && !req.po_id && (hasPerm('purchase_orders', 'create') || isAdmin) && (
            <Button loading={actionLoading} onClick={doCreatePo} className="gap-1.5"><ShoppingCart className="w-3.5 h-3.5" />{s.createPO}</Button>
          )}
          {st !== 'cancelled' && !req.po_id && (isCreator || isAdmin) && (
            <Button variant="secondary" onClick={() => navigate(`/requests/${id}/edit`)} className="gap-1.5"><Pencil className="w-3.5 h-3.5" />{s.edit}</Button>
          )}
          {st === 'pending' && myPending && (
            <>
              <Button variant="secondary" onClick={() => { setDecision('reject'); setNote('') }} className="gap-1.5 text-red-600"><X className="w-3.5 h-3.5" />{t.approvals.reject}</Button>
              <Button onClick={() => { setDecision('approve'); setNote('') }} className="gap-1.5"><Check className="w-3.5 h-3.5" />{t.approvals.approve}</Button>
            </>
          )}
          {st !== 'cancelled' && !req.po_id && (isCreator || isAdmin) && (
            <Button variant="secondary" onClick={() => setConfirmCancel(true)} className="gap-1.5 text-red-600"><XCircle className="w-3.5 h-3.5" />{s.cancelRequest}</Button>
          )}
        </div>
      </div>

      {linkedPo && (linkedPo.status === 'cancelled' ? (
        <button onClick={() => navigate(`/purchase-orders/${linkedPo.id}`)}
          className="w-full flex items-center gap-3 p-4 mb-5 bg-selected border border-field rounded-lg text-left hover:bg-hover transition-colors">
          <XCircle className="w-5 h-5 text-gray-400 shrink-0" />
          <div className="flex-1">
            <p className="text-xs text-gray-400">{s.linkedPO} · {t.status.cancelled}</p>
            <p className="text-sm font-semibold text-gray-500 line-through decoration-gray-300">{linkedPo.po_number}</p>
            <p className="text-xs text-gray-400 mt-0.5">{format(new Date(linkedPo.created_at), 'dd.MM.yyyy')}</p>
          </div>
          <span className="text-sm font-medium text-gray-400">{fmt(linkedPo.total_amount ?? 0)}</span>
        </button>
      ) : (
        <button onClick={() => navigate(`/purchase-orders/${linkedPo.id}`)}
          className="w-full flex items-center gap-3 p-4 mb-5 bg-accent-light border border-accent-border rounded-lg text-left hover:bg-accent-light transition-colors">
          <ShoppingCart className="w-5 h-5 text-accent shrink-0" />
          <div className="flex-1">
            <p className="text-xs text-accent">{s.linkedPO}</p>
            <p className="text-sm font-semibold text-accent-hover ">{linkedPo.po_number}</p>
            <p className="text-xs text-accent mt-0.5">{format(new Date(linkedPo.created_at), 'dd.MM.yyyy')}</p>
          </div>
          <span className="text-sm font-medium text-accent-hover">{fmt(linkedPo.total_amount ?? 0)}</span>
        </button>
      ))}


      <div className="bg-white rounded-lg border border-field p-6 mb-5 grid grid-cols-2 sm:grid-cols-3 gap-5">
        <Field label={s.supplier} value={req.suppliers?.name ?? req.supplier_name} />
        <Field label={s.location} value={req.locations?.name} />
        <Field label={s.department} value={req.departments?.name} />
        <Field label={s.neededBy} value={req.needed_by_date ? format(new Date(req.needed_by_date), 'dd.MM.yyyy') : null} />
        <Field label={s.requestedBy} value={names[req.created_by]} />
        <Field label={s.approver} value={req.approver_id ? names[req.approver_id] : null} />
        {req.note && <div className="col-span-2 sm:col-span-3"><Field label={s.note} value={req.note} /></div>}
      </div>

      {flowSteps.length > 0 && (
        <div className="bg-white rounded-lg border border-field p-6 mb-5">
          <p className="text-sm font-semibold text-gray-900 mb-4">{s.flowTitle}</p>
          <div className="flex items-start overflow-x-auto py-2">
            {flowSteps.map((step, i) => {
              const circle =
                step.state === 'done' ? 'bg-green-500 text-white border-2 border-green-500'
                : step.state === 'rejected' ? 'bg-red-500 text-white border-2 border-red-500'
                : step.state === 'cancelled' ? 'bg-gray-400 text-white border-2 border-gray-400'
                : step.state === 'current' ? 'bg-warn-light text-amber-600 border-2 border-amber-400'
                : 'bg-gray-100 text-gray-300 border-2 border-field'
              return (
                <Fragment key={i}>
                  <div className="flex flex-col items-center text-center px-1.5 w-28 shrink-0">
                    <div style={{ width: 44, height: 44, minWidth: 44, minHeight: 44, aspectRatio: '1 / 1' }} className={`shrink-0 rounded-full flex items-center justify-center ${circle}`}>
                      {step.state === 'done' ? <Check className="w-5 h-5" />
                        : step.state === 'rejected' || step.state === 'cancelled' ? <X className="w-5 h-5" />
                        : <span style={{ width: 10, height: 10 }} className="rounded-full bg-current" />}
                    </div>
                    <p className="text-[11px] font-semibold text-gray-700 mt-1.5">{step.label}</p>
                    {step.name && <p className="text-xs text-gray-500 truncate w-full">{step.name}</p>}
                  </div>
                  {i < flowSteps.length - 1 && <div className={`flex-1 h-0.5 mt-[22px] min-w-[20px] ${step.state === 'done' ? 'bg-green-300' : 'bg-gray-200'}`} />}
                </Fragment>
              )
            })}
          </div>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="bg-white rounded-lg border border-field p-6 mb-5">
          <p className="text-sm font-semibold text-gray-900 mb-3">{s.attachments}</p>
          <div className="flex flex-col gap-2">
            {attachments.map(att => (
              <button key={att.id} type="button" onClick={() => openAttachment(att.file_path)}
                className="flex items-center gap-2 p-2.5 bg-accent-light border border-accent-border rounded-lg text-left">
                <FileText className="w-4 h-4 text-accent shrink-0" />
                <span className="text-sm text-accent hover:underline font-medium flex-1 truncate">{att.file_name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-field overflow-hidden mb-5">
        <div className="overflow-x-auto"><table className="w-full text-sm min-w-[500px]">
          <thead className="bg-surface border-b border-field"><tr>
            <th className="text-left px-4 py-2.5 text-sm font-medium text-ink2">{s.itemName}</th>
            <th className="text-left px-4 py-2.5 text-sm font-medium text-ink2">{s.category}</th>
            <th className="text-right px-4 py-2.5 text-sm font-medium text-ink2">{s.quantity}</th>
            <th className="text-left px-4 py-2.5 text-sm font-medium text-ink2">{s.unit}</th>
            <th className="text-right px-4 py-2.5 text-sm font-medium text-ink2">{s.estUnitPrice}</th>
            <th className="text-right px-4 py-2.5 text-sm font-medium text-ink2">{s.lineTotal}</th>
          </tr></thead>
          <tbody className="divide-y divide-field">
            {lines.map(l => (
              <tr key={l.id}>
                <td className="px-4 py-2.5 text-gray-800">
                  {l.name}
                  {l.long_description && <p className="text-xs text-gray-400 mt-0.5">{l.long_description}</p>}
                </td>
                <td className="px-4 py-2.5 text-gray-600">{l.categories?.name ?? '—'}</td>
                <td className="px-4 py-2.5 text-right text-gray-600">{l.quantity}</td>
                <td className="px-4 py-2.5 text-gray-600">{l.unit}</td>
                <td className="px-4 py-2.5 text-right text-gray-600">{fmt(l.est_unit_price)}</td>
                <td className="px-4 py-2.5 text-right font-medium text-gray-800">{fmt(l.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <div className="flex justify-end p-4 border-t border-gray-100">
          <div className="w-64 flex flex-col gap-1.5">
            {req.discount_amount > 0 && <div className="flex justify-between text-sm"><span className="text-gray-500">{s.discount}</span><span>−{fmt(req.discount_amount)}</span></div>}
            <div className="flex justify-between border-t border-gray-100 pt-1.5"><span className="text-sm font-semibold text-gray-700">{s.estTotal}</span><span className="text-base font-bold text-gray-900">{fmt(req.total_estimate)}</span></div>
          </div>
        </div>
      </div>

      {activity.length > 0 && (
        <div className="bg-white rounded-lg border border-field p-6 mb-5">
          <p className="text-sm font-semibold text-gray-900 mb-4">{s.auditTrail}</p>
          <ol className="flex flex-col gap-4">
            {activity.map(a => {
              const dot = a.action === 'approved' ? 'bg-green-500' : a.action === 'rejected' ? 'bg-red-500' : a.action === 'cancelled' ? 'bg-gray-400' : a.action === 'submitted' ? 'bg-amber-500' : 'bg-accent'
              return (
                <li key={a.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className={`w-2.5 h-2.5 rounded-full ${dot} mt-1.5`} />
                    <span className="flex-1 w-px bg-gray-100 mt-1" />
                  </div>
                  <div className="flex-1 -mt-0.5">
                    <p className="text-sm text-gray-800">
                      <span className="font-medium">{a.actor_id ? names[a.actor_id] ?? '—' : '—'}</span>{' '}
                      {s.act[a.action]}{a.meta?.step ? ` (${s.step} ${a.meta.step})` : ''}{a.meta?.po_number ? ` ${a.meta.po_number}` : ''}
                    </p>
                    <p className="text-xs text-gray-400">{format(new Date(a.created_at), 'dd.MM.yyyy HH:mm')}</p>
                    {a.note && <p className="text-sm text-gray-600 mt-1 bg-gray-50 border border-gray-100 rounded-lg px-3 py-1.5">{a.note}</p>}
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      )}

      <ConfirmDialog open={confirmCancel} onClose={() => setConfirmCancel(false)} onConfirm={doCancel}
        title={s.cancelRequest} danger loading={actionLoading} message={s.cancelConfirm} confirmLabel={s.cancelRequest} />

      <Modal open={!!decision} onClose={() => setDecision(null)} title={decision === 'approve' ? t.approvals.approveTitle : t.approvals.rejectTitle} size="sm">
        <div className="flex flex-col gap-1 mb-4">
          <label className="text-sm font-medium text-gray-700">{t.approvals.noteOptional}</label>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
            className="rounded-lg border border-field px-3 py-2 hover:border-field-hover text-sm focus:outline-none focus:border-field-focus" />
        </div>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={() => setDecision(null)}>{t.common.cancel}</Button>
          <Button loading={actionLoading} variant={decision === 'reject' ? 'danger' : 'primary'} onClick={doDecide}>
            {decision === 'approve' ? t.approvals.approve : t.approvals.reject}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
