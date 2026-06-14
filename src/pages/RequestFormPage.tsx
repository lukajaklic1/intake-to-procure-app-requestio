import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Plus, Trash2, ChevronLeft, Search, X, Paperclip, FileText, UploadCloud } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { useLanguage } from '../hooks/useLanguage'
import { toast } from '../components/ui/Toast'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Modal from '../components/ui/Modal'
import type { Item } from '../types/database'

// ─── Catalog search ────────────────────────────────────────────
function ItemSearch({ items, onSelect, placeholder }: { items: Item[]; onSelect: (item: Item) => void; placeholder: string }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const filtered = query.length > 0
    ? items.filter(i => i.name.toLowerCase().includes(query.toLowerCase()) || i.item_number.includes(query))
    : items
  return (
    <div className="relative">
      <div className="flex items-center gap-1 border border-gray-200 rounded-lg bg-white px-2 py-1.5 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent">
        <Search className="w-3 h-3 text-gray-400 shrink-0" />
        <input value={query} onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder} className="text-xs bg-transparent outline-none flex-1 text-gray-600 placeholder-gray-400 min-w-0" />
        {query && <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setQuery('')}><X className="w-3 h-3 text-gray-300" /></button>}
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-30 left-0 mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-lg overflow-y-auto max-h-56">
          {filtered.map(item => (
            <button key={item.id} type="button" onMouseDown={e => e.preventDefault()}
              onClick={() => { onSelect(item); setQuery(''); setOpen(false) }}
              className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors">
              <span className="font-mono text-xs text-gray-400 mr-2">{item.item_number}</span>
              <span className="text-sm font-medium text-gray-800">{item.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Generic search combobox ───────────────────────────────────
function SearchCombobox({ items, value, onChange, label, required, placeholder, emptyText }: {
  items: { id: string; name: string; sub?: string }[]
  value: string; onChange: (id: string) => void; label: string; required?: boolean; placeholder: string; emptyText: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const selected = items.find(i => i.id === value)
  const filtered = query.length > 0 ? items.filter(i => i.name.toLowerCase().includes(query.toLowerCase())) : items
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">{label}{required && ' *'}</label>
      <div className="relative">
        <input value={open ? query : (selected?.name ?? '')}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => { setQuery(''); setOpen(true) }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
        {open && (
          <div className="absolute z-30 left-0 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-y-auto max-h-56">
            {filtered.length > 0 ? filtered.map(item => (
              <button key={item.id} type="button" onMouseDown={e => e.preventDefault()}
                onClick={() => { onChange(item.id); setQuery(''); setOpen(false) }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors ${item.id === value ? 'bg-blue-50 font-medium text-blue-700' : 'text-gray-800'}`}>
                {item.name}{item.sub && <span className="ml-2 text-xs text-gray-400">{item.sub}</span>}
              </button>
            )) : <p className="px-3 py-2 text-sm text-gray-400">{emptyText}</p>}
          </div>
        )}
      </div>
    </div>
  )
}

function Select({ id, label, value, onChange, children, placeholder }: {
  id: string; label: string; value: string; onChange: (v: string) => void; children: React.ReactNode; placeholder: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-gray-700">{label}</label>
      <select id={id} value={value} onChange={e => onChange(e.target.value)}
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
        <option value="">{placeholder}</option>
        {children}
      </select>
    </div>
  )
}

interface Line {
  id?: string
  item_id?: string | null
  position: number
  name: string
  long_description: string
  quantity: string
  unit: string
  est_unit_price: string
}

interface Header {
  project_id: string
  supplier_id: string
  supplier_name: string
  category_id: string
  location_id: string
  department_id: string
  needed_by_date: string
  note: string
}

const EMPTY: Header = { project_id: '', supplier_id: '', supplier_name: '', category_id: '', location_id: '', department_id: '', needed_by_date: '', note: '' }
function newLine(position: number): Line { return { position, item_id: null, name: '', long_description: '', quantity: '1', unit: 'kos', est_unit_price: '0' } }

export default function RequestFormPage() {
  const { id } = useParams()
  const isNew = !id
  const { company, profile } = useCompany()
  const { t } = useLanguage()
  const s = t.requests
  const navigate = useNavigate()

  const [header, setHeader] = useState<Header>(EMPTY)
  const [discount, setDiscount] = useState('0')
  const [lines, setLines] = useState<Line[]>([newLine(10)])
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [reqStatus, setReqStatus] = useState<'draft' | 'pending' | 'rejected' | 'approved'>('draft')
  const [submitOpen, setSubmitOpen] = useState(false)
  const [submitNote, setSubmitNote] = useState('')
  const [attachments, setAttachments] = useState<{ id: string; file_name: string; file_path: string }[]>([])
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)

  const [projects, setProjects] = useState<{ id: string; name: string; project_code?: string | null; manager_id?: string | null }[]>([])
  const [members, setMembers] = useState<{ id: string; first_name: string; last_name: string }[]>([])
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([])
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([])
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([])
  const [items, setItems] = useState<Item[]>([])

  useEffect(() => { if (company) loadRefs() }, [company])
  useEffect(() => { if (company && id) loadRequest() }, [company, id])

  async function loadRefs() {
    if (!company) return
    const cid = company.id
    const [p, sup, c, l, d, itm] = await Promise.all([
      supabase.from('projects').select('id, name, project_code, manager_id').eq('company_id', cid).eq('status', 'active').order('name'),
      supabase.from('suppliers').select('id, name').eq('company_id', cid).eq('status', 'active').order('name'),
      supabase.from('categories').select('id, name').eq('company_id', cid).order('name'),
      supabase.from('locations').select('id, name').eq('company_id', cid).eq('status', 'active').order('name'),
      supabase.from('departments').select('id, name').eq('company_id', cid).order('name'),
      supabase.from('items').select('*').eq('company_id', cid).eq('status', 'active').order('name'),
    ])
    setProjects(p.data ?? []); setSuppliers(sup.data ?? []); setCategories(c.data ?? [])
    setLocations(l.data ?? []); setDepartments(d.data ?? []); setItems((itm.data as Item[]) ?? [])
    const { data: us } = await supabase.from('users').select('id, first_name, last_name').eq('company_id', cid)
    setMembers(us ?? [])
  }

  async function loadRequest() {
    const { data: req } = await supabase.from('requests').select('*').eq('id', id!).single()
    if (!req) { toast.error('Not found'); navigate('/requests'); return }
    if (req.status === 'cancelled' || req.po_id) { navigate(`/requests/${id}`); return }
    setReqStatus(req.status)
    setHeader({
      project_id: req.project_id ?? '', supplier_id: req.supplier_id ?? '', supplier_name: req.supplier_name ?? '',
      category_id: req.category_id ?? '', location_id: req.location_id ?? '', department_id: req.department_id ?? '',
      needed_by_date: req.needed_by_date ?? '', note: req.note ?? '',
    })
    setDiscount(String(req.discount_amount ?? 0))
    const { data: atts } = await supabase.from('request_attachments').select('id, file_name, file_path').eq('request_id', id!)
    setAttachments(atts ?? [])
    const { data: ls } = await supabase.from('request_line_items').select('*').eq('request_id', id!).order('position')
    setLines((ls ?? []).map(l => ({ id: l.id, item_id: l.item_id, position: l.position, name: l.name, long_description: l.long_description ?? '', quantity: String(l.quantity), unit: l.unit, est_unit_price: String(l.est_unit_price) })))
    setLoading(false)
  }

  function setLine(idx: number, patch: Partial<Line>) { setLines(ls => ls.map((l, i) => i === idx ? { ...l, ...patch } : l)) }
  function addLine() { const maxPos = lines.length ? Math.max(...lines.map(l => l.position)) : 0; setLines(ls => [...ls, newLine(maxPos + 10)]) }
  function removeLine(idx: number) { setLines(ls => ls.filter((_, i) => i !== idx)) }
  function applyItem(idx: number, item: Item) {
    setLine(idx, {
      item_id: item.id, name: item.name, long_description: item.long_description ?? '',
      unit: item.default_unit ?? lines[idx].unit,
      est_unit_price: item.default_unit_price != null ? String(item.default_unit_price).replace('.', ',') : lines[idx].est_unit_price,
    })
  }

  async function uploadAttachments(reqId: string) {
    if (!newFiles.length || !company) return
    setUploading(true)
    for (const file of newFiles) {
      const path = `${company.id}/requests/${reqId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error } = await supabase.storage.from('quotations').upload(path, file, { upsert: true })
      if (error) { toast.error(`Upload ${file.name}: ${error.message}`); continue }
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
  const fmt = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: company?.currency ?? 'EUR' }).format(n)

  const approverName = (() => {
    const mid = projects.find(p => p.id === header.project_id)?.manager_id
    if (!mid) return null
    const m = members.find(u => u.id === mid)
    return m ? `${m.first_name} ${m.last_name}` : null
  })()

  async function persist(): Promise<string | null> {
    if (!company || !profile) return null
    if (!header.project_id) { toast.error(s.project + ' *'); return null }
    if (lines.length === 0 || lines.some(l => !l.name.trim())) { toast.error(s.lineItems); return null }

    const linePayload = lines.map((l, i) => ({
      position: (i + 1) * 10, item_id: l.item_id || null, name: l.name.trim(),
      long_description: l.long_description.trim() || null,
      quantity: parseNum(l.quantity) || 1, unit: l.unit || 'kos', est_unit_price: parseNum(l.est_unit_price),
    }))
    const reqFields = {
      project_id: header.project_id,
      supplier_id: header.supplier_id || null,
      supplier_name: header.supplier_name.trim() || null,
      category_id: header.category_id || null,
      location_id: header.location_id || null,
      department_id: header.department_id || null,
      needed_by_date: header.needed_by_date || null,
      note: header.note.trim() || null,
      discount_amount: discountAmount,
      total_estimate: grandTotal,
    }

    if (isNew) {
      const { data: num, error: numErr } = await (supabase as any).rpc('generate_request_number', { p_company_id: company.id })
      if (numErr || !num) { toast.error('Failed to generate number'); return null }
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
    if (reqId) { toast.success(t.common.saved); navigate(`/requests/${reqId}`) }
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

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/requests')} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"><ChevronLeft className="w-5 h-5" /></button>
          <h1 className="text-2xl font-bold text-gray-900">{isNew ? s.new : s.edit}</h1>
        </div>
        <div className="hidden lg:flex items-center gap-2">
          <Button variant="secondary" onClick={() => navigate(-1)} disabled={saving}>{t.common.cancel}</Button>
          {reqStatus === 'draft' && <Button variant="secondary" onClick={saveDraft} loading={saving}>{s.saveDraft}</Button>}
          <Button onClick={() => { setSubmitNote(""); setSubmitOpen(true) }} loading={saving}>{s.submit}</Button>
        </div>
      </div>

      {/* Request details */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">{t.po.orderDetails}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <SearchCombobox items={projects.map(p => ({ id: p.id, name: p.name, sub: p.project_code ?? undefined }))}
            value={header.project_id} onChange={v => setHeader(h => ({ ...h, project_id: v }))} label={s.project} required placeholder={s.selectProject} emptyText={s.noMatch} />
          <SearchCombobox items={suppliers} value={header.supplier_id} onChange={v => setHeader(h => ({ ...h, supplier_id: v }))} label={s.supplier} placeholder={s.noSupplier} emptyText={s.noMatch} />
          <SearchCombobox items={categories} value={header.category_id} onChange={v => setHeader(h => ({ ...h, category_id: v }))} label={s.category} placeholder={t.common.select} emptyText={s.noMatch} />
          <Select id="r-location" label={s.location} value={header.location_id} onChange={v => setHeader(h => ({ ...h, location_id: v }))} placeholder={t.common.select}>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>
          <Select id="r-department" label={s.department} value={header.department_id} onChange={v => setHeader(h => ({ ...h, department_id: v }))} placeholder={t.common.select}>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          <Input id="r-needed" label={s.neededBy} type="date" value={header.needed_by_date} onChange={e => setHeader(h => ({ ...h, needed_by_date: e.target.value }))} />
        </div>

        {approverName && (
          <p className="mt-3 text-xs text-gray-500">{s.goesTo} <span className="font-medium text-gray-700">{approverName}</span></p>
        )}

        <div className="mt-4 flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">{s.note}</label>
          <textarea rows={3} value={header.note} onChange={e => setHeader(h => ({ ...h, note: e.target.value }))}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
        </div>

        {/* Attachments */}
        <div className="mt-4">
          <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5 mb-2"><Paperclip className="w-3.5 h-3.5" />{s.attachOffer}</label>
          {attachments.map(att => (
            <div key={att.id} className="flex items-center gap-2 p-2.5 bg-blue-50 border border-blue-200 rounded-lg mb-2">
              <FileText className="w-4 h-4 text-blue-500 shrink-0" />
              <button type="button" onClick={() => openAttachment(att.file_path)} className="text-sm text-blue-600 hover:underline font-medium flex-1 text-left truncate">{att.file_name}</button>
              <button type="button" onClick={() => deleteAttachment(att)} className="text-gray-400 hover:text-red-500 transition-colors shrink-0"><X className="w-4 h-4" /></button>
            </div>
          ))}
          {newFiles.map((f, i) => (
            <div key={i} className="flex items-center gap-2 p-2.5 bg-green-50 border border-green-200 rounded-lg mb-2">
              <FileText className="w-4 h-4 text-green-500 shrink-0" />
              <span className="text-sm text-green-700 font-medium flex-1 truncate">{f.name}</span>
              <span className="text-xs text-green-500 shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
              <button type="button" onClick={() => setNewFiles(fs => fs.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500 transition-colors shrink-0"><X className="w-4 h-4" /></button>
            </div>
          ))}
          <label className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors w-full">
            <UploadCloud className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="text-sm text-gray-500">{s.uploadHint}</span>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" multiple className="hidden"
              onChange={e => { const fl = Array.from(e.target.files ?? []); setNewFiles(fs => [...fs, ...fl]); e.target.value = '' }} />
          </label>
          {uploading && <p className="text-xs text-blue-500 mt-1">{s.uploading}</p>}
        </div>
      </div>

      {/* Line items */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-5">
        <div className="px-6 py-4 border-b border-gray-100"><h2 className="text-sm font-semibold text-gray-700">{s.lineItems}</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 w-12">{t.po.position}</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">{s.catalog}</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 w-24">{s.code}</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">{s.itemName}</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 w-24">{s.quantity}</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 w-20">{s.unit}</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 w-28">{s.estUnitPrice}</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 w-28">{s.lineTotal}</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {lines.map((line, idx) => (
                <tr key={idx} className="align-top">
                  <td className="px-4 py-2.5 text-gray-400 font-mono text-xs pt-4">{line.position}</td>
                  <td className="px-4 py-2.5 pt-3"><ItemSearch items={items} onSelect={item => applyItem(idx, item)} placeholder={t.common.searchCatalog} /></td>
                  <td className="px-4 py-2.5 pt-3 text-xs font-mono text-gray-400">{line.item_id ? items.find(i => i.id === line.item_id)?.item_number ?? '—' : '—'}</td>
                  <td className="px-4 py-2.5">
                    <input value={line.name} onChange={e => setLine(idx, { name: e.target.value })} placeholder={s.itemPlaceholder}
                      className="w-full text-sm border-0 bg-transparent outline-none text-gray-900 placeholder-gray-300 font-medium focus:ring-0 pb-0.5" />
                    <input value={line.long_description} onChange={e => setLine(idx, { long_description: e.target.value })} placeholder={s.descPlaceholder}
                      className="w-full text-xs border-0 bg-transparent outline-none text-gray-400 placeholder-gray-300 focus:ring-0 mt-0.5" />
                  </td>
                  <td className="px-4 py-2.5 pt-3"><input type="text" inputMode="decimal" {...numInput(line.quantity, v => setLine(idx, { quantity: v }))} className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-right" /></td>
                  <td className="px-4 py-2.5 pt-3"><input value={line.unit} onChange={e => setLine(idx, { unit: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" /></td>
                  <td className="px-4 py-2.5 pt-3"><input type="text" inputMode="decimal" {...numInput(line.est_unit_price, v => setLine(idx, { est_unit_price: v }))} className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-right" /></td>
                  <td className="px-4 py-2.5 pt-3 text-right font-medium text-gray-800">{fmt(lineTotal(line))}</td>
                  <td className="px-2 py-2.5 pt-3"><button type="button" onClick={() => removeLine(idx)} className="p-1 text-gray-300 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button></td>
                </tr>
              ))}
              <tr>
                <td colSpan={9} className="px-4 py-2 border-t border-gray-100 text-right">
                  <button type="button" onClick={addLine} className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium"><Plus className="w-4 h-4" />{s.addItem}</button>
                </td>
              </tr>
            </tbody>
            <tfoot className="border-t border-gray-200 bg-gray-50">
              {discountAmount > 0 && (
                <tr>
                  <td colSpan={7} className="px-4 pt-3 pb-1 text-right text-sm text-gray-500">{s.estTotal}</td>
                  <td className="px-4 pt-3 pb-1 text-right text-sm text-gray-700">{fmt(subtotal)}</td>
                  <td />
                </tr>
              )}
              <tr>
                <td colSpan={7} className="px-4 py-2 text-right text-sm text-gray-500">{s.discount} (€)</td>
                <td className="px-4 py-2 text-right"><input type="text" inputMode="decimal" {...numInput(discount, setDiscount)} className="w-28 text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-right ml-auto block" /></td>
                <td />
              </tr>
              <tr className="border-t-2 border-gray-300">
                <td colSpan={7} className="px-4 py-3 text-right text-sm font-bold text-gray-900">{s.estTotal}</td>
                <td className="px-4 py-3 text-right text-base font-bold text-blue-700">{fmt(grandTotal)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="hidden lg:flex justify-end gap-2">
        <Button variant="secondary" onClick={() => navigate(-1)} disabled={saving}>{t.common.cancel}</Button>
        {reqStatus === 'draft' && <Button variant="secondary" onClick={saveDraft} loading={saving}>{s.saveDraft}</Button>}
        <Button onClick={() => { setSubmitNote(""); setSubmitOpen(true) }} loading={saving}>{s.submit}</Button>
      </div>

      <Modal open={submitOpen} onClose={() => setSubmitOpen(false)} title={s.submitTitle} size="sm">
        <div className="flex flex-col gap-1 mb-4">
          <label className="text-sm font-medium text-gray-700">{s.submitComment}</label>
          <textarea value={submitNote} onChange={e => setSubmitNote(e.target.value)} rows={3}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
        </div>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={() => setSubmitOpen(false)}>{t.common.cancel}</Button>
          <Button loading={saving} onClick={() => { setSubmitOpen(false); doSubmit() }}>{s.submit}</Button>
        </div>
      </Modal>
    </div>
  )
}
