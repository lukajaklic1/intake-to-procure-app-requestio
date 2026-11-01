import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronRight, Pencil, Trash2, Upload, FileText, Eye, Check, Coins, CircleAlert, TriangleAlert, CircleCheck, Package, Hash, Ruler } from 'lucide-react'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { useLanguage } from '../hooks/useLanguage'
import { toast } from '../components/ui/Toast'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Modal from '../components/ui/Modal'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import ModalActions from '../components/ui/ModalActions'
import GridHead from '../components/ui/GridHead'
import PersonCell from '../components/ui/PersonCell'
import { Card, Field } from '../components/ui/DetailCard'
import { computeMatch, type InvLine } from '../lib/invoiceMatching'
import { loadMatchData, type MatchData } from '../lib/invoiceData'
import { INVOICE_BADGE, MATCH_BADGE, dueState, type InvoiceStatus } from '../lib/invoices'
import { daysUntil } from '../lib/contracts'
import { unitLabel } from '../lib/units'

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

const fmtDate = (d: string | null) => (d ? format(new Date(d + 'T00:00:00'), 'dd.MM.yyyy') : '-')

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { company, isAdmin, hasPerm } = useCompany()
  const { t, lang } = useLanguage()
  const s = t.invoices
  const canEdit = isAdmin || hasPerm('invoices', 'create')
  const canApprove = isAdmin || hasPerm('invoices', 'approve')
  const canPay = isAdmin || hasPerm('invoices', 'pay')
  const currency = company?.currency ?? 'EUR'
  const money = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(n)
  const today = format(new Date(), 'yyyy-MM-dd')

  const [inv, setInv] = useState<Inv | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [docs, setDocs] = useState<Doc[]>([])
  const [activity, setActivity] = useState<Act[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [match, setMatch] = useState<MatchData | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState<null | 'approve' | 'reject' | 'pay' | 'delete'>(null)
  const [removeDocRow, setRemoveDocRow] = useState<Doc | null>(null)
  const [note, setNote] = useState('')
  const [paidAt, setPaidAt] = useState(today)
  const [paidErr, setPaidErr] = useState('')
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
  const dueText = inv.status === 'paid' || inv.status === 'rejected' ? null
    : ds === 'overdue' ? s.overdueBy.replace('{n}', String(Math.abs(dLeft ?? 0)))
    : ds === 'soon' ? (dLeft === 0 ? s.dueToday : s.dueInDays.replace('{n}', String(dLeft)))
    : null

  async function rpc(status: string, opts: { note?: string; paid?: string; ref?: string } = {}) {
    setBusy(true)
    const { error } = await supabase.rpc('set_invoice_status', { p_invoice_id: inv!.id, p_status: status, p_note: opts.note ?? null, p_paid_at: opts.paid ?? null, p_payment_ref: opts.ref ?? null })
    setBusy(false); setDialog(null); setNote('')
    if (error) { toast.error(error.message); return }
    toast.success(s.statusChanged); load()
  }
  function pay() {
    if (!paidAt) { setPaidErr(s.paidDate + ': ' + t.common.fieldRequired); return }
    if (paidAt > today) { setPaidErr(s.paidFuture); return }
    if (paidAt < inv!.invoice_date) { setPaidErr(s.paidBeforeInvoice); return }
    rpc('paid', { paid: paidAt, ref: payRef })
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
  const isOpenForEdit = inv.status === 'draft' || inv.status === 'rejected'
  const issueText = (i: (typeof result.issues)[number]) =>
    `${i.name ? `${i.name}: ` : ''}${s.issue[i.code]}${i.expected != null ? ` (${i.code === 'total' ? `${money(i.expected)} ≠ ${money(i.actual ?? 0)}` : `${i.expected} → ${i.actual}`})` : ''}`

  const actionButtons = (
    <>
      {isOpenForEdit && canEdit && <>
        {inv.status === 'draft' && <Button variant="secondary" onClick={() => setDialog('delete')} className="!px-2.5" aria-label={t.common.deleteEntity}><Trash2 className="w-4 h-4 text-icon" /></Button>}
        <Button variant="secondary" onClick={() => navigate(`/invoices/${inv.id}/edit`)} className="gap-2"><Pencil className="w-4 h-4" />{t.common.editEntity}</Button>
        <Button loading={busy} onClick={() => rpc('in_review')}>{s.submit}</Button>
      </>}
      {inv.status === 'in_review' && canApprove && <>
        <Button variant="secondary" onClick={() => { setNote(''); setDialog('reject') }}>{s.reject}</Button>
        <Button onClick={() => { setNote(''); setDialog('approve') }}>{s.approve}</Button>
      </>}
      {inv.status === 'in_review' && canEdit && !canApprove && <Button variant="secondary" loading={busy} onClick={() => rpc('draft')}>{s.recall}</Button>}
      {inv.status === 'approved' && canPay && <Button onClick={() => { setPaidErr(''); setDialog('pay') }}>{s.markPaid}</Button>}
      {inv.status === 'paid' && isAdmin && <Button variant="secondary" loading={busy} onClick={() => rpc('approved')}>{s.undoPaid}</Button>}
    </>
  )

  return (
    <div className="p-4 lg:p-6">
      <nav className="flex items-center gap-2 text-sm text-ink2 mb-5">
        <button type="button" onClick={() => navigate('/invoices')} aria-label={s.title} title={s.title}
          className="w-7 h-7 -ml-1.5 mr-1 inline-flex items-center justify-center rounded-lg text-icon hover:bg-selected hover:text-ink transition-colors">
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
        </button>
        <Link to="/invoices" className="hover:text-ink transition-colors">{s.title}</Link>
        <ChevronRight className="w-3.5 h-3.5 text-icon" />
        <span className="text-ink font-medium">{inv.supplier_invoice_number}</span>
      </nav>

      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-semibold text-ink tracking-tight">{inv.supplier_invoice_number}</h1>
            <span className={`badge ${INVOICE_BADGE[inv.status]}`}>{s.st[inv.status]}</span>
            <span className={`badge ${MATCH_BADGE[result.status]}`}>{s.matchSt[result.status]}</span>
          </div>
          <p className="mt-2 text-sm text-ink2">{inv.invoice_number} · {inv.suppliers?.name} · {fmtDate(inv.invoice_date)}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">{actionButtons}</div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        {/* left: what is invoiced and whether it is right */}
        <div className="xl:col-span-2 flex flex-col gap-4">
          <Card title={s.matching} action={<span className="text-[13px] text-ink2">{s.basis[result.basis]}</span>}>
            <div className="p-5">
              {result.issues.length === 0 ? (
                <p className="inline-flex items-center gap-2 text-sm text-ink"><CircleCheck className="w-4 h-4 text-success" strokeWidth={1.75} />{s.noMatchIssues}</p>
              ) : (
                <ul className="flex flex-col gap-2 text-sm">
                  {result.issues.map((i, k) => (
                    <li key={k} className={`flex items-start gap-2 ${i.severity === 'error' ? 'text-danger' : 'text-warn'}`}>
                      {i.severity === 'error' ? <CircleAlert className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.75} /> : <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.75} />}
                      <span>{issueText(i)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card title={s.lines} className="overflow-hidden">
            <div className="overflow-x-auto"><table className="table-grid w-full text-sm min-w-[760px]">
              <GridHead cols={[
                [s.lineName, Package], [s.qty, Hash, 'right'], [s.unit, Ruler], [s.unitPrice, Coins, 'right'], [s.lineTotal, Coins, 'right'],
                ...(inv.po_id ? [[s.ordered, Hash, 'right'], [s.received, Hash, 'right'], [s.invoicedBefore, Hash, 'right'], [s.orderPrice, Coins, 'right']] as [string, typeof Hash, 'right'][] : []),
              ]} />
              <tbody className="divide-y divide-field">
                {lines.length === 0 && <tr><td colSpan={9} className="px-4 py-6 text-center text-ink2">{s.noLines}</td></tr>}
                {lines.map((l, idx) => {
                  const po = l.po_line_id ? poLineById.get(l.po_line_id) : undefined
                  const issues = result.perLine[idx] ?? []
                  const has = (c: string) => issues.some(i => i.code === c)
                  return (
                    <tr key={l.id}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-ink">{l.name}</p>
                        {issues.map((i, k) => <p key={k} className="text-xs text-danger mt-0.5">{s.issue[i.code]}</p>)}
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums ${has('qty_over_received') || has('qty_over_ordered') ? 'text-danger font-medium' : 'text-ink2'}`}>{l.quantity}</td>
                      <td className="px-4 py-3 text-ink2">{unitLabel(l.unit, lang) || '-'}</td>
                      <td className={`px-4 py-3 text-right tabular-nums ${has('price') ? 'text-danger font-medium' : 'text-ink2'}`}>{money(l.unit_price)}</td>
                      <td className="px-4 py-3 text-right text-ink tabular-nums">{money(l.line_total)}</td>
                      {inv.po_id && <>
                        <td className="px-4 py-3 text-right text-ink2 tabular-nums">{po ? po.quantity : '-'}</td>
                        <td className="px-4 py-3 text-right text-ink2 tabular-nums">{po ? (match?.received.get(po.id) ?? 0) : '-'}</td>
                        <td className="px-4 py-3 text-right text-ink2 tabular-nums">{po ? (match?.invoicedElsewhere.get(po.id) ?? 0) : '-'}</td>
                        <td className="px-4 py-3 text-right text-ink2 tabular-nums">{po ? money(po.unit_price) : '-'}</td>
                      </>}
                    </tr>
                  )
                })}
              </tbody>
            </table></div>
          </Card>

          {inv.notes && (
            <Card title={s.notes}>
              <p className="p-5 text-sm text-ink whitespace-pre-wrap">{inv.notes}</p>
            </Card>
          )}
        </div>

        {/* right: with whom, when, how much */}
        <div className="flex flex-col gap-4 order-first xl:order-none">
          <Card title={s.invoiceDetails}>
            <div className="p-5 grid grid-cols-2 gap-x-6 gap-y-5">
              <div className="col-span-2"><Field label={s.supplier}>{inv.suppliers?.name}</Field></div>
              <Field label={s.orderLink}>{inv.purchase_orders && <Link to={`/purchase-orders/${inv.purchase_orders.id}`} className="font-medium hover:underline">{inv.purchase_orders.po_number}</Link>}</Field>
              <Field label={s.createdBy}>{inv.created_by && names[inv.created_by] ? <PersonCell name={names[inv.created_by]} /> : null}</Field>
            </div>
          </Card>

          <Card title={s.paymentCard}>
            <div className="p-5 grid grid-cols-2 gap-x-6 gap-y-5">
              <Field label={s.invoiceDate}>{fmtDate(inv.invoice_date)}</Field>
              <Field label={s.dueDate}>
                {inv.due_date ? (
                  <span className={ds === 'overdue' && inv.status !== 'paid' && inv.status !== 'rejected' ? 'text-danger font-medium' : ''}>{fmtDate(inv.due_date)}</span>
                ) : null}
                {dueText && <span className={`block text-xs mt-0.5 ${ds === 'overdue' ? 'text-danger' : 'text-warn'}`}>{dueText}</span>}
              </Field>
              {inv.status === 'paid' && <>
                <Field label={s.paidDate}>{fmtDate(inv.paid_at)}</Field>
                <Field label={s.paymentRef}>{inv.payment_reference}</Field>
              </>}
            </div>
          </Card>

          <Card title={s.amountsCard}>
            <div className="p-5 text-sm flex flex-col gap-2">
              <div className="flex justify-between"><span className="text-ink2">{s.subtotal}</span><span className="tabular-nums text-ink">{money(Number(inv.subtotal))}</span></div>
              <div className="flex justify-between"><span className="text-ink2">{s.tax} ({Number(inv.tax_rate)} %)</span><span className="tabular-nums text-ink">{money(Number(inv.tax_amount))}</span></div>
              <div className="flex justify-between pt-2 mt-1 border-t border-field text-[15px] font-semibold"><span>{s.total}</span><span className="tabular-nums">{money(Number(inv.total_amount))}</span></div>
              {inv.document_total != null && <div className="flex justify-between text-xs text-ink2"><span>{s.documentTotal}</span><span className="tabular-nums">{money(Number(inv.document_total))}</span></div>}
            </div>
          </Card>

          <Card title={s.documents}
            action={canEdit ? (
              <>
                <input ref={fileRef} type="file" multiple className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx" onChange={e => upload(e.target.files)} />
                <Button variant="secondary" loading={uploading} onClick={() => fileRef.current?.click()} className="!h-8 text-[13px] gap-1.5"><Upload className="w-3.5 h-3.5" />{s.upload}</Button>
              </>
            ) : undefined}>
            {docs.length === 0 ? <p className="p-5 text-sm text-ink2">{s.noDocuments}</p> : (
              <ul className="p-5 flex flex-col gap-2">
                {docs.map(d => (
                  <li key={d.id} className="flex items-center gap-2.5 px-3 py-2 bg-surface rounded-lg">
                    <FileText className="w-4 h-4 text-icon shrink-0" strokeWidth={1.75} />
                    <button type="button" onClick={() => openDoc(d)} className="flex-1 min-w-0 text-left text-sm font-medium text-ink truncate hover:text-primary transition-colors">{d.file_name}</button>
                    <button type="button" onClick={() => openDoc(d)} aria-label={s.viewDoc} className="text-icon hover:text-ink transition-colors"><Eye className="w-4 h-4" strokeWidth={1.75} /></button>
                    {canEdit && <button type="button" onClick={() => setRemoveDocRow(d)} aria-label={t.common.deleteEntity} className="text-icon hover:text-danger transition-colors"><Trash2 className="w-4 h-4" strokeWidth={1.75} /></button>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {activity.length > 0 && (
            <Card title={s.activity}>
              <ol className="flex flex-col gap-4 p-5">
                {activity.map((a, i) => {
                  const dot = a.action === 'rejected' ? 'bg-danger' : a.action === 'paid' || a.action === 'approved' ? 'bg-success' : a.action === 'in_review' ? 'bg-warn' : 'bg-icon'
                  return (
                    <li key={a.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span className={`w-2.5 h-2.5 rounded-full ${dot} mt-1.5`} />
                        {i < activity.length - 1 && <span className="flex-1 w-px bg-line mt-1" />}
                      </div>
                      <div className="flex-1 -mt-0.5 min-w-0">
                        <p className="text-sm text-ink"><span className="font-medium">{a.actor_id ? names[a.actor_id] ?? '-' : '-'}</span> {s.act[a.action as InvoiceStatus] ?? a.action}</p>
                        {a.note && <p className="mt-1 pl-3 border-l-2 border-field text-sm text-ink2 whitespace-pre-wrap">{a.note}</p>}
                        <p className="text-xs text-ink2 mt-0.5">{format(new Date(a.created_at), 'dd.MM.yyyy HH:mm')}</p>
                      </div>
                    </li>
                  )
                })}
              </ol>
            </Card>
          )}
        </div>
      </div>

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
        <div className="flex flex-col gap-4">
          <Input id="pay-date" label={s.paidDate + ' *'} type="date" max={today} value={paidAt} error={paidErr}
            onChange={e => { setPaidErr(''); setPaidAt(e.target.value) }} />
          <Input id="pay-ref" label={s.paymentRef} value={payRef} onChange={e => setPayRef(e.target.value)} />
        </div>
        <ModalActions className="justify-end">
          <Button variant="secondary" onClick={() => setDialog(null)}>{t.common.cancel}</Button>
          <Button loading={busy} onClick={pay}>{s.markPaid}</Button>
        </ModalActions>
      </Modal>

      <ConfirmDialog open={dialog === 'delete'} onClose={() => setDialog(null)} onConfirm={deleteInvoice}
        title={s.deleteTitle} message={s.deleteQuestion} name={inv.invoice_number} danger confirmLabel={t.common.deleteEntity} />
      <ConfirmDialog open={!!removeDocRow} onClose={() => setRemoveDocRow(null)}
        onConfirm={async () => { if (removeDocRow) await removeDoc(removeDocRow); setRemoveDocRow(null) }}
        title={t.common.deleteDocTitle} message={t.common.deleteDocQuestion} name={removeDocRow?.file_name ?? ''} danger confirmLabel={t.common.deleteEntity} />
    </div>
  )
}
