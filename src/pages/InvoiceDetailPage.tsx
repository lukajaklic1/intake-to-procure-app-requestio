import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Pencil, Trash2, Upload, FileText, Download, Check, Coins } from 'lucide-react'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { useLanguage } from '../hooks/useLanguage'
import { toast } from '../components/ui/Toast'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import EmptyState from '../components/ui/EmptyState'
import { computeMatch, type InvLine } from '../lib/invoiceMatching'
import { loadMatchData, type MatchData } from '../lib/invoiceData'
import { INVOICE_BADGE, MATCH_BADGE, dueState, type InvoiceStatus } from '../lib/invoices'
import { daysUntil } from '../lib/contracts'
import ModalActions from '../components/ui/ModalActions'

interface Inv {
  id: string; invoice_number: string; supplier_invoice_number: string; supplier_id: string; po_id: string | null
  invoice_date: string; due_date: string | null; tax_rate: number; subtotal: number; tax_amount: number; total_amount: number; document_total: number | null
  status: InvoiceStatus; match_status: string; decision_note: string | null; paid_at: string | null; payment_reference: string | null
  notes: string | null; created_by: string | null; approved_by: string | null; approved_at: string | null; created_at: string
  suppliers: { id: string; name: string } | null; purchase_orders: { id: string; po_number: string } | null
}
interface Line { id: string; po_line_id: string | null; position: number; name: string; quantity: number; unit: string | null; unit_price: number; line_total: number }
interface Doc { id: string; file_name: string; file_path: string; file_size: number | null; created_at: string }
interface Act { id: string; actor_id: string | null; action: string; note: string | null; created_at: string }
type Tab = 'overview' | 'lines' | 'documents' | 'activity'

