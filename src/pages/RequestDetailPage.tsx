import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronRight, Pencil, XCircle, Check, X, FileText, ShoppingCart, Send, Trash2, Package, Tag, Hash, Ruler, Coins, Eye } from 'lucide-react'
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
import ModalActions from '../components/ui/ModalActions'
import PersonCell from '../components/ui/PersonCell'
import GridHead from '../components/ui/GridHead'
import { unitLabel } from '../lib/units'

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

export default function RequestDetailPage() {
  const { id } = useParams()
  const { company, profile, isAdmin, hasPerm } = useCompany()
  const { t, lang } = useLanguage()
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
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [decision, setDecision] = useState<null | 'approve' | 'reject'>(null)
  const [note, setNote] = useState('')

  useEffect(() => { if (company) load() }, [company, id])

  async function load() {
    // spinner only on the first load: later reloads refresh the data in place
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

  async function doSubmit() {
    setActionLoading(true)
    const { error } = await (supabase as any).rpc('submit_request', { p_request_id: id, p_note: null })
    setActionLoading(false)
    if (error) { toast.error(error.message); return }
    toast.success(s.submittedToManager); load(); refreshCounts()
  }

  async function doDeleteDraft() {
    setActionLoading(true)
    if (attachments.length) await supabase.storage.from('quotations').remove(attachments.map(a => a.file_path))
    const { error } = await (supabase as any).rpc('delete_draft_request', { p_request_id: id })
    setActionLoading(false); setConfirmDelete(false)
    if (error) { toast.error(error.message); return }
    toast.success(s.draftDeleted); refreshCounts(); navigate('/requests')
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
  const flowSteps: { label: string; name?: string; note?: string | null; state: FlowState }[] = (() => {
    if (st === 'draft') return []
    const pendingState: FlowState = st === 'pending' ? 'current' : 'upcoming'
    const steps: { label: string; name?: string; note?: string | null; state: FlowState }[] = []

    // 1. Created
    steps.push({ label: s.flowCreated, name: req.created_by ? names[req.created_by] : undefined, state: 'done' })

    // 2. Approvers (manager + director)
    const a1 = approvals.find(a => a.step === 1)
    const a1Approver = a1?.approver_id ?? req.approver_id
    steps.push({
      label: s.roleManager,
      name: a1Approver ? names[a1Approver] : undefined,
      note: a1?.decision_note,
      state: a1?.status === 'approved' ? 'done' : a1?.status === 'rejected' ? 'rejected' : pendingState,
    })
    const a2 = approvals.find(a => a.step === 2)
    if (a2) {
      steps.push({ label: s.roleDirector, name: a2.approver_id ? names[a2.approver_id] : undefined, note: a2.decision_note, state: a2.status === 'approved' ? 'done' : a2.status === 'rejected' ? 'rejected' : pendingState })
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

  const flowCircle = (state: FlowState) =>
    state === 'done' ? 'bg-success text-white'
    : state === 'rejected' ? 'bg-danger text-white'
    : state === 'cancelled' ? 'bg-icon text-white'
    : state === 'current' ? 'bg-white border-2 border-warn text-warn'
    : 'bg-white border border-field text-placeholder'

  return (
    <div className="p-4 lg:p-6">
      <nav className="flex items-center gap-1.5 text-[13px] text-ink2 mb-4">
        <button type="button" onClick={() => navigate('/requests')} aria-label={s.title} title={s.title}
          className="w-7 h-7 -ml-1.5 mr-1 inline-flex items-center justify-center rounded-lg text-icon hover:bg-selected hover:text-ink transition-colors">
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
        </button>
        <Link to="/requests" className="hover:text-ink transition-colors">{s.title}</Link>
        <ChevronRight className="w-3.5 h-3.5 text-icon" />
        <span className="text-ink font-medium">{req.request_number}</span>
      </nav>

      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-semibold text-ink tracking-tight">{req.title || req.request_number}</h1>
            <span className={`badge ${STATUS_BADGE[st]}`}>{s.st[st]}</span>
          </div>
          <p className="mt-2 text-sm text-ink2">{req.title ? `${req.request_number} · ` : ''}{format(new Date(req.created_at), 'dd.MM.yyyy')}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {st === 'approved' && !req.po_id && (hasPerm('purchase_orders', 'create') || isAdmin) && (
            <Button loading={actionLoading} onClick={doCreatePo} className="gap-2"><ShoppingCart className="w-4 h-4" />{s.createPO}</Button>
          )}
          {st === 'draft' && (isCreator || isAdmin) && (
            <Button loading={actionLoading} onClick={doSubmit} className="gap-2"><Send className="w-4 h-4" />{s.submit}</Button>
          )}
          {st === 'pending' && myPending && (
            <>
              <Button variant="secondary" onClick={() => { setDecision('reject'); setNote('') }} className="gap-2 !text-danger !border-line"><X className="w-4 h-4" />{t.approvals.reject}</Button>
              <Button onClick={() => { setDecision('approve'); setNote('') }} className="gap-2"><Check className="w-4 h-4" />{t.approvals.approve}</Button>
            </>
          )}
          {st !== 'cancelled' && !req.po_id && (isCreator || isAdmin) && (
            <Button variant="secondary" onClick={() => navigate(`/requests/${id}/edit`)} className="gap-2"><Pencil className="w-4 h-4" />{s.edit}</Button>
          )}
          {st === 'draft' && (isCreator || isAdmin) && (
            <Button variant="secondary" onClick={() => setConfirmDelete(true)} className="gap-2 !text-danger !border-line"><Trash2 className="w-4 h-4" />{s.deleteDraft}</Button>
          )}
          {st !== 'cancelled' && st !== 'draft' && !req.po_id && (isCreator || isAdmin) && (
            <Button variant="secondary" onClick={() => setConfirmCancel(true)} className="gap-2 !text-danger !border-line"><XCircle className="w-4 h-4" />{s.cancelRequest}</Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        {/* left: what is being requested */}
        <div className="xl:col-span-2 flex flex-col gap-4">
          <Card title={s.lineItems} className="overflow-hidden">
            <div className="overflow-x-auto"><table className="table-grid w-full text-sm min-w-[620px]">
              <GridHead cols={[[s.itemName, Package], [s.category, Tag], [s.quantity, Hash, 'right'], [s.unit, Ruler], [s.estUnitPrice, Coins, 'right'], [s.lineTotal, Coins, 'right']]} />
              <tbody className="divide-y divide-field">
                {lines.map(l => (
                  <tr key={l.id}>
                    <td className="px-4 py-3">
                      <div className="flex items-baseline gap-2 min-w-0">
                        <span className="font-medium text-ink whitespace-nowrap">{l.name}</span>
                        {l.long_description && <span className="text-xs text-gray-400 truncate max-w-[220px]">{l.long_description}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink2">{l.categories?.name ?? '-'}</td>
                    <td className="px-4 py-3 text-right text-ink2 tabular-nums">{l.quantity}</td>
                    <td className="px-4 py-3 text-ink2">{unitLabel(l.unit, lang) || '-'}</td>
                    <td className="px-4 py-3 text-right text-ink2 tabular-nums">{fmt(l.est_unit_price)}</td>
                    <td className="px-4 py-3 text-right text-ink tabular-nums">{fmt(l.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            <div className="flex justify-end px-5 py-4 border-t border-field">
              <div className="w-64 flex flex-col gap-1.5 text-sm">
                {req.discount_amount > 0 && <div className="flex justify-between"><span className="text-ink2">{s.discount}</span><span className="tabular-nums">-{fmt(req.discount_amount)}</span></div>}
                <div className="flex justify-between items-baseline"><span className="font-medium text-ink2">{s.estTotal}</span><span className="text-lg font-semibold text-ink tabular-nums">{fmt(req.total_estimate)}</span></div>
              </div>
            </div>
          </Card>

          {attachments.length > 0 && (
            <Card title={s.attachments}>
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
                  const dot = a.action === 'approved' ? 'bg-success' : a.action === 'rejected' ? 'bg-danger' : a.action === 'cancelled' ? 'bg-icon' : a.action === 'submitted' ? 'bg-warn' : 'bg-primary'
                  return (
                    <li key={a.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span className={`w-2.5 h-2.5 rounded-full ${dot} mt-1.5`} />
                        {i < activity.length - 1 && <span className="flex-1 w-px bg-line mt-1" />}
                      </div>
                      <div className="flex-1 -mt-0.5">
                        <p className="text-sm text-ink">
                          <span className="font-medium">{a.actor_id ? names[a.actor_id] ?? '-' : '-'}</span>{' '}
                          {s.act[a.action]}{a.meta?.step ? ` (${s.step} ${a.meta.step})` : ''}{a.meta?.po_number ? ` ${a.meta.po_number}` : ''}
                        </p>
                        <p className="text-xs text-ink2">{format(new Date(a.created_at), 'dd.MM.yyyy HH:mm')}</p>
                        {a.note && <p className="text-sm text-ink mt-1 pl-3 border-l-2 border-line whitespace-pre-wrap">{a.note}</p>}
                      </div>
                    </li>
                  )
                })}
              </ol>
            </Card>
          )}
        </div>

        {/* right: who, when, where and how far it got */}
        <div className="flex flex-col gap-4 order-first xl:order-none">
          <Card title={s.detailsTitle}>
            <div className="p-5 grid grid-cols-2 gap-x-6 gap-y-5">
              <div className="col-span-2"><Field label={s.supplier}>{req.suppliers?.name ?? req.supplier_name}</Field></div>
              <Field label={s.location}>{req.locations?.name}</Field>
              <Field label={s.department}>{req.departments?.name}</Field>
              <Field label={s.neededBy}>{req.needed_by_date ? format(new Date(req.needed_by_date), 'dd.MM.yyyy') : null}</Field>
              <Field label={s.requestedBy}>{names[req.created_by] && <PersonCell name={names[req.created_by]} />}</Field>
              <Field label={s.approver}>{req.approver_id && names[req.approver_id] ? <PersonCell name={names[req.approver_id]} /> : null}</Field>
              {req.note && <div className="col-span-2"><Field label={s.note}><span className="whitespace-pre-wrap">{req.note}</span></Field></div>}
            </div>
          </Card>

          {flowSteps.length > 0 && (
            <Card title={s.flowTitle}>
              <ol className="p-5 flex flex-col">
                {flowSteps.map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${flowCircle(step.state)}`}>
                        {step.state === 'done' ? <Check className="w-3.5 h-3.5" />
                          : step.state === 'rejected' || step.state === 'cancelled' ? <X className="w-3.5 h-3.5" />
                          : <span className="w-1.5 h-1.5 rounded-full bg-current" />}
                      </span>
                      {i < flowSteps.length - 1 && <span className={`w-px flex-1 my-1 min-h-[14px] ${step.state === 'done' ? 'bg-success' : 'bg-line'}`} />}
                    </div>
                    <div className="pb-4">
                      <p className="text-sm font-medium text-ink leading-6">{step.label}</p>
                      {step.name && <p className="text-[13px] text-ink2 -mt-0.5">{step.name}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
          )}

          {linkedPo && (
            <Card title={s.linkedPO}>
              <button onClick={() => navigate(`/purchase-orders/${linkedPo.id}`)} className="w-full flex items-center gap-3 p-5 text-left hover:bg-surface transition-colors rounded-b-lg">
                <ShoppingCart className="w-4 h-4 text-icon shrink-0" strokeWidth={1.75} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium text-ink ${linkedPo.status === 'cancelled' ? 'line-through decoration-gray-300' : ''}`}>{linkedPo.po_number}</p>
                  <p className="text-xs text-ink2 mt-0.5">{format(new Date(linkedPo.created_at), 'dd.MM.yyyy')}{linkedPo.status === 'cancelled' ? ` · ${t.status.cancelled}` : ''}</p>
                </div>
                <span className="text-sm text-ink tabular-nums">{fmt(linkedPo.total_amount ?? 0)}</span>
              </button>
            </Card>
          )}
        </div>
      </div>

      <ConfirmDialog open={confirmCancel} onClose={() => setConfirmCancel(false)} onConfirm={doCancel}
        title={s.cancelTitle} message={s.cancelQuestion} name={req.request_number} danger loading={actionLoading} confirmLabel={s.cancelRequest} />

      <ConfirmDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} onConfirm={doDeleteDraft}
        title={s.deleteTitle} message={s.deleteQuestion} name={req.request_number} danger loading={actionLoading} confirmLabel={t.common.deleteEntity} />

      <Modal open={!!decision} onClose={() => setDecision(null)} title={decision === 'approve' ? t.approvals.approveTitle : t.approvals.rejectTitle} size="sm" icon={decision === 'reject' ? X : Check}>
        <p className="text-sm text-ink2 mb-4">
          <span className="font-medium text-ink">{req.request_number}</span>{req.title ? ` · ${req.title}` : ''} · <span className="tabular-nums">{fmt(req.total_estimate)}</span>
        </p>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="d-note">{t.approvals.noteOptional}</label>
          <textarea id="d-note" value={note} onChange={e => setNote(e.target.value)} rows={3}
            className="rounded-lg border border-field px-3 py-2 hover:border-field-hover text-sm focus:outline-none focus:border-field-focus resize-none" />
        </div>
        <ModalActions className="justify-end">
          <Button variant="secondary" onClick={() => setDecision(null)}>{t.common.cancel}</Button>
          <Button loading={actionLoading} variant={decision === 'reject' ? 'danger' : 'primary'} onClick={doDecide}>
            {decision === 'approve' ? t.approvals.approve : t.approvals.reject}
          </Button>
        </ModalActions>
      </Modal>
    </div>
  )
}
