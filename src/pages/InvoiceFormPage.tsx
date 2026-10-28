import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Plus, Trash2, Upload, FileText, Wand2 } from 'lucide-react'
import { addDays, format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { useLanguage } from '../hooks/useLanguage'
import { toast } from '../components/ui/Toast'
import { useRequired } from '../lib/useRequired'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import { computeMatch, invoiceTotals, type InvLine } from '../lib/invoiceMatching'
import { loadMatchData, type MatchData } from '../lib/invoiceData'
import { MATCH_BADGE } from '../lib/invoices'

interface FormLine { key: string; po_line_id: string; name: string; quantity: string; unit: string; unit_price: string }
interface PoOption { id: string; po_number: string; total_amount: number | null; status: string }

const toNum = (v: string) => { const n = Number(v.replace(',', '.')); return Number.isFinite(n) ? n : 0 }
const num2 = (n: number) => String(n).replace('.', ',')
const newLine = (): FormLine => ({ key: Math.random().toString(36).slice(2), po_line_id: '', name: '', quantity: '1', unit: '', unit_price: '0' })
const EMPTY_MATCH: MatchData = { poLines: [], received: new Map(), invoicedElsewhere: new Map() }

export default function InvoiceFormPage() {
  const { id } = useParams<{ id?: string }>()
  const isNew = !id
  const navigate = useNavigate()
  const { company, profile } = useCompany()
  const { t } = useLanguage()
  const s = t.invoices
  const req = useRequired(t.common.fieldRequired)
  const currency = company?.currency ?? 'EUR'
  const money = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(n)

  const [suppliers, setSuppliers] = useState<{ id: string; name: string; payment_terms: string | null }[]>([])
  const [pos, setPos] = useState<PoOption[]>([])
  const [match, setMatch] = useState<MatchData>(EMPTY_MATCH)
  const [header, setHeader] = useState({ supplier_id: '', po_id: '', supplier_invoice_number: '', invoice_date: format(new Date(), 'yyyy-MM-dd'), due_date: '', tax_rate: '22', document_total: '', notes: '' })
  const [lines, setLines] = useState<FormLine[]>([newLine()])
  const [existingDocs, setExistingDocs] = useState<{ id: string; file_name: string; file_path: string }[]>([])
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!company) return
    supabase.from('suppliers').select('id, name, payment_terms').eq('company_id', company.id).eq('status', 'active').order('name').then(({ data }) => setSuppliers(data ?? []))
  }, [company])

  // existing invoice (editing a draft / rejected one)
  useEffect(() => {
    if (!company || isNew) return
    ;(async () => {
      const [{ data: inv }, { data: ls }, { data: at }] = await Promise.all([
        supabase.from('invoices').select('*').eq('id', id!).single(),
        supabase.from('invoice_line_items').select('*').eq('invoice_id', id!).order('position'),
        supabase.from('invoice_attachments').select('id, file_name, file_path').eq('invoice_id', id!),
      ])
      if (!inv) { toast.error(t.common.notFound); navigate('/invoices'); return }
      if (!['draft', 'rejected'].includes(inv.status)) { navigate(`/invoices/${id}`); return }
      setHeader({
        supplier_id: inv.supplier_id, po_id: inv.po_id ?? '', supplier_invoice_number: inv.supplier_invoice_number,
        invoice_date: inv.invoice_date, due_date: inv.due_date ?? '', tax_rate: num2(Number(inv.tax_rate)),
        document_total: inv.document_total != null ? num2(Number(inv.document_total)) : '', notes: inv.notes ?? '',
      })
      setLines((ls ?? []).map(l => ({ key: l.id, po_line_id: l.po_line_id ?? '', name: l.name, quantity: num2(Number(l.quantity)), unit: l.unit ?? '', unit_price: num2(Number(l.unit_price)) })))
      setExistingDocs(at ?? [])
      setLoading(false)
    })()
  }, [company, id])

  // purchase orders of the chosen supplier
  useEffect(() => {
    if (!company || !header.supplier_id) { setPos([]); return }
    supabase.from('purchase_orders').select('id, po_number, total_amount, status').eq('company_id', company.id).eq('supplier_id', header.supplier_id)
      .in('status', ['issued', 'sent', 'closed']).order('created_at', { ascending: false }).then(({ data }) => setPos((data as PoOption[]) ?? []))
  }, [company, header.supplier_id])

  // matching data for the chosen PO
  useEffect(() => {
    if (!header.po_id) { setMatch(EMPTY_MATCH); return }
    loadMatchData(header.po_id, id).then(setMatch)
  }, [header.po_id, id])

  const invLines: InvLine[] = useMemo(() => lines.map(l => ({ po_line_id: l.po_line_id || null, name: l.name, quantity: toNum(l.quantity), unit_price: toNum(l.unit_price) })), [lines])
  const taxRate = toNum(header.tax_rate)
  const totals = useMemo(() => invoiceTotals(invLines, taxRate), [invLines, taxRate])
  const docTotal = header.document_total.trim() === '' ? null : toNum(header.document_total)
  const result = useMemo(() => computeMatch({
    hasPo: !!header.po_id, lines: invLines, poLines: match.poLines, received: match.received, invoicedElsewhere: match.invoicedElsewhere,
    totalAmount: totals.total, documentTotal: docTotal,
  }), [header.po_id, invLines, match, totals.total, docTotal])

  const setH = (k: keyof typeof header, v: string) => setHeader(h => ({ ...h, [k]: v }))
  const setLine = (key: string, patch: Partial<FormLine>) => setLines(ls => ls.map(l => (l.key === key ? { ...l, ...patch } : l)))
  const selectCls = (err?: string) => `rounded-lg border px-3 py-2 text-sm bg-white focus:outline-none ${err ? 'border-red-400' : 'border-field hover:border-field-hover focus:border-field-focus'}`

  function onSupplier(sid: string) {
    req.clear('supplier_id')
    const sup = suppliers.find(x => x.id === sid)
    setHeader(h => ({ ...h, supplier_id: sid, po_id: '' }))
    applyDueFromTerms(sup?.payment_terms ?? null, header.invoice_date)
  }
  function applyDueFromTerms(terms: string | null, invoiceDate: string) {
    const days = terms ? Number((terms.match(/(\d+)/) ?? [])[1]) : NaN
    if (Number.isFinite(days) && invoiceDate) setHeader(h => (h.due_date ? h : { ...h, due_date: format(addDays(new Date(invoiceDate + 'T00:00:00'), days), 'yyyy-MM-dd') }))
  }

  // fill lines from the PO: what was received (or ordered, if nothing is received yet) and not invoiced yet
  function fillFromPo() {
    const anyReceipt = [...match.received.values()].some(q => q > 0)
    const filled = match.poLines.map(pl => {
      const base = anyReceipt ? (match.received.get(pl.id) ?? 0) : pl.quantity
      const qty = Math.max(0, base - (match.invoicedElsewhere.get(pl.id) ?? 0))
      return { key: Math.random().toString(36).slice(2), po_line_id: pl.id, name: pl.name, quantity: num2(qty), unit: pl.unit ?? '', unit_price: num2(pl.unit_price) }
    }).filter(l => toNum(l.quantity) > 0)
    setLines(filled.length ? filled : [newLine()])
  }

  function pickPoLine(key: string, poLineId: string) {
    const pl = match.poLines.find(x => x.id === poLineId)
    if (!pl) { setLine(key, { po_line_id: '' }); return }
    setLine(key, { po_line_id: pl.id, name: pl.name, unit: pl.unit ?? '', unit_price: num2(pl.unit_price) })
  }

  async function persist(submit: boolean) {
    if (!company || !profile) return
    const ok = req.check(header as unknown as Record<string, unknown>, ['supplier_id', 'supplier_invoice_number', 'invoice_date'], { supplier_id: 'i-supplier', supplier_invoice_number: 'i-number', invoice_date: 'i-date' })
    if (!ok) return
    const clean = lines.filter(l => l.name.trim() !== '')
    if (clean.length === 0) { toast.error(s.noLines); return }
    setSaving(true)

    const cleanInv: InvLine[] = clean.map(l => ({ po_line_id: l.po_line_id || null, name: l.name.trim(), quantity: toNum(l.quantity), unit_price: toNum(l.unit_price) }))
    const tot = invoiceTotals(cleanInv, taxRate)
    const res = computeMatch({ hasPo: !!header.po_id, lines: cleanInv, poLines: match.poLines, received: match.received, invoicedElsewhere: match.invoicedElsewhere, totalAmount: tot.total, documentTotal: docTotal })
    const base = {
      supplier_id: header.supplier_id, po_id: header.po_id || null, supplier_invoice_number: header.supplier_invoice_number.trim(),
      invoice_date: header.invoice_date, due_date: header.due_date || null, tax_rate: taxRate,
      subtotal: tot.subtotal, tax_amount: tot.tax, total_amount: tot.total, document_total: docTotal,
      match_status: res.status, match_notes: res.issues.filter(i => i.severity === 'error').map(i => i.code).join(',') || null,
      notes: header.notes.trim() || null,
    }

    let invoiceId = id ?? ''
    if (isNew) {
      const { data, error } = await supabase.from('invoices').insert({ ...base, company_id: company.id, created_by: profile.id, status: 'draft' }).select('id').single()
      if (error || !data) { setSaving(false); toast.error(/duplicate|unique/i.test(error?.message ?? '') ? s.duplicate : (error?.message ?? 'Error')); return }
      invoiceId = data.id
    } else {
      const { error } = await supabase.from('invoices').update({ ...base, updated_at: new Date().toISOString() }).eq('id', invoiceId)
      if (error) { setSaving(false); toast.error(/duplicate|unique/i.test(error.message) ? s.duplicate : error.message); return }
      await supabase.from('invoice_line_items').delete().eq('invoice_id', invoiceId)
    }
    const { error: lineErr } = await supabase.from('invoice_line_items').insert(clean.map((l, i) => ({
      invoice_id: invoiceId, company_id: company.id, po_line_id: l.po_line_id || null, position: (i + 1) * 10,
      name: l.name.trim(), quantity: toNum(l.quantity), unit: l.unit.trim() || null, unit_price: toNum(l.unit_price),
    })))
    if (lineErr) { setSaving(false); toast.error(lineErr.message); return }

    for (const file of newFiles) {
      const path = `${company.id}/invoices/${invoiceId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error } = await supabase.storage.from('quotations').upload(path, file, { upsert: true })
      if (error) { toast.error(`${t.common.uploadPrefix} ${file.name}: ${error.message}`); continue }
      await supabase.from('invoice_attachments').insert({ invoice_id: invoiceId, company_id: company.id, file_path: path, file_name: file.name, file_size: file.size })
    }

    if (submit) {
      const { error } = await supabase.rpc('set_invoice_status', { p_invoice_id: invoiceId, p_status: 'in_review' })
      if (error) { setSaving(false); toast.error(error.message); navigate(`/invoices/${invoiceId}`); return }
    }
    setSaving(false)
    toast.success(t.common.saved)
    navigate(submit ? `/invoices/${invoiceId}` : '/invoices')
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>

  const mismatch = result.status === 'mismatch'

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto form-skin">
      <button onClick={() => navigate(isNew ? '/invoices' : `/invoices/${id}`)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4"><ChevronLeft className="w-4 h-4" />{s.back}</button>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900">{isNew ? s.new : s.editTitle}</h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" loading={saving} onClick={() => persist(false)}>{t.common.saveChanges}</Button>
          <Button loading={saving} onClick={() => persist(true)}>{s.submit}</Button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-field p-6 mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="i-supplier" className="text-sm font-medium text-gray-700">{s.supplier} *</label>
            <select id="i-supplier" value={header.supplier_id} onChange={e => onSupplier(e.target.value)} className={selectCls(req.errors.supplier_id)}>
              <option value="">{t.common.select}</option>
              {suppliers.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            {req.errors.supplier_id && <p className="text-xs text-red-600">{req.errors.supplier_id}</p>}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="i-po" className="text-sm font-medium text-gray-700">{s.po}</label>
            <select id="i-po" value={header.po_id} disabled={!header.supplier_id} onChange={e => setH('po_id', e.target.value)} className={selectCls() + ' disabled:bg-gray-50 disabled:text-gray-400'}>
              <option value="">{s.noPo}</option>
              {pos.map(p => <option key={p.id} value={p.id}>{p.po_number}{p.total_amount != null ? ` · ${money(Number(p.total_amount))}` : ''}</option>)}
            </select>
          </div>
          <Input id="i-number" label={s.supplierInvoiceNo + ' *'} value={header.supplier_invoice_number} error={req.errors.supplier_invoice_number}
            onChange={e => { req.clear('supplier_invoice_number'); setH('supplier_invoice_number', e.target.value) }} />
          <Input id="i-date" label={s.invoiceDate + ' *'} type="date" value={header.invoice_date} error={req.errors.invoice_date}
            onChange={e => { req.clear('invoice_date'); setH('invoice_date', e.target.value) }} />
          <Input id="i-due" label={s.dueDate} type="date" value={header.due_date} onChange={e => setH('due_date', e.target.value)} />
          <Input id="i-doctotal" label={`${s.documentTotal} (${currency})`} placeholder="0,00" value={header.document_total}
            onChange={e => { if (/^[0-9]*[,.]?[0-9]*$/.test(e.target.value)) setH('document_total', e.target.value) }} />
        </div>
        <p className="text-xs text-gray-400 mt-2">{s.documentTotalHint}</p>
      </div>

      {/* Lines */}
      <div className="bg-white rounded-lg border border-field overflow-hidden mb-5">
        <div className="px-5 py-3 border-b border-field flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-gray-700">{s.lines}</h2>
          {header.po_id && <Button variant="secondary" onClick={fillFromPo} title={s.fromPoHint} className="gap-2"><Wand2 className="w-4 h-4" />{s.fromPo}</Button>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead className="bg-surface border-b border-field"><tr>
              {[header.po_id ? s.po : '', s.lineName, s.qty, s.unit, s.unitPrice, s.lineTotal, ''].map((h, i) => <th key={i} className={`px-3 py-2.5 text-xs font-medium text-ink2 ${i >= 2 && i <= 5 && i !== 3 ? 'text-right' : 'text-left'}`}>{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-field">
              {lines.map((l, idx) => {
                const issues = result.perLine[idx] ?? []
                const inputCls = 'w-full text-sm border border-field rounded-lg hover:border-field-hover px-2 py-1.5 focus:outline-none focus:border-field-focus'
                return (
                  <tr key={l.key} className="align-top">
                    <td className="px-3 py-2 w-48">
                      {header.po_id
                        ? <select value={l.po_line_id} onChange={e => pickPoLine(l.key, e.target.value)} className={inputCls + ' bg-white'}>
                            <option value="">—</option>
                            {match.poLines.map(pl => <option key={pl.id} value={pl.id}>{pl.name}</option>)}
                          </select>
                        : null}
                    </td>
                    <td className="px-3 py-2">
                      <input value={l.name} onChange={e => setLine(l.key, { name: e.target.value })} className={inputCls} />
                      {issues.map((i, k) => <p key={k} className={`text-xs mt-1 ${i.severity === 'error' ? 'text-danger' : 'text-warn'}`}>{s.issue[i.code]}{i.expected != null ? ` (${i.expected} → ${i.actual})` : ''}</p>)}
                    </td>
                    <td className="px-3 py-2 w-24"><input value={l.quantity} onChange={e => { if (/^[0-9]*[,.]?[0-9]*$/.test(e.target.value)) setLine(l.key, { quantity: e.target.value }) }} className={inputCls + ' text-right'} /></td>
                    <td className="px-3 py-2 w-20"><input value={l.unit} onChange={e => setLine(l.key, { unit: e.target.value })} className={inputCls} /></td>
                    <td className="px-3 py-2 w-28"><input value={l.unit_price} onChange={e => { if (/^[0-9]*[,.]?[0-9]*$/.test(e.target.value)) setLine(l.key, { unit_price: e.target.value }) }} className={inputCls + ' text-right'} /></td>
                    <td className="px-3 py-2 w-28 text-right pt-3.5">{money(toNum(l.quantity) * toNum(l.unit_price))}</td>
                    <td className="px-2 py-2 w-8 pt-3"><button type="button" onClick={() => setLines(ls => (ls.length > 1 ? ls.filter(x => x.key !== l.key) : ls))} className="p-1 text-gray-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-field flex items-start justify-between gap-6 flex-wrap">
          <button type="button" onClick={() => setLines(ls => [...ls, newLine()])} className="inline-flex items-center gap-1.5 text-sm text-ink2 hover:text-ink"><Plus className="w-4 h-4" />{s.addLine}</button>
          <div className="text-sm min-w-[260px]">
            <div className="flex justify-between py-0.5"><span className="text-ink2">{s.subtotal}</span><span>{money(totals.subtotal)}</span></div>
            <div className="flex justify-between items-center py-0.5">
              <span className="text-ink2 inline-flex items-center gap-2">{s.tax}
                <input value={header.tax_rate} onChange={e => { if (/^[0-9]*[,.]?[0-9]*$/.test(e.target.value)) setH('tax_rate', e.target.value) }} className="w-14 text-right text-xs border border-field rounded-md px-1.5 py-0.5 focus:outline-none" /> %
              </span><span>{money(totals.tax)}</span>
            </div>
            <div className="flex justify-between py-1 mt-1 border-t border-field font-semibold"><span>{s.total}</span><span>{money(totals.total)}</span></div>
          </div>
        </div>
      </div>

      {/* Live matching */}
      <div className="bg-white rounded-lg border border-field p-5 mb-5">
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <h2 className="text-sm font-semibold text-gray-700">{s.matching}</h2>
          <span className={`badge ${MATCH_BADGE[result.status]}`}>{s.matchSt[result.status]}</span>
          <span className="text-xs text-gray-400">{s.basis[result.basis]}</span>
        </div>
        {result.issues.filter(i => i.lineIndex == null).length === 0 && !mismatch
          ? <p className="text-sm text-ink2">—</p>
          : <ul className="text-sm space-y-0.5">
              {result.issues.filter(i => i.lineIndex == null).map((i, k) => (
                <li key={k} className={i.severity === 'error' ? 'text-danger' : 'text-warn'}>{s.issue[i.code]}{i.code === 'total' ? ` (${money(i.expected ?? 0)} ≠ ${money(i.actual ?? 0)})` : ''}</li>
              ))}
            </ul>}
      </div>

      {/* Documents + notes */}
      <div className="bg-white rounded-lg border border-field p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-2">{s.documents}</h2>
            <input ref={fileRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx" className="hidden"
              onChange={e => { setNewFiles(f => [...f, ...Array.from(e.target.files ?? [])]); if (fileRef.current) fileRef.current.value = '' }} />
            <Button variant="secondary" onClick={() => fileRef.current?.click()} className="gap-2"><Upload className="w-4 h-4" />{s.upload}</Button>
            <ul className="mt-3 space-y-1">
              {existingDocs.map(d => <li key={d.id} className="flex items-center gap-2 text-sm text-ink2"><FileText className="w-4 h-4 text-icon" />{d.file_name}</li>)}
              {newFiles.map((f, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-ink"><FileText className="w-4 h-4 text-icon" />{f.name}
                  <button type="button" onClick={() => setNewFiles(fs => fs.filter((_, k) => k !== i))} className="ml-auto text-gray-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button></li>
              ))}
              {existingDocs.length === 0 && newFiles.length === 0 && <li className="text-xs text-gray-400">{s.noDocuments}</li>}
            </ul>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="i-notes" className="text-sm font-medium text-gray-700">{s.notes}</label>
            <textarea id="i-notes" rows={4} value={header.notes} onChange={e => setH('notes', e.target.value)}
              className="rounded-lg border border-field px-3 py-2 hover:border-field-hover text-sm focus:outline-none focus:border-field-focus resize-none" />
          </div>
        </div>
      </div>
    </div>
  )
}
