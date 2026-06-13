import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Pencil, Send, XCircle, Check, X, FileText } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { useLanguage } from '../hooks/useLanguage'
import { toast } from '../components/ui/Toast'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { format } from 'date-fns'
import type { Request, RequestLineItem, RequestStatus, Approval } from '../types/database'

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-600',
  cancelled: 'bg-gray-100 text-gray-500',
}

type ReqFull = Request & {
  projects: { name: string } | null
  suppliers: { name: string } | null
  categories: { name: string } | null
  locations: { name: string } | null
  departments: { name: string } | null
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return <div><p className="text-xs text-gray-400 mb-0.5">{label}</p><p className="text-sm text-gray-800 font-medium">{value || '—'}</p></div>
}

export default function RequestDetailPage() {
  const { id } = useParams()
  const { company, profile, isAdmin } = useCompany()
  const { t } = useLanguage()
  const s = t.requests
  const navigate = useNavigate()

  const [req, setReq] = useState<ReqFull | null>(null)
  const [lines, setLines] = useState<RequestLineItem[]>([])
  const [approvals, setApprovals] = useState<Approval[]>([])
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
      .select('*, projects(name), suppliers(name), categories(name), locations(name), departments(name)')
      .eq('id', id!).single()
    if (!data) { toast.error('Not found'); navigate('/requests'); return }
    setReq(data as unknown as ReqFull)
    const { data: ls } = await supabase.from('request_line_items').select('*').eq('request_id', id!).order('position')
    setLines((ls as RequestLineItem[]) ?? [])
    const { data: aps } = await supabase.from('approvals').select('*').eq('request_id', id!).order('step')
    const apList = (aps as Approval[]) ?? []
    setApprovals(apList)
    const { data: atts } = await supabase.from('request_attachments').select('id, file_name, file_path').eq('request_id', id!)
    setAttachments(atts ?? [])
    const ids = [data.created_by, data.approver_id, data.decided_by, ...apList.map(a => a.approver_id)].filter(Boolean)
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
    toast.success(s.st.cancelled); load()
  }

  async function doSubmit() {
    setActionLoading(true)
    const { data, error } = await (supabase as any).rpc('submit_request', { p_request_id: id })
    setActionLoading(false)
    if (error) { toast.error(error.message); return }
    toast.success(data?.status === 'approved' ? s.autoApproved : s.submittedToManager); load()
  }

  async function doDecide() {
    if (!decision || !myPending) return
    setActionLoading(true)
    const { data, error } = await (supabase as any).rpc('decide_approval', { p_approval_id: myPending.id, p_approved: decision === 'approve', p_note: note.trim() || null })
    setActionLoading(false); setDecision(null); setNote('')
    if (error) { toast.error(error.message); return }
    toast.success(decision === 'reject' ? s.st.rejected : (data?.status === 'pending' ? s.escalated : s.st.approved))
    load()
  }

  if (loading || !req) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>

  const isCreator = profile?.id === req.created_by
  const myPending = approvals.find(a => a.status === 'pending' && (a.approver_id === profile?.id || isAdmin))
  const st = req.status as RequestStatus

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto">
      <button onClick={() => navigate('/requests')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4"><ChevronLeft className="w-4 h-4" />{s.title}</button>

      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900 font-mono">{req.request_number}</h1>
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[st]}`}>{s.st[st]}</span>
        </div>
        <div className="flex items-center gap-2">
          {st === 'draft' && isCreator && (
            <>
              <Button variant="secondary" onClick={() => navigate(`/requests/${id}/edit`)} className="gap-1.5"><Pencil className="w-3.5 h-3.5" />{s.edit}</Button>
              <Button loading={actionLoading} onClick={doSubmit} className="gap-1.5"><Send className="w-3.5 h-3.5" />{s.submit}</Button>
            </>
          )}
          {st === 'pending' && myPending && (
            <>
              <Button variant="secondary" onClick={() => { setDecision('reject'); setNote('') }} className="gap-1.5 text-red-600"><X className="w-3.5 h-3.5" />{t.approvals.reject}</Button>
              <Button onClick={() => { setDecision('approve'); setNote('') }} className="gap-1.5"><Check className="w-3.5 h-3.5" />{t.approvals.approve}</Button>
            </>
          )}
          {(st === 'draft' || st === 'pending') && (isCreator || isAdmin) && (
            <Button variant="secondary" onClick={() => setConfirmCancel(true)} className="gap-1.5 text-red-600"><XCircle className="w-3.5 h-3.5" />{s.cancelRequest}</Button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-5 grid grid-cols-2 sm:grid-cols-3 gap-5">
        <Field label={s.project} value={req.projects?.name} />
        <Field label={s.supplier} value={req.suppliers?.name ?? req.supplier_name} />
        <Field label={s.category} value={req.categories?.name} />
        <Field label={s.location} value={req.locations?.name} />
        <Field label={s.department} value={req.departments?.name} />
        <Field label={s.neededBy} value={req.needed_by_date ? format(new Date(req.needed_by_date), 'dd.MM.yyyy') : null} />
        <Field label={s.requestedBy} value={names[req.created_by]} />
        <Field label={s.approver} value={req.approver_id ? names[req.approver_id] : null} />
        {req.note && <div className="col-span-2 sm:col-span-3"><Field label={s.note} value={req.note} /></div>}
      </div>

      {attachments.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-5">
          <p className="text-sm font-semibold text-gray-900 mb-3">{s.attachments}</p>
          <div className="flex flex-col gap-2">
            {attachments.map(att => (
              <button key={att.id} type="button" onClick={() => openAttachment(att.file_path)}
                className="flex items-center gap-2 p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-left">
                <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                <span className="text-sm text-blue-600 hover:underline font-medium flex-1 truncate">{att.file_name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {approvals.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-5">
          <p className="text-sm font-semibold text-gray-900 mb-3">{s.approvalChain}</p>
          <div className="flex flex-col gap-2">
            {approvals.map(a => (
              <div key={a.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-700">{s.step} {a.step} · {names[a.approver_id] ?? '—'}{a.decision_note ? ` · ${a.decision_note}` : ''}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${a.status === 'approved' ? 'bg-green-100 text-green-700' : a.status === 'rejected' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'}`}>
                  {a.status === 'approved' ? s.st.approved : a.status === 'rejected' ? s.st.rejected : s.st.pending}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(st === 'approved' || st === 'rejected') && (
        <div className={`rounded-xl border p-4 mb-5 ${st === 'approved' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <p className="text-sm font-medium text-gray-800">{s.decision}: {s.st[st]}</p>
          {req.decided_by && <p className="text-xs text-gray-500 mt-1">{s.decidedBy}: {names[req.decided_by]} · {req.decided_at ? format(new Date(req.decided_at), 'dd.MM.yyyy HH:mm') : ''}</p>}
          {req.decision_note && <p className="text-sm text-gray-600 mt-1">{s.decisionNote}: {req.decision_note}</p>}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-sm min-w-[500px]">
          <thead className="bg-gray-50 border-b border-gray-100"><tr>
            <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">{s.itemName}</th>
            <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">{s.quantity}</th>
            <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">{s.unit}</th>
            <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">{s.estUnitPrice}</th>
            <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">{s.lineTotal}</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-50">
            {lines.map(l => (
              <tr key={l.id}>
                <td className="px-4 py-2.5 text-gray-800">{l.name}</td>
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

      <ConfirmDialog open={confirmCancel} onClose={() => setConfirmCancel(false)} onConfirm={doCancel}
        title={s.cancelRequest} danger loading={actionLoading} message={s.cancelConfirm} confirmLabel={s.cancelRequest} />

      <Modal open={!!decision} onClose={() => setDecision(null)} title={decision === 'approve' ? t.approvals.approveTitle : t.approvals.rejectTitle} size="sm">
        <div className="flex flex-col gap-1 mb-4">
          <label className="text-sm font-medium text-gray-700">{t.approvals.noteOptional}</label>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
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