const fmtDate = (d: string | null) => (d ? format(new Date(d + 'T00:00:00'), 'dd.MM.yyyy') : '—')

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { company, isAdmin, hasPerm } = useCompany()
  const { t } = useLanguage()
  const s = t.invoices
  const canEdit = isAdmin || hasPerm('invoices', 'create')
  const canApprove = isAdmin || hasPerm('invoices', 'approve')
  const canPay = isAdmin || hasPerm('invoices', 'pay')
  const currency = company?.currency ?? 'EUR'
  const money = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(n)

  const [inv, setInv] = useState<Inv | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [docs, setDocs] = useState<Doc[]>([])
  const [activity, setActivity] = useState<Act[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [match, setMatch] = useState<MatchData | null>(null)
  const [tab, setTab] = useState<Tab>('overview')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState<null | 'approve' | 'reject' | 'pay' | 'delete'>(null)
  const [note, setNote] = useState('')
  const [paidAt, setPaidAt] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [payRef, setPayRef] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (company && id) load() }, [company, id])

  async function load() {
    if (!company || !id) return
    const [{ data: i }, { data: ls }, { data: ds }, { data: ac }] = await Promise.all([
      supabase.from('invoices').select('*, suppliers(id, name), purchase_orders(id, po_number)').eq('id', id).single(),
      supabase.from('invoice_line_items').select('*').eq('invoice_id', id).order('position'),
      supabase.from('invoice_attachments').select('*').eq('invoice_id', id).order('created_at', { ascending: false }),
      supabase.from('invoice_activity').select('*').eq('invoice_id', id).order('created_at', { ascending: false }),
    ])
    if (!i) { toast.error(t.common.notFound); navigate('/invoices'); return }
    setInv(i as unknown as Inv)
    setLines(((ls ?? []) as Line[]).map(l => ({ ...l, quantity: Number(l.quantity), unit_price: Number(l.unit_price), line_total: Number(l.line_total) })))
    setDocs((ds as Doc[]) ?? [])
    setActivity((ac as Act[]) ?? [])
    const ids = [...new Set([i.created_by, i.approved_by, ...(ac ?? []).map(a => a.actor_id)].filter(Boolean))] as string[]
    if (ids.length) {
      const { data: us } = await supabase.from('users').select('id, first_name, last_name').in('id', ids)
      const m: Record<string, string> = {}
      for (const u of us ?? []) m[u.id] = `${u.first_name} ${u.last_name}`
      setNames(m)
    }
    setMatch(i.po_id ? await loadMatchData(i.po_id, i.id) : null)
    setLoading(false)
  }

  const invLines: InvLine[] = useMemo(() => lines.map(l => ({ id: l.id, po_line_id: l.po_line_id, name: l.name, quantity: l.quantity, unit_price: l.unit_price })), [lines])
  const result = useMemo(() => inv ? computeMatch({
    hasPo: !!inv.po_id, lines: invLines, poLines: match?.poLines ?? [], received: match?.received ?? new Map(), invoicedElsewhere: match?.invoicedElsewhere ?? new Map(),
    totalAmount: Number(inv.total_amount), documentTotal: inv.document_total != null ? Number(inv.document_total) : null,
  }) : null, [inv, invLines, match])

  if (loading || !inv || !result) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>

  const poLineById = new Map((match?.poLines ?? []).map(p => [p.id, p]))
  const ds = dueState(inv)
  const dLeft = daysUntil(inv.due_date)

  async function rpc(status: string, opts: { note?: string; paid?: string; ref?: string } = {}) {
    setBusy(true)
    const { error } = await supabase.rpc('set_invoice_status', { p_invoice_id: inv!.id, p_status: status, p_note: opts.note ?? null, p_paid_at: opts.paid ?? null, p_payment_ref: opts.ref ?? null })
    setBusy(false); setDialog(null); setNote('')
    if (error) { toast.error(error.message); return }
    toast.success(s.statusChanged); load()
  }
  async function deleteInvoice() {
    const { error } = await supabase.from('invoices').delete().eq('id', inv!.id)
    setDialog(null)
    if (error) { toast.error(error.message); return }
    toast.success(t.common.deleted); navigate('/invoices')
  }
  async function upload(files: FileList | null) {
    if (!company || !files?.length) return
    setUploading(true)
    for (const file of Array.from(files)) {
      const path = `${company.id}/invoices/${inv!.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error } = await supabase.storage.from('quotations').upload(path, file, { upsert: true })
      if (error) { toast.error(`${t.common.uploadPrefix} ${file.name}: ${error.message}`); continue }
      await supabase.from('invoice_attachments').insert({ invoice_id: inv!.id, company_id: company.id, file_path: path, file_name: file.name, file_size: file.size })
    }
    setUploading(false); if (fileRef.current) fileRef.current.value = ''; load()
  }
  async function openDoc(d: Doc) {
    const { data } = await supabase.storage.from('quotations').createSignedUrl(d.file_path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }
  async function removeDoc(d: Doc) {
    await supabase.storage.from('quotations').remove([d.file_path])
    await supabase.from('invoice_attachments').delete().eq('id', d.id)
    load()
  }

  const needNote = dialog === 'reject' || (dialog === 'approve' && result.status === 'mismatch')
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'overview', label: s.overview },
    { id: 'lines', label: s.lines, count: lines.length },
    { id: 'documents', label: s.documents, count: docs.length },
    { id: 'activity', label: s.activity, count: activity.length },
  ]
  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div><p className="text-xs text-gray-400 mb-0.5">{label}</p><div className="text-sm text-ink">{children || '—'}</div></div>
  )
  const isOpenForEdit = inv.status === 'draft' || inv.status === 'rejected'

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto">
      <button onClick={() => navigate('/invoices')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4"><ChevronLeft className="w-4 h-4" />{s.back}</button>

      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">{inv.supplier_invoice_number}</h1>
            <span className={`badge ${INVOICE_BADGE[inv.status]}`}>{s.st[inv.status]}</span>
            <span className={`badge ${MATCH_BADGE[result.status]}`}>{s.matchSt[result.status]}</span>
          </div>
          <p className="text-sm text-ink2 mt-1">{inv.invoice_number} · {inv.suppliers?.name}</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {isOpenForEdit && canEdit && <>
            <Button variant="secondary" onClick={() => navigate(`/invoices/${inv.id}/edit`)} className="gap-2"><Pencil className="w-4 h-4" />{t.common.editEntity}</Button>
            <Button loading={busy} onClick={() => rpc('in_review')}>{s.submit}</Button>
            {inv.status === 'draft' && <Button variant="secondary" onClick={() => setDialog('delete')} className="!px-2.5"><Trash2 className="w-4 h-4 text-icon" /></Button>}
          </>}
          {inv.status === 'in_review' && canApprove && <>
            <Button variant="secondary" onClick={() => { setNote(''); setDialog('reject') }}>{s.reject}</Button>
            <Button onClick={() => { setNote(''); setDialog('approve') }}>{s.approve}</Button>
          </>}
          {inv.status === 'in_review' && canEdit && !canApprove && <Button variant="secondary" loading={busy} onClick={() => rpc('draft')}>{s.recall}</Button>}
          {inv.status === 'approved' && canPay && <Button onClick={() => setDialog('pay')}>{s.markPaid}</Button>}
          {inv.status === 'paid' && isAdmin && <Button variant="secondary" loading={busy} onClick={() => rpc('approved')}>{s.undoPaid}</Button>}
        </div>
      </div>

      {inv.status === 'in_review' && <div className="badge badge-warn !rounded-lg !whitespace-normal !flex px-4 py-3 mb-5 text-sm">{s.pendingApproval}</div>}
      {inv.status !== 'paid' && inv.status !== 'rejected' && ds === 'overdue' && <div className="badge badge-danger !rounded-lg !whitespace-normal !flex px-4 py-3 mb-5 text-sm">{s.overdue}: {fmtDate(inv.due_date)} ({Math.abs(dLeft ?? 0)} {s.days})</div>}
      {inv.status === 'rejected' && inv.decision_note && <div className="badge badge-danger !rounded-lg !whitespace-normal !flex px-4 py-3 mb-5 text-sm">{s.reject}: {inv.decision_note}</div>}

      <div className="flex items-center gap-1.5 mb-5">
        {tabs.map(x => (
          <button key={x.id} onClick={() => setTab(x.id)}
            className={`inline-flex items-center gap-2 h-8 px-3 rounded-lg border text-sm transition-colors ${tab === x.id ? 'border-field bg-surface text-ink' : 'border-transparent text-ink2 hover:bg-hover'}`}>
            {x.label}
            {x.count != null && <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-md bg-surface border border-field text-[11px] text-ink2">{x.count}</span>}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white rounded-lg border border-field p-6 grid grid-cols-2 sm:grid-cols-3 gap-5">
            <Field label={s.supplier}>{inv.suppliers?.name}</Field>
            <Field label={s.po}>{inv.purchase_orders && <Link to={`/purchase-orders/${inv.purchase_orders.id}`} className="text-accent hover:underline">{inv.purchase_orders.po_number}</Link>}</Field>
            <Field label={s.invoiceNo}>{inv.invoice_number}</Field>
            <Field label={s.invoiceDate}>{fmtDate(inv.invoice_date)}</Field>
            <Field label={s.dueDate}>{fmtDate(inv.due_date)}</Field>
            <Field label={s.createdBy}>{inv.created_by ? names[inv.created_by] : null}</Field>
            {inv.status === 'paid' && <>
              <Field label={s.paidDate}>{fmtDate(inv.paid_at)}</Field>
              <Field label={s.paymentRef}>{inv.payment_reference}</Field>
            </>}
            {inv.approved_by && inv.status !== 'draft' && <Field label={inv.status === 'rejected' ? s.reject : s.approve}>{names[inv.approved_by]}{inv.decision_note ? ` – ${inv.decision_note}` : ''}</Field>}
            {inv.notes && <div className="col-span-2 sm:col-span-3"><Field label={s.notes}><span className="whitespace-pre-wrap">{inv.notes}</span></Field></div>}
          </div>
          <div className="bg-white rounded-lg border border-field p-6 text-sm">
            <div className="flex justify-between py-0.5"><span className="text-ink2">{s.subtotal}</span><span>{money(Number(inv.subtotal))}</span></div>
            <div className="flex justify-between py-0.5"><span className="text-ink2">{s.tax} ({Number(inv.tax_rate)} %)</span><span>{money(Number(inv.tax_amount))}</span></div>
            <div className="flex justify-between py-1.5 mt-1 border-t border-field text-lg font-semibold"><span>{s.total}</span><span>{money(Number(inv.total_amount))}</span></div>
            {inv.document_total != null && <div className="flex justify-between text-xs text-gray-400 mt-1"><span>{s.documentTotal}</span><span>{money(Number(inv.document_total))}</span></div>}
          </div>
        </div>
      )}

      {tab === 'lines' && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-field p-5">
            <div className="flex items-center gap-3 flex-wrap mb-2">
              <h2 className="text-sm font-semibold text-gray-700">{s.matching}</h2>
              <span className={`badge ${MATCH_BADGE[result.status]}`}>{s.matchSt[result.status]}</span>
              <span className="text-xs text-gray-400">{s.basis[result.basis]}</span>
            </div>
            {result.issues.length === 0 ? <p className="text-sm text-ink2">—</p> : (
              <ul className="text-sm space-y-0.5">
                {result.issues.map((i, k) => (
                  <li key={k} className={i.severity === 'error' ? 'text-danger' : 'text-warn'}>
                    {i.name ? `${i.name}: ` : ''}{s.issue[i.code]}{i.expected != null ? ` (${i.code === 'total' ? money(i.expected) + ' ≠ ' + money(i.actual ?? 0) : `${i.expected} → ${i.actual}`})` : ''}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white rounded-lg border border-field overflow-hidden">
            <div className="overflow-x-auto"><table className="w-full text-sm min-w-[860px]">
              <thead className="bg-surface border-b border-field"><tr>
                {[s.lineName, s.qty, s.unit, s.unitPrice, s.lineTotal, ...(inv.po_id ? [s.ordered, s.received, s.invoicedBefore, s.orderPrice] : [])].map((h, i) => (
                  <th key={i} className={`px-3 py-2.5 text-xs font-medium text-ink2 ${i === 0 || i === 2 ? 'text-left' : 'text-right'}`}>{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-field">
                {lines.map((l, idx) => {
                  const po = l.po_line_id ? poLineById.get(l.po_line_id) : undefined
                  const issues = result.perLine[idx] ?? []
                  const has = (c: string) => issues.some(i => i.code === c)
                  return (
                    <tr key={l.id}>
                      <td className="px-3 py-2.5">
                        <p className="text-ink">{l.name}</p>
                        {issues.map((i, k) => <p key={k} className="text-xs text-danger mt-0.5">{s.issue[i.code]}</p>)}
                      </td>
                      <td className={`px-3 py-2.5 text-right ${has('qty_over_received') || has('qty_over_ordered') ? 'text-danger' : ''}`}>{l.quantity}</td>
                      <td className="px-3 py-2.5 text-ink2">{l.unit ?? '—'}</td>
                      <td className={`px-3 py-2.5 text-right ${has('price') ? 'text-danger' : ''}`}>{money(l.unit_price)}</td>
                      <td className="px-3 py-2.5 text-right">{money(l.line_total)}</td>
                      {inv.po_id && <>
                        <td className="px-3 py-2.5 text-right text-ink2">{po ? po.quantity : '—'}</td>
                        <td className="px-3 py-2.5 text-right text-ink2">{po ? (match?.received.get(po.id) ?? 0) : '—'}</td>
                        <td className="px-3 py-2.5 text-right text-ink2">{po ? (match?.invoicedElsewhere.get(po.id) ?? 0) : '—'}</td>
                        <td className="px-3 py-2.5 text-right text-ink2">{po ? money(po.unit_price) : '—'}</td>
                      </>}
                    </tr>
                  )
                })}
              </tbody>
            </table></div>
          </div>
        </div>
      )}

      {tab === 'documents' && (
        <div className="bg-white rounded-lg border border-field overflow-hidden">
          {canEdit && (
            <div className="p-4 border-b border-field">
              <input ref={fileRef} type="file" multiple className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx" onChange={e => upload(e.target.files)} />
              <Button variant="secondary" loading={uploading} onClick={() => fileRef.current?.click()} className="gap-2"><Upload className="w-4 h-4" />{s.upload}</Button>
            </div>
          )}
          {docs.length === 0 ? <div className="py-14"><EmptyState icon={FileText} title={s.documents} subtitle={s.noDocuments} /></div> : (
            <ul className="divide-y divide-field">
              {docs.map(d => (
                <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                  <FileText className="w-4 h-4 text-icon shrink-0" />
                  <button onClick={() => openDoc(d)} className="flex-1 min-w-0 text-left text-sm text-ink truncate hover:text-accent">{d.file_name}</button>
                  <button onClick={() => openDoc(d)} className="p-1.5 text-gray-400 hover:text-ink rounded-lg"><Download className="w-3.5 h-3.5" /></button>
                  {canEdit && <button onClick={() => removeDoc(d)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'activity' && (
        <div className="bg-white rounded-lg border border-field p-5">
          {activity.length === 0 ? <p className="text-sm text-gray-400">—</p> : (
            <ul className="space-y-4">
              {activity.map(a => (
                <li key={a.id} className="flex gap-3">
                  <span className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                  <div>
                    <p className="text-sm text-ink"><span className="font-medium">{a.actor_id ? names[a.actor_id] : '—'}</span> · {s.st[a.action as InvoiceStatus] ?? a.action}</p>
                    {a.note && <p className="text-sm text-ink2 mt-0.5">{a.note}</p>}
                    <p className="text-xs text-gray-400 mt-0.5">{format(new Date(a.created_at), 'dd.MM.yyyy HH:mm')}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* approve / reject (note) */}
      <Modal open={dialog === 'approve' || dialog === 'reject'} onClose={() => setDialog(null)} title={dialog === 'reject' ? s.reject : s.approve} size="sm" icon={Check}>
        {dialog === 'approve' && result.status === 'mismatch' && <p className="text-sm text-danger mb-3">{s.noteRequiredMismatch}</p>}
        {dialog === 'reject' && <p className="text-sm text-ink2 mb-3">{s.noteRequiredReject}</p>}
        <textarea rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder={s.decisionNote}
          className="w-full rounded-lg border border-field px-3 py-2 hover:border-field-hover text-sm focus:outline-none focus:border-field-focus resize-none" />
        <ModalActions className="justify-end">
          <Button variant="secondary" onClick={() => setDialog(null)}>{t.common.cancel}</Button>
          <Button variant={dialog === 'reject' ? 'danger' : 'primary'} loading={busy} disabled={needNote && note.trim() === ''}
            onClick={() => rpc(dialog === 'reject' ? 'rejected' : 'approved', { note })}>{dialog === 'reject' ? s.reject : s.approve}</Button>
        </ModalActions>
      </Modal>

      {/* mark paid */}
      <Modal open={dialog === 'pay'} onClose={() => setDialog(null)} title={s.markPaid} size="sm" icon={Coins}>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">{s.paidDate}
            <input type="date" value={paidAt} onChange={e => setPaidAt(e.target.value)} className="rounded-lg border border-field px-3 py-2 text-sm font-normal focus:outline-none hover:border-field-hover" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">{s.paymentRef}
            <input value={payRef} onChange={e => setPayRef(e.target.value)} className="rounded-lg border border-field px-3 py-2 text-sm font-normal focus:outline-none hover:border-field-hover" />
          </label>
        </div>
        <ModalActions className="justify-end">
          <Button variant="secondary" onClick={() => setDialog(null)}>{t.common.cancel}</Button>
          <Button loading={busy} onClick={() => rpc('paid', { paid: paidAt, ref: payRef })}>{s.markPaid}</Button>
        </ModalActions>
      </Modal>

      <ConfirmDialog open={dialog === 'delete'} onClose={() => setDialog(null)} onConfirm={deleteInvoice}
        title={s.deleteTitle} message={s.deleteQuestion} name={inv.invoice_number} danger confirmLabel={t.common.deleteEntity} />
    </div>
  )
}
