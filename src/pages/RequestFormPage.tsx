import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Plus, Trash2, ArrowLeft, ChevronRight, Search, X, Paperclip, FileText, UploadCloud, Send, Hash, IdCard, Package, Tag, Ruler, Coins } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { useLanguage } from '../hooks/useLanguage'
import { useRequired } from '../lib/useRequired'
import { toast } from '../components/ui/Toast'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import GridHead from '../components/ui/GridHead'
import { categoryScope, mainCategoryId } from '../lib/categories'
import CatalogPicker from '../components/ui/CatalogPicker'
import BudgetStatus from '../components/budget/BudgetStatus'
import LineCategoryCells from '../components/ui/LineCategoryCells'
import Modal from '../components/ui/Modal'
import type { Item } from '../types/database'
import { unitLabel, unitCode, unitOptions } from '../lib/units'
import ModalActions from '../components/ui/ModalActions'
import ConfirmDialog from '../components/ui/ConfirmDialog'

interface Line {
  id?: string
  item_id?: string | null
  category_id: string
  /** main category chosen on the line (can be set before a subcategory) */
  main_id?: string
  /** the category was chosen by hand, so the catalog search is narrowed to it */
  scoped?: boolean
  position: number
  name: string
  long_description: string
  quantity: string
  unit: string
  est_unit_price: string
}

interface Header {
  title: string
  supplier_id: string
  supplier_name: string
  location_id: string
  department_id: string
  needed_by_date: string
  note: string
}

const EMPTY: Header = { title: '', supplier_id: '', supplier_name: '', location_id: '', department_id: '', needed_by_date: '', note: '' }
function newLine(position: number): Line { return { position, item_id: null, category_id: '', name: '', long_description: '', quantity: '1', unit: 'kos', est_unit_price: '0' } }

