import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronRight, Plus, Trash2, UploadCloud, FileText, X, Wand2, CircleAlert, TriangleAlert, Hash, Package, Ruler, Coins, IdCard, Percent } from 'lucide-react'
import { addDays, format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { useLanguage } from '../hooks/useLanguage'
import { toast } from '../components/ui/Toast'
import { useRequired } from '../lib/useRequired'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import GridHead from '../components/ui/GridHead'
import { Card } from '../components/ui/DetailCard'
import DocumentPreview, { type PreviewDoc } from '../components/invoices/DocumentPreview'
import MatchPanel from '../components/invoices/MatchPanel'
import { computeMatch, invoiceTotals, type InvLine } from '../lib/invoiceMatching'
import { loadMatchData, type MatchData } from '../lib/invoiceData'
import { unitCode, unitLabel, unitOptions, unitToStore } from '../lib/units'

interface FormLine { key: string; po_line_id: string; name: string; quantity: string; unit: string; unit_price: string; tax_rate: string }
interface PoOption { id: string; po_number: string; total_amount: number | null; status: string }

const NUM = /^[0-9]*[,.]?[0-9]*$/
const toNum = (v: string) => { const n = Number(v.replace(',', '.')); return Number.isFinite(n) ? n : 0 }
const num2 = (n: number) => String(n).replace('.', ',')
const newLine = (tax: string): FormLine => ({ key: Math.random().toString(36).slice(2), po_line_id: '', name: '', quantity: '1', unit: '', unit_price: '0', tax_rate: tax })
const EMPTY_MATCH: MatchData = { poLines: [], received: new Map(), invoicedElsewhere: new Map() }
const TAX_RATES = ['22', '9,5', '5', '0']
const inputCls = 'w-full text-sm tabular-nums border border-field rounded-lg hover:border-field-hover px-2.5 h-9 focus:outline-none focus:border-field-focus'
const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx'

export default function InvoiceFormPage() {
  const { id } = useParams<{ id?: string }>()
  const isNew = !id
  const navigate = useNavigate()
  const { company, profile } = useCompany()
  const { t, lang } = useLanguage()
  const s = t.invoices
  const req = useRequired(t.common.fieldRequired)
  const currency = company?.currency ?? 'EUR'
  const money = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(n)

  const [suppliers, setSuppliers] = useState<{ id: string; name: string; payment_terms: string | null }[]>([])
  const [pos, setPos] = useState<PoOption[]>([])
  const [match, setMatch] = useState<MatchData>(EMPTY_MATCH)
  // tax_rate is the rate the lines get by default; every line can have its own
  const [header, setHeader] = useState({ supplier_id: '', po_id: '', supplier_invoice_number: '', invoice_date: format(new Date(), 'yyyy-MM-dd'), due_date: '', tax_rate: '22', document_total: '', notes: '' })
  const [dueTouched, setDueTouched] = useState(false)   // once the user types a due date it is no longer derived from the payment terms
  const [lines, setLines] = useState<FormLine[]>([newLine('22')])
  const [linesError, setLinesError] = useState('')
  const [docError, setDocError] = useState('')
  const [existingDocs, setExistingDocs] = useState<{ id: string; file_name: string; file_path: string }[]>([])
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [similar, setSimilar] = useState<{ invoice_number: string; invoice_date: string } | null>(null)
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
      setDueTouched(!!inv.due_date)
      setLines((ls ?? []).map(l => ({ key: l.id, po_line_id: l.po_line_id ?? '', name: l.name, quantity: num2(Number(l.quantity)), unit: l.unit ?? '', unit_price: num2(Number(l.unit_price)), tax_rate: num2(Number(l.tax_rate ?? inv.tax_rate)) })))
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

  const taxRate = toNum(header.tax_rate)
  const invLines: InvLine[] = useMemo(() => lines.map(l => ({ po_line_id: l.po_line_id || null, name: l.name, quantity: toNum(l.quantity), unit_price: toNum(l.unit_price), tax_rate: toNum(l.tax_rate) })), [lines])
  const totals = useMemo(() => invoiceTotals(invLines, taxRate), [invLines, taxRate])
  const docTotal = header.document_total.trim() === '' ? null : toNum(header.document_total)
  const result = useMemo(() => computeMatch({
    hasPo: !!header.po_id, lines: invLines, poLines: match.poLines, received: match.received, invoicedElsewhere: match.invoicedElsewhere,
    totalAmount: totals.total, documentTotal: docTotal,
  }), [header.po_id, invLines, match, totals.total, docTotal])

  // an invoice of the same supplier with the same amount is most likely entered twice (under another number)
  useEffect(() => {
    if (!company || !header.supplier_id) { setSimilar(null); return }
    const amounts = [totals.total, docTotal].filter((n): n is number => n != null && n > 0)
    if (amounts.length === 0) { setSimilar(null); return }
    let cancelled = false
    supabase.from('invoices').select('id, invoice_number, invoice_date').eq('company_id', company.id).eq('supplier_id', header.supplier_id).neq('status', 'rejected').in('total_amount', amounts).limit(5)
      .then(({ data }) => { if (!cancelled) setSimilar((data ?? []).find(r => r.id !== id) ?? null) })
    return () => { cancelled = true }
  }, [company, header.supplier_id, totals.total, docTotal, id])

  const setH = (k: keyof typeof header, v: string) => setHeader(h => ({ ...h, [k]: v }))
  const setLine = (key: string, patch: Partial<FormLine>) => { setLinesError(''); setLines(ls => ls.map(l => (l.key === key ? { ...l, ...patch } : l))) }
  const numField = (val: string, set: (v: string) => void) => ({ value: val, onChange: (e: React.ChangeEvent<HTMLInputElement>) => { if (NUM.test(e.target.value)) set(e.target.value) } })

  // due date follows the supplier's payment terms (e.g. "30 days") until the user sets it by hand
  function dueFromTerms(supplierId: string, invoiceDate: string) {
    const terms = suppliers.find(x => x.id === supplierId)?.payment_terms ?? null
    const days = terms ? Number((terms.match(/(\d+)/) ?? [])[1]) : NaN
    return Number.isFinite(days) && invoiceDate ? format(addDays(new Date(invoiceDate + 'T00:00:00'), days), 'yyyy-MM-dd') : ''
  }
  function onSupplier(sid: string) {
    req.clear('supplier_id')
    setHeader(h => ({ ...h, supplier_id: sid, po_id: '', due_date: dueTouched ? h.due_date : dueFromTerms(sid, h.invoice_date) }))
  }
  function onInvoiceDate(v: string) {
    req.clear('invoice_date'); req.clear('due_date')
    setHeader(h => ({ ...h, invoice_date: v, due_date: dueTouched ? h.due_date : dueFromTerms(h.supplier_id, v) }))
  }
  // the rate for all lines at once; a line can still be changed afterwards
  function onTaxRate(v: string) {
    setH('tax_rate', v)
    setLines(ls => ls.map(l => ({ ...l, tax_rate: v })))
  }

  // fill lines from the PO: what was received (or ordered, if nothing is received yet) and not invoiced yet
  function fillFromPo() {
    const anyReceipt = [...match.received.values()].some(q => q > 0)
    const filled = match.poLines.map(pl => {
      const base = anyReceipt ? (match.received.get(pl.id) ?? 0) : pl.quantity
      const qty = Math.max(0, base - (match.invoicedElsewhere.get(pl.id) ?? 0))
      return { key: Math.random().toString(36).slice(2), po_line_id: pl.id, name: pl.name, quantity: num2(qty), unit: pl.unit ?? '', unit_price: num2(pl.unit_price), tax_rate: header.tax_rate }
    }).filter(l => toNum(l.quantity) > 0)
    setLinesError('')
    setLines(filled.length ? filled : [newLine(header.tax_rate)])
  }

  function pickPoLine(key: string, poLineId: string) {
    const pl = match.poLines.find(x => x.id === poLineId)
    if (!pl) { setLine(key, { po_line_id: '' }); return }
    setLine(key, { po_line_id: pl.id, name: pl.name, unit: pl.unit ?? '', unit_price: num2(pl.unit_price) })
  }

  function addFiles(list: FileList | File[] | null) {
    const picked = Array.from(list ?? [])
    if (picked.length === 0) return
    setDocError('')
    setNewFiles(f => [...f, ...picked])
  }

  async function persist(submit: boolean) {
    if (!company || !profile) return
    const ok = req.check(header as unknown as Record<string, unknown>, ['supplier_id', 'supplier_invoice_number', 'invoice_date'], { supplier_id: 'i-supplier', supplier_invoice_number: 'i-number', invoice_date: 'i-date' })
    if (!ok) return
    if (header.due_date && header.due_date < header.invoice_date) { req.setError('due_date', s.dueBeforeInvoice, 'i-due'); return }
    const clean = lines.filter(l => l.name.trim() !== '')
    if (clean.length === 0) { setLinesError(s.addOneLine); return }
    if (submit && existingDocs.length + newFiles.length === 0) { setDocError(s.documentRequired); toast.error(s.documentRequired); return }
    setSaving(true)

    const cleanInv: InvLine[] = clean.map(l => ({ po_line_id: l.po_line_id || null, name: l.name.trim(), quantity: toNum(l.quantity), unit_price: toNum(l.unit_price), tax_rate: toNum(l.tax_rate) }))
    const tot = invoiceTotals(cleanInv, taxRate)
    const res = computeMatch({ hasPo: !!header.po_id, lines: cleanInv, poLines: match.poLines, received: match.received, invoicedElsewhere: match.invoicedElsewhere, totalAmount: tot.total, documentTotal: docTotal })
    // the rate of the header is the one that carries most of the invoice
    const mainRate = [...tot.byRate].sort((a, b) => b.base - a.base)[0]?.rate ?? taxRate
    const base = {
      supplier_id: header.supplier_id, po_id: header.po_id || null, supplier_invoice_number: header.supplier_invoice_number.trim(),
      invoice_date: header.invoice_date, due_date: header.due_date || null, tax_rate: mainRate,
      subtotal: tot.subtotal, tax_amount: tot.tax, total_amount: tot.total, document_total: docTotal,
      match_status: res.status, match_notes: res.issues.filter(i => i.severity === 'error').map(i => i.code).join(',') || null,
      notes: header.notes.trim() || null,
    }
    const isDuplicate = (msg?: string) => /duplicate|unique/i.test(msg ?? '')

    let invoiceId = id ?? ''
    if (isNew) {
      const { data, error } = await supabase.from('invoices').insert({ ...base, company_id: company.id, created_by: profile.id, status: 'draft' }).select('id').single()
      if (error || !data) {
        setSaving(false)
        if (isDuplicate(error?.message)) req.setError('supplier_invoice_number', s.duplicate, 'i-number')
        else toast.error(error?.message ?? 'Error')
        return
      }
      invoiceId = data.id
    } else {
      const { error } = await supabase.from('invoices').update({ ...base, updated_at: new Date().toISOString() }).eq('id', invoiceId)
      if (error) {
        setSaving(false)
        if (isDuplicate(error.message)) req.setError('supplier_invoice_number', s.duplicate, 'i-number')
        else toast.error(error.message)
        return
      }
      await supabase.from('invoice_line_items').delete().eq('invoice_id', invoiceId)
    }
    const { error: lineErr } = await supabase.from('invoice_line_items').insert(clean.map((l, i) => ({
      invoice_id: invoiceId, company_id: company.id, po_line_id: l.po_line_id || null, position: (i + 1) * 10,
      name: l.name.trim(), quantity: toNum(l.quantity), unit: unitToStore(l.unit), unit_price: toNum(l.unit_price), tax_rate: toNum(l.tax_rate),
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

  const title = isNew ? s.new : s.editTitle
  const hasPo = !!header.po_id
  const taxOptions = (list: string[], cur: string) => (list.includes(cur) ? list : [...list, cur]).map(v => ({ value: v, label: `${v} %` }))
  const previewDocs: PreviewDoc[] = [
    ...existingDocs.map(d => ({ key: d.id, name: d.file_name, path: d.file_path })),
    ...newFiles.map((f, i) => ({ key: `new-${i}-${f.name}`, name: f.name, file: f })),
  ]
  const actionButtons = (
    <>
      <Button variant="secondary" onClick={() => navigate(isNew ? '/invoices' : `/invoices/${id}`)} disabled={saving}>{t.common.cancel}</Button>
      <Button variant="secondary" loading={saving} onClick={() => persist(false)}>{t.po.saveDraft}</Button>
      <Button loading={saving} onClick={() => persist(true)}>{s.submit}</Button>
    </>
  )
  const selectedPo = pos.find(p => p.id === header.po_id)

  return (
    <div className="p-4 lg:p-6 form-skin">
      <nav className="flex items-center gap-2 text-sm text-ink2 mb-5">
        <button type="button" onClick={() => navigate(isNew ? '/invoices' : `/invoices/${id}`)} aria-label={s.title} title={s.title}
          className="w-7 h-7 -ml-1.5 mr-1 inline-flex items-center justify-center rounded-lg text-icon hover:bg-selected hover:text-ink transition-colors">
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
        </button>
        <Link to="/invoices" className="hover:text-ink transition-colors">{s.title}</Link>
        <ChevronRight className="w-3.5 h-3.5 text-icon" />
        <span className="text-ink font-medium">{title}</span>
      </nav>

      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <h1 className="text-xl font-semibold text-ink tracking-tight">{title}</h1>
        <div className="hidden lg:flex items-center gap-2">{actionButtons}</div>
      </div>

      {/* Mobile sticky bottom bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-field px-4 py-3 flex gap-2 shadow-lg">
        <Button variant="secondary" onClick={() => navigate(-1)} disabled={saving} className="flex-1">{t.common.cancel}</Button>
        <Button variant="secondary" loading={saving} onClick={() => persist(false)} className="flex-1">{t.po.saveDraft}</Button>
        <Button loading={saving} onClick={() => persist(true)} className="flex-1">{s.submit}</Button>
      </div>

      <div className="flex flex-col xl:flex-row gap-4 items-start">
        <div className="flex-1 min-w-0 w-full flex flex-col gap-4">
          <Card title={s.invoiceDetails}>
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Select id="i-supplier" label={s.supplier} required value={header.supplier_id} placeholder={t.common.select} error={req.errors.supplier_id}
                options={suppliers.map(x => ({ value: x.id, label: x.name }))} onChange={onSupplier} />
              <Select id="i-po" label={s.po} value={header.po_id} disabled={!header.supplier_id} placeholder={s.noPo}
                options={[{ value: '', label: s.noPo }, ...pos.map(p => ({ value: p.id, label: `${p.po_number}${p.total_amount != null ? ` · ${money(Number(p.total_amount))}` : ''}` }))]}
                onChange={v => setH('po_id', v)} />
              <Input id="i-number" label={s.supplierInvoiceNo + ' *'} value={header.supplier_invoice_number} error={req.errors.supplier_invoice_number}
                onChange={e => { req.clear('supplier_invoice_number'); setH('supplier_invoice_number', e.target.value) }} />
              <Input id="i-doctotal" label={`${s.documentTotal} (${currency})`} inputMode="decimal" placeholder="0,00" {...numField(header.document_total, v => setH('document_total', v))} />
              <Input id="i-date" label={s.invoiceDate + ' *'} type="date" value={header.invoice_date} error={req.errors.invoice_date}
                onChange={e => onInvoiceDate(e.target.value)} />
              <Input id="i-due" label={s.dueDate} type="date" min={header.invoice_date} value={header.due_date} error={req.errors.due_date}
                onChange={e => { req.clear('due_date'); setDueTouched(true); setH('due_date', e.target.value) }} />
              <Select id="i-tax" label={s.vatAll} value={header.tax_rate} options={taxOptions(TAX_RATES, header.tax_rate)} onChange={onTaxRate} />
              <p className="text-xs text-ink2 self-end pb-2.5">{s.documentTotalHint}</p>
              {similar && (
                <p className="sm:col-span-2 lg:col-span-4 flex items-start gap-2 text-[13px] text-warn">
                  <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.75} />
                  {s.similarInvoice.replace('{no}', similar.invoice_number).replace('{date}', format(new Date(similar.invoice_date + 'T00:00:00'), 'dd.MM.yyyy'))}
                </p>
              )}
              <div className="sm:col-span-2 lg:col-span-4 flex flex-col gap-1">
                <label htmlFor="i-notes" className="text-sm font-medium text-gray-700">{s.notes}</label>
                <textarea id="i-notes" rows={2} value={header.notes} onChange={e => setH('notes', e.target.value)}
                  className="rounded-lg border border-field px-3 py-2 hover:border-field-hover text-sm focus:outline-none focus:border-field-focus resize-none" />
              </div>
            </div>
          </Card>

          <Card title={s.lines} className="overflow-hidden"
            action={hasPo ? <Button variant="secondary" onClick={fillFromPo} title={s.fromPoHint} className="!h-8 text-[13px] gap-1.5"><Wand2 className="w-3.5 h-3.5" />{s.fromPo}</Button> : undefined}>
            <div className="overflow-x-auto">
              <table className="table-grid w-full text-sm min-w-[980px]">
                <GridHead cols={[...(hasPo ? [[s.lineOnPo, IdCard]] as [string, typeof IdCard][] : []), [s.lineName, Package], [s.qty, Hash, 'right'], [s.unit, Ruler], [s.unitPrice, Coins, 'right'], [s.vatRate, Percent], [s.lineTotal, Coins, 'right'], ['']]} />
                <tbody className="divide-y divide-field">
                  {lines.map((l, idx) => {
                    const issues = result.perLine[idx] ?? []
                    return (
                      <tr key={l.key} className="align-top">
                        {hasPo && (
                          <td className="px-3 py-2.5 w-52">
                            <Select value={l.po_line_id} placeholder={s.pickOrderLine} options={[{ value: '', label: '-' }, ...match.poLines.map(pl => ({ value: pl.id, label: pl.name }))]} onChange={v => pickPoLine(l.key, v)} />
                          </td>
                        )}
                        <td className="px-3 py-2.5 min-w-[220px]">
                          <input value={l.name} onChange={e => setLine(l.key, { name: e.target.value })} aria-label={s.lineName}
                            className="w-full h-9 px-3 text-sm font-medium rounded-lg border border-field hover:border-field-hover bg-white text-ink focus:outline-none focus:border-field-focus" />
                          {issues.map((i, k) => (
                            <p key={k} className={`text-xs mt-1 ${i.severity === 'error' ? 'text-danger' : 'text-warn'}`}>{s.issue[i.code]}{i.expected != null ? ` (${i.expected} → ${i.actual})` : ''}</p>
                          ))}
                        </td>
                        <td className="px-3 py-2.5 w-24"><input {...numField(l.quantity, v => setLine(l.key, { quantity: v }))} inputMode="decimal" aria-label={s.qty} className={inputCls + ' text-right'} /></td>
                        <td className="px-3 py-2.5 w-32">
                          <Select value={unitCode(l.unit) ?? l.unit} options={unitOptions(l.unit, lang)} onChange={v => setLine(l.key, { unit: v ? unitLabel(v, lang) : '' })} />
                        </td>
                        <td className="px-3 py-2.5 w-32"><input {...numField(l.unit_price, v => setLine(l.key, { unit_price: v }))} inputMode="decimal" aria-label={s.unitPrice} className={inputCls + ' text-right'} /></td>
                        <td className="px-3 py-2.5 w-28">
                          <Select value={l.tax_rate} options={taxOptions(TAX_RATES, l.tax_rate)} onChange={v => setLine(l.key, { tax_rate: v })} />
                        </td>
                        <td className="px-4 py-2.5 pt-4 w-32 text-right text-ink tabular-nums whitespace-nowrap">{money(toNum(l.quantity) * toNum(l.unit_price))}</td>
                        <td className="px-3 py-2.5 pt-3 w-12">
                          <button type="button" onClick={() => setLines(ls => (ls.length > 1 ? ls.filter(x => x.key !== l.key) : ls))} aria-label={t.common.deleteEntity}
                            className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-icon hover:bg-selected hover:text-danger transition-colors"><Trash2 className="w-4 h-4" /></button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 border-t border-field flex items-center justify-between gap-4 flex-wrap">
              <button type="button" onClick={() => setLines(ls => [...ls, newLine(header.tax_rate)])} className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary-hover font-medium"><Plus className="w-4 h-4" />{s.addLine}</button>
              {linesError && <p className="text-xs text-red-600 inline-flex items-center gap-1.5"><CircleAlert className="w-3.5 h-3.5" />{linesError}</p>}
            </div>
            <div className="flex justify-end px-5 py-4 border-t border-field">
              <div className="w-80 flex flex-col gap-2 text-sm">
                <div className="flex justify-between"><span className="text-ink2">{s.subtotal}</span><span className="tabular-nums text-ink">{money(totals.subtotal)}</span></div>
                {totals.byRate.map(g => (
                  <div key={g.rate} className="flex justify-between"><span className="text-ink2">{s.tax} {num2(g.rate)} % <span className="text-xs">({s.base} {money(g.base)})</span></span><span className="tabular-nums text-ink">{money(g.tax)}</span></div>
                ))}
                <div className="flex justify-between pt-2 mt-1 border-t border-field text-[15px] font-semibold"><span>{s.total}</span><span className="tabular-nums">{money(totals.total)}</span></div>
              </div>
            </div>
          </Card>

          <MatchPanel result={result} hasPo={hasPo} input={{ lines: invLines, poLines: match.poLines, received: match.received, invoicedElsewhere: match.invoicedElsewhere }}
            money={money} orderTotal={selectedPo?.total_amount != null ? Number(selectedPo.total_amount) : null} invoiceSubtotal={totals.subtotal} />

          {/* Bottom actions: hidden on mobile (the sticky bar handles it) */}
          <div className="hidden lg:flex justify-end gap-2">{actionButtons}</div>
          <div className="lg:hidden h-16" />
        </div>

        {/* the supplier's invoice next to the data, so it can be read while typing */}
        <div className="w-full xl:w-[480px] xl:shrink-0 xl:sticky xl:top-4"
          onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files) }}>
          <Card title={s.supplierDocument}
            action={<Button variant="secondary" onClick={() => fileRef.current?.click()} className="!h-8 text-[13px] gap-1.5"><UploadCloud className="w-3.5 h-3.5" />{s.addFile}</Button>}>
            <div className="p-4 flex flex-col gap-3">
              <input ref={fileRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={e => { addFiles(e.target.files); if (fileRef.current) fileRef.current.value = '' }} />
              <DocumentPreview docs={previewDocs} height="max(420px, calc(100vh - 330px))"
                empty={<button type="button" onClick={() => fileRef.current?.click()} className="flex flex-col items-center gap-2 hover:text-ink transition-colors"><UploadCloud className="w-7 h-7 text-icon" strokeWidth={1.5} /><span>{s.dropHint}</span></button>} />
              {newFiles.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {newFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-2.5 px-3 py-1.5 bg-accent-light rounded-lg">
                      <FileText className="w-4 h-4 text-icon shrink-0" strokeWidth={1.75} />
                      <span className="text-[13px] text-ink font-medium flex-1 truncate">{f.name}</span>
                      <span className="text-xs text-ink2 shrink-0 tabular-nums">{Math.max(1, Math.round(f.size / 1024))} KB</span>
                      <button type="button" onClick={() => setNewFiles(fs => fs.filter((_, k) => k !== i))} aria-label={t.common.cancel} className="text-icon hover:text-danger transition-colors shrink-0"><X className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              )}
              {docError && <p className="text-xs text-red-600 inline-flex items-center gap-1.5"><CircleAlert className="w-3.5 h-3.5 shrink-0" />{docError}</p>}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
