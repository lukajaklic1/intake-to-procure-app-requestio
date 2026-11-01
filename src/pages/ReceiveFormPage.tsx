import { useEffect, useState } from 'react'
import { useNavigate, useParams, Navigate, Link } from 'react-router-dom'
import { ArrowLeft, ChevronRight, FileText, UploadCloud, X, Check, Package, Hash, Ruler, PackageCheck, PackageX, CircleAlert } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { useLanguage } from '../hooks/useLanguage'
import { toast } from '../components/ui/Toast'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import GridHead from '../components/ui/GridHead'
import { Card, Field } from '../components/ui/DetailCard'
import { useRequired } from '../lib/useRequired'
import { unitLabel } from '../lib/units'
import { format } from 'date-fns'

interface Line {
  po_line_id: string
  name: string
  unit: string
  ordered: number
  received: number
  receiveNow: string
  rejectNow: string
  /** the line is already fully received: it stays locked until the user adds a surplus on purpose */
  unlocked?: boolean
}

const parseNum = (v: string) => parseFloat(v.replace(',', '.')) || 0
const NUM = /^[0-9]*[,.]?[0-9]*$/

export default function ReceiveFormPage() {
  const { poId } = useParams()
  const { company, profile, isAdmin, hasPerm } = useCompany()
  const { t, lang } = useLanguage()
  const s = t.receipts
  const navigate = useNavigate()
  const canReceive = isAdmin || hasPerm('receipts', 'create')
  const req = useRequired(t.common.fieldRequired)
  const today = format(new Date(), 'yyyy-MM-dd')

  const [po, setPo] = useState<{ po_number: string; supplier: string; location: string | null; due: string | null } | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [receivedDate, setReceivedDate] = useState(today)
  const [supplierReceiptNo, setSupplierReceiptNo] = useState('')
  const [note, setNote] = useState('')
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [tableError, setTableError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (company && poId) load() }, [company, poId])

  async function load() {
    const { data } = await supabase.from('purchase_orders').select('po_number, status, expected_delivery_date, suppliers(name), locations(name)').eq('id', poId!).single()
    const row = data as unknown as { po_number: string; status: string; expected_delivery_date: string | null; suppliers: { name: string } | null; locations: { name: string } | null } | null
    if (!row) { toast.error(t.common.notFound); navigate('/receipts'); return }
    if (row.status !== 'sent') { navigate('/receipts'); return }
    setPo({ po_number: row.po_number, supplier: row.suppliers?.name ?? '-', location: row.locations?.name ?? null, due: row.expected_delivery_date })

    const { data: poLines } = await supabase.from('po_line_items').select('id, name, unit, quantity').eq('po_id', poId!).order('position')
    const ids = (poLines ?? []).map(l => l.id)
    const recvMap: Record<string, number> = {}
    if (ids.length) {
      const { data: rls } = await supabase.from('receipt_line_items').select('po_line_id, quantity_received').in('po_line_id', ids)
      for (const r of rls ?? []) recvMap[r.po_line_id] = (recvMap[r.po_line_id] ?? 0) + Number(r.quantity_received)
    }
    setLines((poLines ?? []).map(l => ({
      po_line_id: l.id, name: l.name, unit: l.unit,
      ordered: Number(l.quantity), received: recvMap[l.id] ?? 0, receiveNow: '', rejectNow: '',
    })))
    setLoading(false)
  }

  const remaining = (l: Line) => Math.max(0, l.ordered - l.received)
  const isLocked = (l: Line) => l.received >= l.ordered && !l.unlocked
  const afterOf = (l: Line) => l.ordered - l.received - parseNum(l.receiveNow)   // negative = more than ordered
  function setField(idx: number, key: 'receiveNow' | 'rejectNow', v: string) {
    if (!NUM.test(v)) return
    setTableError('')
    if (key === 'rejectNow') req.clear('note')
    setLines(ls => ls.map((l, i) => i === idx ? { ...l, [key]: v } : l))
  }
  function unlock(idx: number) { setLines(ls => ls.map((l, i) => i === idx ? { ...l, unlocked: true } : l)) }
  function receiveAll() {
    setTableError('')
    setLines(ls => ls.map(l => { const rem = remaining(l); return { ...l, receiveNow: rem > 0 ? String(rem).replace('.', ',') : '' } }))
  }

  // what the order looks like once this receipt is saved
  const openAfter = lines.filter(l => afterOf(l) > 0).length
  const anyAccepted = lines.some(l => parseNum(l.receiveNow) > 0)
  const anyRejected = lines.some(l => parseNum(l.rejectNow) > 0)

  async function save() {
    if (!company || !profile) return
    if (!receivedDate) { req.setError('date', s.dateRequired, 'r-date'); return }
    if (receivedDate > today) { req.setError('date', s.dateFuture, 'r-date'); return }
    const payload = lines
      .map(l => ({ po_line_id: l.po_line_id, quantity_received: parseNum(l.receiveNow), quantity_rejected: parseNum(l.rejectNow) }))
      .filter(l => l.quantity_received > 0 || l.quantity_rejected > 0)
    if (payload.length === 0) { setTableError(s.nothingToReceive); return }
    // goods sent back need a reason, otherwise a complaint later cannot be backed up
    if (anyRejected && !note.trim()) { req.setError('note', s.reasonRequired, 'r-note'); return }
    setSaving(true)
    const { data: receiptId, error } = await (supabase as any).rpc('create_receipt', {
      p_po_id: poId, p_received_date: receivedDate, p_supplier_receipt_no: supplierReceiptNo.trim() || null,
      p_note: note.trim() || null, p_lines: payload,
    })
    if (error) { setSaving(false); toast.error(error.message); return }
    // upload attachments
    for (let i = 0; i < newFiles.length; i++) {
      const file = newFiles[i]
      const path = `${company.id}/receipts/${receiptId}/${Date.now()}-${i}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error: upErr } = await supabase.storage.from('quotations').upload(path, file, { upsert: true })
      if (!upErr) await supabase.from('receipt_attachments').insert({ receipt_id: receiptId, company_id: company.id, file_path: path, file_name: file.name, file_size: file.size })
    }
    setSaving(false)
    toast.success(s.receiptCreated)
    navigate(`/receipts/${receiptId}`)
  }

  if (loading || !po) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>
  if (!canReceive) return <Navigate to="/receipts" replace />

  const overdue = !!po.due && po.due < today

  return (
    <div className="p-4 lg:p-6 form-skin">
      <nav className="flex items-center gap-2 text-sm text-ink2 mb-5">
        <button type="button" onClick={() => navigate('/receipts')} aria-label={s.title} title={s.title}
          className="w-7 h-7 -ml-1.5 mr-1 inline-flex items-center justify-center rounded-lg text-icon hover:bg-selected hover:text-ink transition-colors">
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
        </button>
        <Link to="/receipts" className="hover:text-ink transition-colors">{s.title}</Link>
        <ChevronRight className="w-3.5 h-3.5 text-icon" />
        <span className="text-ink font-medium">{s.newReceipt}</span>
      </nav>

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink tracking-tight">{s.newReceipt}</h1>
        <p className="mt-2 text-sm text-ink2">{s.fromPo} <Link to={`/purchase-orders/${poId}`} className="text-ink font-medium hover:underline">{po.po_number}</Link> · {po.supplier}</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        {/* left: what arrives */}
        <div className="xl:col-span-2 flex flex-col gap-4">
          <Card title={t.po.lineItems} className="overflow-hidden"
            action={<Button variant="secondary" onClick={receiveAll} className="!h-8 text-[13px]">{s.receiveAll}</Button>}>
            <div className="overflow-x-auto"><table className="table-grid w-full text-sm min-w-[760px]">
              <GridHead cols={[[t.po.description, Package], [s.orderedQty, Hash, 'right'], [s.alreadyReceived, PackageCheck, 'right'], [s.acceptedNow, Check, 'right'], [s.rejectNow, PackageX, 'right'], [s.leftAfter, Ruler, 'right']]} />
              <tbody className="divide-y divide-field">
                {lines.map((l, idx) => {
                  const after = afterOf(l)
                  const rejNow = parseNum(l.rejectNow)
                  const locked = isLocked(l)
                  return (
                    <tr key={l.po_line_id} className={locked ? 'bg-surface/60' : undefined}>
                      <td className="px-4 py-2 text-ink">
                        <span className="font-medium">{l.name}</span>
                        <span className="text-ink2"> · {unitLabel(l.unit, lang) || l.unit}</span>
                      </td>
                      <td className="px-4 py-2 text-right text-ink2 tabular-nums">{l.ordered}</td>
                      <td className="px-4 py-2 text-right text-ink2 tabular-nums">{l.received}</td>
                      <td className="px-3 py-1.5 w-32">
                        <input value={l.receiveNow} onChange={e => setField(idx, 'receiveNow', e.target.value)} inputMode="decimal" placeholder="0" aria-label={s.acceptedNow} disabled={locked}
                          className="w-full text-right rounded-lg border border-field hover:border-field-hover px-2.5 h-8 text-sm tabular-nums focus:outline-none focus:border-field-focus disabled:bg-surface disabled:text-ink2 disabled:cursor-not-allowed" />
                      </td>
                      <td className="px-3 py-1.5 w-32">
                        <input value={l.rejectNow} onChange={e => setField(idx, 'rejectNow', e.target.value)} inputMode="decimal" placeholder="0" aria-label={s.rejectNow} disabled={locked}
                          className={`w-full text-right rounded-lg border px-2.5 h-8 text-sm tabular-nums focus:outline-none disabled:bg-surface disabled:text-ink2 disabled:cursor-not-allowed ${rejNow > 0 ? 'border-danger text-danger' : 'border-field hover:border-field-hover focus:border-field-focus'}`} />
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap">
                        {locked
                          ? <span className="inline-flex items-center gap-2 justify-end"><span className="inline-flex items-center gap-1 text-success"><Check className="w-3.5 h-3.5" strokeWidth={2} />{s.lineComplete}</span><button type="button" onClick={() => unlock(idx)} className="text-[12px] text-ink2 hover:text-ink underline underline-offset-2">{s.allowExtra}</button></span>
                          : after < 0
                          ? <span className="badge badge-warn">{s.overBy.replace('{n}', String(Math.round(-after * 1000) / 1000))}</span>
                          : after === 0
                          ? <span className="inline-flex items-center gap-1 text-success"><Check className="w-3.5 h-3.5" strokeWidth={2} />0</span>
                          : <span className="text-ink">{Math.round(after * 1000) / 1000}</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table></div>
            <div className="px-5 py-3 border-t border-field flex items-start justify-between gap-4 flex-wrap">
              <p className="text-[13px] text-ink2 max-w-xl">{s.rejectHint}</p>
              {(anyAccepted || anyRejected) && (
                <span className={`badge ${openAfter === 0 ? 'badge-success' : 'badge-warn'}`}>
                  {openAfter === 0 ? s.resultFull : s.resultOpen.replace('{n}', String(openAfter))}
                </span>
              )}
            </div>
            {tableError && <p className="px-5 pb-3 -mt-1 text-xs text-red-600 inline-flex items-center gap-1.5"><CircleAlert className="w-3.5 h-3.5" />{tableError}</p>}
          </Card>
        </div>

        {/* right: the delivery itself */}
        <div className="flex flex-col gap-4 order-first xl:order-none">
          <Card title={s.orderCard}>
            <div className="p-5 grid grid-cols-2 gap-x-6 gap-y-5">
              <div className="col-span-2"><Field label={t.po.supplier}>{po.supplier}</Field></div>
              <Field label={s.location}>{po.location}</Field>
              <Field label={s.deliveryDue}>
                {po.due ? <span className={overdue ? 'text-danger font-medium' : ''}>{format(new Date(po.due), 'dd.MM.yyyy')}{overdue ? ` · ${s.overdue}` : ''}</span> : null}
              </Field>
            </div>
          </Card>

          <Card title={s.receiptDetails}>
            <div className="p-5 flex flex-col gap-4">
              <Input id="r-date" label={s.receivedDate + ' *'} type="date" max={today} value={receivedDate} error={req.errors.date}
                onChange={e => { req.clear('date'); setReceivedDate(e.target.value) }} />
              <Input id="r-sup-no" label={s.supplierReceiptNo} value={supplierReceiptNo} onChange={e => setSupplierReceiptNo(e.target.value)} />
              <div className="flex flex-col gap-1">
                <label htmlFor="r-note" className="text-sm font-medium text-gray-700">{s.note}{anyRejected ? ' *' : ''}</label>
                <textarea id="r-note" rows={3} value={note} onChange={e => { req.clear('note'); setNote(e.target.value) }}
                  className={`rounded-lg border px-3 py-2 text-sm focus:outline-none resize-none ${req.errors.note ? 'border-red-500' : 'border-field hover:border-field-hover focus:border-field-focus'}`} />
                {req.errors.note && <p className="text-xs text-red-600">{req.errors.note}</p>}
              </div>
            </div>
          </Card>

          <Card title={s.attachSlip}>
            <div className="p-5 flex flex-col gap-2">
              {newFiles.map((f, i) => (
                <div key={i} className="flex items-center gap-2.5 px-3 py-2 bg-accent-light rounded-lg">
                  <FileText className="w-4 h-4 text-icon shrink-0" strokeWidth={1.75} />
                  <span className="text-sm text-ink font-medium flex-1 truncate">{f.name}</span>
                  <span className="text-xs text-ink2 shrink-0 tabular-nums">{Math.max(1, Math.round(f.size / 1024))} KB</span>
                  <button type="button" onClick={() => setNewFiles(fs => fs.filter((_, j) => j !== i))} aria-label={t.common.cancel} className="text-icon hover:text-danger transition-colors shrink-0"><X className="w-4 h-4" /></button>
                </div>
              ))}
              <label className="flex items-center gap-2 h-10 px-3 rounded-lg border border-dashed border-field cursor-pointer text-sm text-ink2 hover:bg-surface transition-colors w-full">
                <UploadCloud className="w-4 h-4 text-icon shrink-0" />
                <span>{t.po.uploadQuotation}</span>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" multiple className="hidden"
                  onChange={e => { const fl = Array.from(e.target.files ?? []); setNewFiles(fs => [...fs, ...fl]); e.target.value = '' }} />
              </label>
            </div>
          </Card>
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-5">
        <Button variant="secondary" onClick={() => navigate('/receipts')} disabled={saving}>{t.common.cancel}</Button>
        <Button loading={saving} onClick={save}>{s.saveReceipt}</Button>
      </div>
    </div>
  )
}