export default function RequestFormPage() {
  const { id } = useParams()
  const isNew = !id
  const { company, profile } = useCompany()
  const { t, lang } = useLanguage()
  const s = t.requests
  const navigate = useNavigate()

  const [header, setHeader] = useState<Header>(EMPTY)
  const [discount, setDiscount] = useState('0')
  const [lines, setLines] = useState<Line[]>([newLine(10)])
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [reqStatus, setReqStatus] = useState<'draft' | 'pending' | 'rejected' | 'approved'>('draft')
  const [submitOpen, setSubmitOpen] = useState(false)
  const [attToDelete, setAttToDelete] = useState<{ id: string; file_path: string; file_name: string } | null>(null)
  const [submitNote, setSubmitNote] = useState('')
  const [attachments, setAttachments] = useState<{ id: string; file_name: string; file_path: string }[]>([])
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)

  const [members, setMembers] = useState<{ id: string; first_name: string; last_name: string }[]>([])
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([])
  const titleReq = useRequired(t.common.fieldRequired)
  const [categories, setCategories] = useState<{ id: string; name: string; parent_id: string | null; status: 'active' | 'inactive' }[]>([])
  const [locations, setLocations] = useState<{ id: string; name: string; address_street: string | null; address_city: string | null; address_postal_code: string | null }[]>([])
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([])
  const [items, setItems] = useState<Item[]>([])

  useEffect(() => { if (company) loadRefs() }, [company])
  useEffect(() => { if (company && id) loadRequest() }, [company, id])

  async function loadRefs() {
    if (!company) return
    const cid = company.id
    const [sup, c, l, d, itm] = await Promise.all([
      supabase.from('suppliers').select('id, name').eq('company_id', cid).eq('status', 'active').order('name'),
      supabase.from('categories').select('id, name, parent_id, status').eq('company_id', cid).order('name'),
      supabase.from('locations').select('id, name, address_street, address_city, address_postal_code').eq('company_id', cid).eq('status', 'active').order('name'),
      supabase.from('departments').select('id, name').eq('company_id', cid).eq('status', 'active').order('name'),
      supabase.from('items').select('*').eq('company_id', cid).eq('status', 'active').order('name'),
    ])
    setSuppliers(sup.data ?? []); setCategories(c.data ?? [])
    setLocations(l.data ?? [])
    // Only one delivery location? Pre-select it for new requests.
    if (!id && l.data?.length === 1) setHeader(h => ({ ...h, location_id: h.location_id || l.data![0].id }))
    setDepartments(d.data ?? []); setItems((itm.data as Item[]) ?? [])
    const { data: us } = await supabase.from('users').select('id, first_name, last_name').eq('company_id', cid)
    setMembers(us ?? [])
  }

  async function loadRequest() {
    const { data: req } = await supabase.from('requests').select('*').eq('id', id!).single()
    if (!req) { toast.error(t.common.notFound); navigate('/requests'); return }
    if (req.status === 'cancelled' || req.po_id) { navigate(`/requests/${id}`); return }
    setReqStatus(req.status)
    setHeader({
      supplier_id: req.supplier_id ?? '', supplier_name: req.supplier_name ?? '',
      location_id: req.location_id ?? '', department_id: req.department_id ?? '',
      title: req.title ?? '', needed_by_date: req.needed_by_date ?? '', note: req.note ?? '',
    })
    setDiscount(String(req.discount_amount ?? 0))
    const { data: atts } = await supabase.from('request_attachments').select('id, file_name, file_path').eq('request_id', id!)
    setAttachments(atts ?? [])
    const { data: ls } = await supabase.from('request_line_items').select('*').eq('request_id', id!).order('position')
    setLines((ls ?? []).map(l => ({ id: l.id, item_id: l.item_id, category_id: l.category_id ?? '', position: l.position, name: l.name, long_description: l.long_description ?? '', quantity: String(l.quantity), unit: l.unit, est_unit_price: String(l.est_unit_price) })))
    setLoading(false)
  }

  function setLine(idx: number, patch: Partial<Line>) { setLines(ls => ls.map((l, i) => i === idx ? { ...l, ...patch } : l)) }
  function addLine() { const maxPos = lines.length ? Math.max(...lines.map(l => l.position)) : 0; setLines(ls => [...ls, newLine(maxPos + 10)]) }
  function removeLine(idx: number) { setLines(ls => ls.filter((_, i) => i !== idx)) }
  function applyItem(idx: number, item: Item) {
    // the catalog stays narrowed to a category the user chose by hand; a category that only came from picking an item does not narrow it
    const ids = categoryScope(lines[idx].main_id ?? mainCategoryId(lines[idx].category_id, categories), lines[idx].category_id, categories)
    const stayScoped = !!lines[idx].scoped && !!ids && ids.has(item.category_id ?? '')
    setLine(idx, {
      scoped: stayScoped,
      item_id: item.id, category_id: item.category_id ?? '', main_id: mainCategoryId(item.category_id, categories), name: item.name, long_description: item.long_description ?? '',
      unit: item.default_unit ? unitLabel(item.default_unit, lang) : lines[idx].unit,
      est_unit_price: item.default_unit_price != null ? String(item.default_unit_price).replace('.', ',') : lines[idx].est_unit_price,
    })
  }

  async function uploadAttachments(reqId: string) {
    if (!newFiles.length || !company) return
    setUploading(true)
    for (const file of newFiles) {
      const path = `${company.id}/requests/${reqId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error } = await supabase.storage.from('quotations').upload(path, file, { upsert: true })
      if (error) { toast.error(`${t.common.uploadPrefix} ${file.name}: ${error.message}`); continue }
      await supabase.from('request_attachments').insert({ request_id: reqId, company_id: company.id, file_path: path, file_name: file.name, file_size: file.size })
    }
    setUploading(false); setNewFiles([])
  }

  async function openAttachment(path: string) {
    const { data } = await supabase.storage.from('quotations').createSignedUrl(path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function deleteAttachment(att: { id: string; file_path: string }) {
    await supabase.storage.from('quotations').remove([att.file_path])
    await supabase.from('request_attachments').delete().eq('id', att.id)
    setAttachments(a => a.filter(x => x.id !== att.id))
  }

  const parseNum = (v: string) => parseFloat(v.replace(',', '.')) || 0
  const numInput = (val: string, onChange: (v: string) => void) => ({
    value: val,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => { if (/^[0-9]*[,.]?[0-9]*$/.test(e.target.value)) onChange(e.target.value) },
  })
  const lineTotal = (l: Line) => parseNum(l.quantity) * parseNum(l.est_unit_price)
  const subtotal = lines.reduce((sum, l) => sum + lineTotal(l), 0)
  const discountAmount = parseNum(discount)
  const grandTotal = Math.max(0, subtotal - discountAmount)
  // what the lines add to each main category (for the budget hint)
  const budgetByCategory: Record<string, number> = {}
  for (const l of lines) { const m = mainCategoryId(l.category_id, categories); if (m) budgetByCategory[m] = (budgetByCategory[m] ?? 0) + lineTotal(l) }
  const fmt = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: company?.currency ?? 'EUR' }).format(n)

  const selectedLoc = locations.find(l => l.id === header.location_id)
  const locationHint = selectedLoc ? [selectedLoc.address_street, [selectedLoc.address_postal_code, selectedLoc.address_city].filter(Boolean).join(' ')].filter(Boolean).join(', ') : undefined

  const approverName = (() => {
    const m = members.find(u => u.id === company?.approver_id)
    return m ? `${m.first_name} ${m.last_name}` : null
  })()

  async function persist(): Promise<string | null> {
    if (!company || !profile) return null
    if (!titleReq.check(header as unknown as Record<string, unknown>, ['title'], { title: 'r-title' })) return null
    if (!header.location_id) { titleReq.setError('location', t.common.fieldRequired, 'r-location'); return null }
    if (lines.length === 0 || lines.some(l => !l.name.trim())) { toast.error(s.lineItems); return null }
    if (lines.some(l => !l.category_id)) { toast.error(s.category + ' *'); return null }

    const linePayload = lines.map((l, i) => ({
      position: (i + 1) * 10, item_id: l.item_id || null, category_id: l.category_id || null, name: l.name.trim(),
      long_description: l.long_description.trim() || null,
      quantity: parseNum(l.quantity) || 1, unit: l.unit || 'kos', est_unit_price: parseNum(l.est_unit_price),
    }))
    const reqFields = {
      title: header.title.trim() || null,
      supplier_id: header.supplier_id || null,
      supplier_name: header.supplier_name.trim() || null,
      location_id: header.location_id || null,
      department_id: header.department_id || null,
      needed_by_date: header.needed_by_date || null,
      note: header.note.trim() || null,
      discount_amount: discountAmount,
      total_estimate: grandTotal,
    }

    if (isNew) {
      const { data: num, error: numErr } = await (supabase as any).rpc('generate_request_number', { p_company_id: company.id })
      if (numErr || !num) { toast.error(t.common.numberGenerateFailed); return null }
      const { data: req, error } = await supabase.from('requests').insert({ company_id: company.id, created_by: profile.id, request_number: num, status: 'draft', ...reqFields }).select().single()
      if (error || !req) { toast.error(error?.message ?? 'Error'); return null }
      await supabase.from('request_line_items').insert(linePayload.map(l => ({ ...l, request_id: req.id })))
      await uploadAttachments(req.id)
      await supabase.from('activity_log').insert({ company_id: company.id, request_id: req.id, actor_id: profile.id, action: 'created' })
      return req.id
    } else {
      const { error } = await supabase.from('requests').update({ ...reqFields, updated_at: new Date().toISOString() }).eq('id', id!)
      if (error) { toast.error(error.message); return null }
      await supabase.from('request_line_items').delete().eq('request_id', id!)
      await supabase.from('request_line_items').insert(linePayload.map(l => ({ ...l, request_id: id! })))
      await uploadAttachments(id!)
      await supabase.from('activity_log').insert({ company_id: company.id, request_id: id!, actor_id: profile.id, action: 'edited' })
      return id!
    }
  }

  async function saveDraft() {
    setSaving(true)
    const reqId = await persist()
    setSaving(false)
    if (reqId) { toast.success(t.common.saved); navigate('/requests') }
  }

  async function doSubmit() {
    setSaving(true)
    const reqId = await persist()
    if (!reqId) { setSaving(false); return }
    const { error } = await (supabase as any).rpc('submit_request', { p_request_id: reqId, p_note: submitNote.trim() || null })
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success(s.submittedToManager)
    navigate(`/requests/${reqId}`)
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>

  // the catalog offered on a line follows the category chosen on it
  const itemsForLine = (l: Line) => {
    const ids = categoryScope(l.main_id ?? mainCategoryId(l.category_id, categories), l.category_id, categories)
    // narrowed only by a category chosen by hand; a category that came from picking an item leaves the whole catalog open
    return ids && l.scoped ? items.filter(i => ids.has(i.category_id ?? '')) : items
  }
  const supplierOptions = [{ value: '', label: s.noSupplier }, ...suppliers.map(x => ({ value: x.id, label: x.name }))]
  const actionButtons = (
    <>
      <Button variant="secondary" onClick={() => navigate(-1)} disabled={saving}>{id ? s.cancelEdit : t.common.cancel}</Button>
      {reqStatus === 'draft' && <Button variant="secondary" onClick={saveDraft} loading={saving}>{s.saveDraft}</Button>}
      <Button onClick={() => { setSubmitNote(''); setSubmitOpen(true) }} loading={saving} className="gap-2"><Send className="w-4 h-4" />{s.submit}</Button>
    </>
  )

  return (
    <div className="p-4 lg:p-6 form-skin">
      <nav className="flex items-center gap-2 text-sm text-ink2 mb-5">
        <button type="button" onClick={() => navigate('/requests')} aria-label={s.title} title={s.title}
          className="w-7 h-7 -ml-1.5 mr-1 inline-flex items-center justify-center rounded-lg text-icon hover:bg-selected hover:text-ink transition-colors">
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
        </button>
        <Link to="/requests" className="hover:text-ink transition-colors">{s.title}</Link>
        <ChevronRight className="w-3.5 h-3.5 text-icon" />
        <span className="text-ink font-medium">{isNew ? s.new : s.edit}</span>
      </nav>

      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <h1 className="text-xl font-semibold text-ink tracking-tight">{isNew ? s.new : s.edit}</h1>
        <div className="hidden lg:flex items-center gap-2">{actionButtons}</div>
      </div>

      <div className="flex flex-col gap-4">
        {/* Request details */}
        <section className="bg-white rounded-lg border border-field">
          <h2 className="px-5 py-3 border-b border-field text-[15px] font-semibold text-ink">{s.detailsTitle}</h2>
          <div className="p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="sm:col-span-2 lg:col-span-4">
                <Input id="r-title" label={s.requestTitle + ' *'} placeholder={s.requestTitlePlaceholder} value={header.title} error={titleReq.errors.title}
                  onChange={e => { titleReq.clear('title'); setHeader(h => ({ ...h, title: e.target.value })) }} />
              </div>
              <Select id="r-supplier" label={s.supplier} value={header.supplier_id} options={supplierOptions} placeholder={s.noSupplier}
                onChange={v => setHeader(h => ({ ...h, supplier_id: v }))} />
              <div>
                <Select id="r-location" label={s.location} required value={header.location_id} placeholder={t.common.select} error={titleReq.errors.location}
                  options={locations.map(l => ({ value: l.id, label: l.name }))}
                  onChange={v => { titleReq.clear('location'); setHeader(h => ({ ...h, location_id: v })) }} />
                {locationHint && <p className="text-xs text-ink2 mt-1.5">{locationHint}</p>}
              </div>
              <Select id="r-department" label={s.department} value={header.department_id} placeholder={t.common.select}
                options={[{ value: '', label: '-' }, ...departments.map(d => ({ value: d.id, label: d.name }))]}
                onChange={v => setHeader(h => ({ ...h, department_id: v }))} />
              <Input id="r-needed" label={s.neededBy} type="date" value={header.needed_by_date} onChange={e => setHeader(h => ({ ...h, needed_by_date: e.target.value }))} />
              <div className="sm:col-span-2 lg:col-span-4 flex flex-col gap-1">
                <label htmlFor="r-note" className="text-sm font-medium text-gray-700">{s.note}</label>
                <textarea id="r-note" rows={3} value={header.note} onChange={e => setHeader(h => ({ ...h, note: e.target.value }))}
                  className="rounded-lg border border-field px-3 py-2 hover:border-field-hover text-sm focus:outline-none focus:border-field-focus resize-none" />
              </div>
            </div>
            {approverName && (
              <p className="mt-4 text-[13px] text-ink2">{s.goesTo} <span className="font-medium text-ink">{approverName}</span></p>
            )}
            {header.department_id && (
              <BudgetStatus className="mt-5 pt-4 border-t border-field" departmentId={header.department_id} amount={grandTotal} byCategory={budgetByCategory} excludeRequestId={id} />
            )}
          </div>
        </section>

        {/* Line items */}
        <section className="bg-white rounded-lg border border-field overflow-hidden">
          <h2 className="px-5 py-3 border-b border-field text-[15px] font-semibold text-ink">{s.lineItems}</h2>
          <div className="overflow-x-auto">
            <table className="table-grid w-full text-sm min-w-[1280px]">
              <GridHead cols={[[t.po.position, Hash], [s.catalog, Search], [s.code, IdCard], [s.itemName, Package], [s.category + ' *', Tag], [t.categories.subcategory + ' *', Tag], [s.quantity, Hash, 'right'], [s.unit, Ruler], [s.estUnitPrice, Coins, 'right'], [s.lineTotal, Coins, 'right'], ['']]} />
              <tbody className="divide-y divide-field">
                {lines.map((line, idx) => (
                  <tr key={idx} className="align-top">
                    <td className="px-4 py-2.5 text-ink2 pt-4 tabular-nums">{idx + 1}</td>
                    <td className="px-3 py-2.5 min-w-[150px]"><CatalogPicker items={itemsForLine(line)} allItems={items} onSelect={item => applyItem(idx, item)} placeholder={t.common.searchCatalog} /></td>
                    <td className="px-4 py-2.5 pt-4 text-ink2 whitespace-nowrap">{line.item_id ? items.find(i => i.id === line.item_id)?.item_number ?? '-' : '-'}</td>
                    <td className="px-3 py-2.5 min-w-[220px]">
                      <input value={line.name} onChange={e => setLine(idx, { name: e.target.value })} placeholder={s.itemPlaceholder}
                        className="w-full h-9 px-3 text-sm font-medium rounded-lg border border-field hover:border-field-hover bg-white text-ink placeholder:text-placeholder placeholder:font-normal focus:outline-none focus:border-field-focus" />
                      <input value={line.long_description} onChange={e => setLine(idx, { long_description: e.target.value })} placeholder={s.descPlaceholder}
                        className="w-full h-9 px-3 mt-2.5 text-sm rounded-lg border border-field hover:border-field-hover bg-white text-ink placeholder:text-placeholder focus:outline-none focus:border-field-focus" />
                    </td>
                    <LineCategoryCells categories={categories} mainId={line.main_id} categoryId={line.category_id} onChange={patch => setLine(idx, { ...patch, scoped: true })} />
                    <td className="px-3 py-2.5 w-24"><input type="text" inputMode="decimal" {...numInput(line.quantity, v => setLine(idx, { quantity: v }))} className="w-full text-sm tabular-nums border border-field rounded-lg hover:border-field-hover px-2 py-1.5 focus:outline-none focus:border-field-focus text-right" /></td>
                    <td className="px-3 py-2.5 w-28">
                      <Select value={unitCode(line.unit) ?? line.unit} options={unitOptions(line.unit, lang)}
                        onChange={v => setLine(idx, { unit: v ? unitLabel(v, lang) : '' })} />
                    </td>
                    <td className="px-3 py-2.5 w-32"><input type="text" inputMode="decimal" {...numInput(line.est_unit_price, v => setLine(idx, { est_unit_price: v }))} className="w-full text-sm tabular-nums border border-field rounded-lg hover:border-field-hover px-2 py-1.5 focus:outline-none focus:border-field-focus text-right" /></td>
                    <td className="px-4 py-2.5 pt-4 text-right text-ink tabular-nums whitespace-nowrap">{fmt(lineTotal(line))}</td>
                    <td className="px-3 py-2.5 pt-3"><button type="button" onClick={() => removeLine(idx)} aria-label={t.common.deleteEntity} className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-icon hover:bg-selected hover:text-danger transition-colors"><Trash2 className="w-4 h-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-field">
            <button type="button" onClick={addLine} className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary-hover font-medium"><Plus className="w-4 h-4" />{s.addItem}</button>
          </div>
          <div className="flex justify-end px-5 py-4 border-t border-field">
            <div className="w-72 flex flex-col gap-2 text-sm">
              {discountAmount > 0 && <div className="flex justify-between"><span className="text-ink2">{s.estTotal}</span><span className="tabular-nums text-ink2">{fmt(subtotal)}</span></div>}
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="r-discount" className="text-ink2">{s.discount} ({company?.currency ?? 'EUR'})</label>
                <input id="r-discount" type="text" inputMode="decimal" {...numInput(discount, setDiscount)} className="w-28 text-sm tabular-nums border border-field rounded-lg hover:border-field-hover px-2 py-1.5 focus:outline-none focus:border-field-focus text-right" />
              </div>
              <div className="flex justify-between items-baseline pt-2 border-t border-field"><span className="font-medium text-ink2">{s.estTotal}</span><span className="text-lg font-semibold text-ink tabular-nums">{fmt(grandTotal)}</span></div>
            </div>
          </div>
        </section>

        {/* Attachments */}
        <section className="bg-white rounded-lg border border-field">
          <h2 className="px-5 py-3 border-b border-field text-[15px] font-semibold text-ink flex items-center gap-1.5"><Paperclip className="w-3.5 h-3.5" />{s.attachOffer}</h2>
          <div className="p-5 flex flex-col gap-2">
            {attachments.map(att => (
              <div key={att.id} className="flex items-center gap-2.5 px-3 py-2 bg-surface rounded-lg">
                <FileText className="w-4 h-4 text-icon shrink-0" strokeWidth={1.75} />
                <button type="button" onClick={() => openAttachment(att.file_path)} className="text-sm text-ink hover:text-primary font-medium flex-1 text-left truncate transition-colors">{att.file_name}</button>
                <button type="button" onClick={() => setAttToDelete(att)} aria-label={t.common.deleteEntity} className="text-icon hover:text-danger transition-colors shrink-0"><X className="w-4 h-4" /></button>
              </div>
            ))}
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
              <span>{s.uploadHint}</span>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" multiple className="hidden"
                onChange={e => { const fl = Array.from(e.target.files ?? []); setNewFiles(fs => [...fs, ...fl]); e.target.value = '' }} />
            </label>
            {uploading && <p className="text-xs text-ink2">{s.uploading}</p>}
          </div>
        </section>

        <div className="hidden lg:flex justify-end gap-2">{actionButtons}</div>
      </div>

      <Modal open={submitOpen} onClose={() => setSubmitOpen(false)} title={s.submitTitle} size="sm" icon={Send}>
        {approverName && <p className="text-sm text-ink2 mb-4">{s.goesTo} <span className="font-medium text-ink">{approverName}</span></p>}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="r-submit-note">{s.submitComment}</label>
          <textarea id="r-submit-note" value={submitNote} onChange={e => setSubmitNote(e.target.value)} rows={3}
            className="rounded-lg border border-field px-3 py-2 hover:border-field-hover text-sm focus:outline-none focus:border-field-focus resize-none" />
        </div>
        <ModalActions className="justify-end">
          <Button variant="secondary" onClick={() => setSubmitOpen(false)}>{t.common.cancel}</Button>
          <Button loading={saving} onClick={() => { setSubmitOpen(false); doSubmit() }}>{s.submit}</Button>
        </ModalActions>
      </Modal>
      <ConfirmDialog open={!!attToDelete} onClose={() => setAttToDelete(null)}
        onConfirm={async () => { if (attToDelete) await deleteAttachment(attToDelete); setAttToDelete(null) }}
        title={t.common.deleteDocTitle} message={t.common.deleteDocQuestion} name={attToDelete?.file_name ?? ''} danger confirmLabel={t.common.deleteEntity} />

    </div>
  )
}
