import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Plus, Trash2, ChevronLeft, Search, X, Paperclip, FileText, UploadCloud } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { useAuth } from '../hooks/useAuth'
import { useLanguage } from '../hooks/useLanguage'
import { toast } from '../components/ui/Toast'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import type { Supplier, Category, Project, Location, Department, Item } from '../types/database'

// ─── Types ───────────────────────────────────────────────────────────────────

interface LineItem {
  id?: string
  item_id?: string | null
  position: number
  name: string
  long_description: string
  quantity: string
  unit: string
  unit_price: string
}

interface POHeader {
  supplier_id: string
  category_id: string
  project_id: string
  location_id: string
  department_id: string
  payment_terms: string
  expected_delivery_date: string
  incoterm: string
  supplier_quote_ref: string
  notes: string
}

const EMPTY_HEADER: POHeader = {
  supplier_id: '', category_id: '', project_id: '', location_id: '', department_id: '',
  payment_terms: '', expected_delivery_date: '', incoterm: '', supplier_quote_ref: '',
  notes: '',
}

function newLine(position: number): LineItem {
  return { position, name: '', long_description: '', quantity: '1', unit: 'kos', unit_price: '0', item_id: null }
}

// ─── Item search component ────────────────────────────────────────────────────

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
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          className="text-xs bg-transparent outline-none flex-1 text-gray-600 placeholder-gray-400 min-w-0"
        />
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
              {item.default_unit && <span className="ml-2 text-xs text-gray-400">{item.default_unit}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Supplier search combobox ─────────────────────────────────────────────────

function SupplierSearch({ suppliers, value, onChange, label, disabled, placeholder }: {
  suppliers: Supplier[]
  value: string
  onChange: (id: string) => void
  label: string
  disabled?: boolean
  placeholder: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const selected = suppliers.find(s => s.id === value)

  const filtered = query.length > 0
    ? suppliers.filter(s => s.name.toLowerCase().includes(query.toLowerCase()))
    : suppliers

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">{label} *</label>
      <div className="relative">
        <input
          value={open ? query : (selected?.name ?? '')}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => { setQuery(''); setOpen(true) }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          readOnly={disabled}
          placeholder={placeholder}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-50"
        />
        {open && !disabled && filtered.length > 0 && (
          <div className="absolute z-30 left-0 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-y-auto max-h-56">
            {filtered.map(s => (
              <button key={s.id} type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => { onChange(s.id); setQuery(''); setOpen(false) }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors ${s.id === value ? 'bg-blue-50 font-medium text-blue-700' : 'text-gray-800'}`}>
                {s.name}
                {s.vat_number && <span className="ml-2 text-xs text-gray-400">{s.vat_number}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Dropdown helper ──────────────────────────────────────────────────────────

function Select({ id, label, value, onChange, required, children }: {
  id: string; label: string; value: string; onChange: (v: string) => void; required?: boolean; children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-gray-700">{label}{required && ' *'}</label>
      <select id={id} value={value} onChange={e => onChange(e.target.value)}
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
        <option value="">Izberi...</option>
        {children}
      </select>
    </div>
  )
}

// ─── Generic search combobox ─────────────────────────────────────────────────

function SearchCombobox({ items, value, onChange, label, required, disabled, placeholder, emptyText }: {
  items: { id: string; name: string; sub?: string }[]
  value: string
  onChange: (id: string) => void
  label: string
  required?: boolean
  disabled?: boolean
  placeholder?: string
  emptyText: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const selected = items.find(i => i.id === value)

  const filtered = query.length > 0
    ? items.filter(i => i.name.toLowerCase().includes(query.toLowerCase()))
    : items

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">{label}{required && ' *'}</label>
      <div className="relative">
        <input
          value={open ? query : (selected?.name ?? '')}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => { setQuery(''); setOpen(true) }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          readOnly={disabled}
          placeholder={placeholder ?? 'Izberi...'}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        />
        {open && !disabled && (
          <div className="absolute z-30 left-0 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-y-auto max-h-56">
            {filtered.length > 0 ? filtered.map(item => (
              <button key={item.id} type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => { onChange(item.id); setQuery(''); setOpen(false) }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors ${item.id === value ? 'bg-blue-50 font-medium text-blue-700' : 'text-gray-800'}`}>
                {item.name}
                {item.sub && <span className="ml-2 text-xs text-gray-400">{item.sub}</span>}
              </button>
            )) : (
              <p className="px-3 py-2 text-sm text-gray-400">{emptyText}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function POFormPage() {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const { company } = useCompany()
  const { t } = useLanguage()
  const s = t.po
  const { session } = useAuth()

  const isNew = !id
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [poStatus, setPoStatus] = useState<string>('draft')
  const [poNumber, setPoNumber] = useState<string | null>(null)

  const [header, setHeader] = useState<POHeader>(EMPTY_HEADER)
  const [lines, setLines] = useState<LineItem[]>([newLine(10)])
  const [discount, setDiscount] = useState<string>('0')

  // Attachments
  interface Attachment { id: string; file_name: string; file_path: string }
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [uploadingFiles, setUploadingFiles] = useState(false)

  // Reference data
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [items, setItems] = useState<Item[]>([])

  useEffect(() => {
    if (company) { loadRefs(); if (!isNew) loadPO() }
  }, [company, id])

  async function loadRefs() {
    if (!company) return
    const cid = company.id
    const [s, cat, proj, loc, dept, itm] = await Promise.all([
      supabase.from('suppliers').select('*').eq('company_id', cid).eq('status', 'active').order('name'),
      supabase.from('categories').select('*').eq('company_id', cid).order('name'),
      supabase.from('projects').select('*').eq('company_id', cid).eq('status', 'active').order('name'),
      supabase.from('locations').select('*').eq('company_id', cid).eq('status', 'active').order('name'),
      supabase.from('departments').select('*').eq('company_id', cid).order('name'),
      supabase.from('items').select('*').eq('company_id', cid).eq('status', 'active').order('name'),
    ])
    setSuppliers(s.data ?? [])
    setCategories(cat.data ?? [])
    setProjects(proj.data ?? [])
    setLocations(loc.data ?? [])
    setDepartments(dept.data ?? [])
    setItems(itm.data ?? [])
  }

  async function loadPO() {
    if (!id) return
    setLoading(true)
    const { data: po } = await supabase.from('purchase_orders').select('*').eq('id', id).single()
    if (!po) { toast.error(t.po.title + ' ni najdeno'); navigate('/purchase-orders'); return }

    setPoStatus(po.status)
    setPoNumber(po.po_number)
    setHeader({
      supplier_id: po.supplier_id ?? '',
      category_id: po.category_id ?? '',
      project_id: po.project_id ?? '',
      location_id: po.location_id ?? '',
      department_id: po.department_id ?? '',
      payment_terms: po.payment_terms ?? '',
      expected_delivery_date: po.expected_delivery_date ?? '',
      incoterm: po.incoterm ?? '',
      supplier_quote_ref: po.supplier_quote_ref ?? '',
      notes: po.notes ?? '',
    })

    setDiscount(String(po.discount_amount ?? 0))

    const { data: atts } = await supabase.from('po_attachments').select('id, file_name, file_path').eq('po_id', id!)
    setAttachments(atts ?? [])

    const { data: lineData } = await supabase.from('po_line_items').select('*').eq('po_id', id).order('position')
    setLines((lineData ?? []).map(l => ({
      id: l.id,
      item_id: l.item_id,
      position: l.position,
      name: l.name,
      long_description: l.long_description ?? '',
      quantity: String(l.quantity),
      unit: l.unit,
      unit_price: String(l.unit_price),
    })))
    setLoading(false)
  }

  const isReadOnly = ['closed', 'cancelled'].includes(poStatus)
  const isSent = poStatus === 'sent'

  function setLine(idx: number, patch: Partial<LineItem>) {
    setLines(ls => ls.map((l, i) => i === idx ? { ...l, ...patch } : l))
  }

  function addLine() {
    const maxPos = lines.length > 0 ? Math.max(...lines.map(l => l.position)) : 0
    setLines(ls => [...ls, newLine(maxPos + 10)])
  }

  function removeLine(idx: number) {
    setLines(ls => ls.filter((_, i) => i !== idx))
  }

  function applyItem(idx: number, item: Item) {
    setLine(idx, {
      item_id: item.id,
      name: item.name,
      long_description: item.long_description ?? '',
      unit: item.default_unit ?? lines[idx].unit,
      unit_price: item.default_unit_price != null ? String(item.default_unit_price).replace('.', ',') : lines[idx].unit_price,
    })
  }

  // Accept both comma and dot as decimal separator
  function parseNum(v: string) {
    return parseFloat(v.replace(',', '.')) || 0
  }

  function numericInput(val: string, onChange: (v: string) => void) {
    return {
      value: val,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value
        if (/^[0-9]*[,.]?[0-9]*$/.test(v)) onChange(v)
      },
    }
  }

  function lineTotal(l: LineItem) {
    return parseNum(l.quantity) * parseNum(l.unit_price)
  }

  const subtotal = lines.reduce((s, l) => s + lineTotal(l), 0)
  const discountAmount = parseNum(discount)
  const grandTotal = Math.max(0, subtotal - discountAmount)

  function fmt(n: number) {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: company?.currency ?? 'EUR' }).format(n)
  }

  function validate() {
    if (!header.supplier_id) { toast.error(t.common.nameRequired); return false }
    if (!header.category_id) { toast.error(t.common.nameRequired); return false }
    if (!header.project_id) { toast.error(t.common.nameRequired); return false }
    if (!header.location_id) { toast.error(t.common.nameRequired); return false }
    if (!header.payment_terms.trim()) { toast.error(t.common.nameRequired); return false }
    if (!header.expected_delivery_date) { toast.error(t.common.nameRequired); return false }
    if (lines.length === 0) { toast.error(t.po.lineItems); return false }
    if (lines.some(l => !l.name.trim())) { toast.error('All line items must have a name'); return false }
    return true
  }

  async function uploadAttachments(poId: string) {
    if (!newFiles.length || !company) return
    setUploadingFiles(true)
    for (const file of newFiles) {
      const path = `${company.id}/${poId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error } = await supabase.storage.from('quotations').upload(path, file, { upsert: true })
      if (error) { toast.error(`Upload ${file.name}: ${error.message}`); continue }
      await supabase.from('po_attachments').insert({ po_id: poId, company_id: company.id, file_path: path, file_name: file.name, file_size: file.size })
    }
    setUploadingFiles(false)
    setNewFiles([])
  }

  async function openAttachment(path: string) {
    const { data } = await supabase.storage.from('quotations').createSignedUrl(path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function deleteAttachment(att: { id: string; file_path: string }) {
    await supabase.storage.from('quotations').remove([att.file_path])
    await supabase.from('po_attachments').delete().eq('id', att.id)
    setAttachments(a => a.filter(x => x.id !== att.id))
  }

  function addFiles(files: FileList | null) {
    if (!files) return
    const arr = Array.from(files)
    setNewFiles(f => [...f, ...arr])
  }

  async function save(targetStatus = poStatus) {
    if (!validate() || !company || !session) return
    setSaving(true)

    const linePayload = lines.map(l => ({
      position: l.position,
      item_id: l.item_id || null,
      name: l.name,
      long_description: l.long_description || null,
      quantity: parseNum(l.quantity) || 1,
      unit: l.unit,
      unit_price: parseNum(l.unit_price),
    }))

    if (isNew) {
      // Generate PO number atomically
      const { data: poNum, error: numErr } = await (supabase as any).rpc('generate_po_number', { p_company_id: company.id })
      if (numErr || !poNum) { toast.error('Failed to generate PO number'); setSaving(false); return }

      const { data: po, error: poErr } = await supabase.from('purchase_orders').insert({
        company_id: company.id,
        created_by: session.user.id,
        po_number: poNum,
        status: targetStatus,
        total_amount: grandTotal,
        ...header,
        department_id: header.department_id || null,
        incoterm: header.incoterm || null,
        supplier_quote_ref: header.supplier_quote_ref || null,
        notes: header.notes || null,
        discount_amount: discountAmount,
      }).select().single()

      if (poErr || !po) { toast.error(poErr?.message ?? t.common.nameRequired); setSaving(false); return }

      if (linePayload.length > 0) {
        await supabase.from('po_line_items').insert(linePayload.map(l => ({ ...l, po_id: po.id })))
      }

      await uploadAttachments(po.id)

      const log: { company_id: string; po_id: string; actor_id: string; action: string }[] = [
        { company_id: company.id, po_id: po.id, actor_id: session.user.id, action: 'created' },
      ]
      if (targetStatus === 'issued') log.push({ company_id: company.id, po_id: po.id, actor_id: session.user.id, action: 'issued' })
      await supabase.from('po_activity_log').insert(log)

      toast.success(targetStatus === 'draft' ? t.common.saved : t.po.newPO + ' ' + poNum)
      navigate(targetStatus === 'draft' ? '/purchase-orders' : `/purchase-orders/${po.id}`)
    } else {
      // Update PO
      const { error: poErr } = await supabase.from('purchase_orders').update({
        status: targetStatus,
        total_amount: grandTotal,
        updated_at: new Date().toISOString(),
        ...header,
        department_id: header.department_id || null,
        incoterm: header.incoterm || null,
        supplier_quote_ref: header.supplier_quote_ref || null,
        notes: header.notes || null,
        discount_amount: discountAmount,
      }).eq('id', id)
      if (poErr) { toast.error(poErr.message); setSaving(false); return }

      await uploadAttachments(id!)

      // Replace line items
      await supabase.from('po_line_items').delete().eq('po_id', id)
      if (linePayload.length > 0) {
        await supabase.from('po_line_items').insert(linePayload.map(l => ({ ...l, po_id: id })))
      }

      // Audit: status transition (e.g. draft -> issued) or a plain edit
      const action = targetStatus !== poStatus ? targetStatus : 'edited'
      await supabase.from('po_activity_log').insert({ company_id: company.id, po_id: id!, actor_id: session.user.id, action })

      toast.success(t.common.saved)
      // Osnutek → seznam, ostalo → view
      navigate(targetStatus === 'draft' ? '/purchase-orders' : `/purchase-orders/${id}`)
    }
    setSaving(false)
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
  }

  const title = isNew ? t.po.newPO : `${t.common.edit} ${poNumber}`

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto pb-28 lg:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/purchase-orders')} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
            {isReadOnly && <p className="text-xs text-red-500 mt-0.5">{s.readOnlyNote}</p>}
            {isSent && <p className="text-xs text-amber-600 mt-0.5">{s.sentNote}</p>}
          </div>
        </div>

        {/* Desktop buttons */}
        {!isReadOnly && (
          <div className="hidden lg:flex items-center gap-2">
            <Button variant="secondary" onClick={() => navigate(-1)} disabled={saving}>{t.common.cancel}</Button>
            {(poStatus === 'draft' || isNew) && (
              <Button variant="secondary" onClick={() => save('draft')} loading={saving}>
                {t.po.saveDraft}
              </Button>
            )}
            <Button onClick={() => save(isSent ? 'sent' : poStatus === 'draft' || isNew ? 'issued' : poStatus)} loading={saving}>
              {poStatus === 'draft' || isNew ? t.po.issuePO : t.common.saveChanges}
            </Button>
          </div>
        )}
      </div>

      {/* Mobile sticky bottom bar */}
      {!isReadOnly && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200 px-4 py-3 flex gap-2 shadow-lg">
          <Button variant="secondary" onClick={() => navigate(-1)} disabled={saving} className="flex-1">{t.common.cancel}</Button>
          {(poStatus === 'draft' || isNew) && (
            <Button variant="secondary" onClick={() => save('draft')} loading={saving} className="flex-1">
              {t.po.saveDraft}
            </Button>
          )}
          <Button onClick={() => save(isSent ? 'sent' : poStatus === 'draft' || isNew ? 'issued' : poStatus)} loading={saving} className="flex-1">
            {poStatus === 'draft' || isNew ? t.po.issuePO : t.common.saveChanges}
          </Button>
        </div>
      )}

      {/* Header fields */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">{t.po.orderDetails}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <SupplierSearch
            suppliers={suppliers}
            value={header.supplier_id}
            onChange={v => setHeader(h => ({ ...h, supplier_id: v }))}
            label={s.supplier}
            disabled={isReadOnly}
            placeholder={t.common.search + '…'}
          />
          <SearchCombobox
            items={categories.map(c => ({ id: c.id, name: c.name }))}
            value={header.category_id}
            onChange={v => setHeader(h => ({ ...h, category_id: v }))}
            label={s.category}
            required
            disabled={isReadOnly}
            placeholder={t.common.search + '…'}
            emptyText={s.noResults}
          />
          <SearchCombobox
            items={projects.map(p => ({ id: p.id, name: p.name, sub: p.project_code ?? undefined }))}
            value={header.project_id}
            onChange={v => setHeader(h => ({ ...h, project_id: v }))}
            label={s.project}
            required
            disabled={isReadOnly}
            placeholder={t.common.search + '…'}
            emptyText={s.noResults}
          />
          <Select id="location" label={s.location + ' *'} required value={header.location_id} onChange={v => setHeader(h => ({ ...h, location_id: v }))}>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>
          <Select id="department" label={s.department} value={header.department_id} onChange={v => setHeader(h => ({ ...h, department_id: v }))}>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          <Input id="payment_terms" label={s.paymentTermsLabel + ' *'}
            value={header.payment_terms}
            onChange={e => setHeader(h => ({ ...h, payment_terms: e.target.value }))}
            readOnly={isReadOnly}
          />
          <Input id="delivery_date" label={s.desiredDelivery + ' *'} type="date"
            value={header.expected_delivery_date}
            onChange={e => setHeader(h => ({ ...h, expected_delivery_date: e.target.value }))}
            readOnly={isReadOnly}
          />
          <Input id="incoterm" label={s.incoterm}
            value={header.incoterm}
            onChange={e => setHeader(h => ({ ...h, incoterm: e.target.value }))}
            placeholder="CPT, FOB, EXW"
            readOnly={isReadOnly}
          />
          <Input id="quote_ref" label={s.quoteRef}
            value={header.supplier_quote_ref}
            onChange={e => setHeader(h => ({ ...h, supplier_quote_ref: e.target.value }))}
            readOnly={isReadOnly}
          />
        </div>

        <div className="mt-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">{s.notes}</label>
            <textarea rows={3} value={header.notes}
              onChange={e => setHeader(h => ({ ...h, notes: e.target.value }))}
              readOnly={isReadOnly}
              placeholder={s.notesPlaceholder}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        </div>

        {/* Attachments */}
        <div className="mt-4">
          <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5 mb-2">
            <Paperclip className="w-3.5 h-3.5" />
            {t.po.attachQuotation}
          </label>

          {/* Saved attachments */}
          {attachments.map(att => (
            <div key={att.id} className="flex items-center gap-2 p-2.5 bg-blue-50 border border-blue-200 rounded-lg mb-2">
              <FileText className="w-4 h-4 text-blue-500 shrink-0" />
              <button type="button" onClick={() => openAttachment(att.file_path)}
                className="text-sm text-blue-600 hover:underline font-medium flex-1 text-left truncate">
                {att.file_name}
              </button>
              {!isReadOnly && (
                <button type="button" onClick={() => deleteAttachment(att)}
                  className="text-gray-400 hover:text-red-500 transition-colors shrink-0">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}

          {/* New files queued for upload */}
          {newFiles.map((f, i) => (
            <div key={i} className="flex items-center gap-2 p-2.5 bg-green-50 border border-green-200 rounded-lg mb-2">
              <FileText className="w-4 h-4 text-green-500 shrink-0" />
              <span className="text-sm text-green-700 font-medium flex-1 truncate">{f.name}</span>
              <span className="text-xs text-green-500 shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
              <button type="button" onClick={() => setNewFiles(fs => fs.filter((_, j) => j !== i))}
                className="text-gray-400 hover:text-red-500 transition-colors shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}

          {/* Upload drop zone */}
          {!isReadOnly && (
            <label className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors w-full">
              <UploadCloud className="w-4 h-4 text-gray-400 shrink-0" />
              <span className="text-sm text-gray-500">{t.po.uploadQuotation}</span>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" multiple className="hidden"
                onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
            </label>
          )}
          {uploadingFiles && <p className="text-xs text-blue-500 mt-1">{s.uploading}</p>}
        </div>
      </div>

      {/* Line items */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-5">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">{t.po.lineItems}</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 w-12">{t.po.position}</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">{s.catalog}</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 w-24">{s.code}</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Ime / Opis</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 w-24">Kol.</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 w-20">EM</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 w-28">Cena/EM</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 w-28">Skupaj</th>
                {!isReadOnly && <th className="w-8" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {lines.map((line, idx) => (
                <tr key={idx} className="align-top">
                  <td className="px-4 py-2.5 text-gray-400 font-mono text-xs pt-4">{line.position}</td>
                  <td className="px-4 py-2.5 pt-3">
                    {!isReadOnly && <ItemSearch items={items} onSelect={item => applyItem(idx, item)} placeholder={t.common.searchCatalog} />}
                  </td>
                  <td className="px-4 py-2.5 pt-3 text-xs font-mono text-gray-400">
                    {line.item_id ? items.find(i => i.id === line.item_id)?.item_number ?? '—' : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <input
                      value={line.name}
                      onChange={e => setLine(idx, { name: e.target.value })}
                      readOnly={isReadOnly}
                      placeholder={s.itemNamePlaceholder}
                      className="w-full text-sm border-0 bg-transparent outline-none text-gray-900 placeholder-gray-300 font-medium focus:ring-0 pb-0.5"
                    />
                    <input
                      value={line.long_description}
                      onChange={e => setLine(idx, { long_description: e.target.value })}
                      readOnly={isReadOnly}
                      placeholder={s.descPlaceholder}
                      className="w-full text-xs border-0 bg-transparent outline-none text-gray-400 placeholder-gray-300 focus:ring-0 mt-0.5"
                    />
                  </td>
                  <td className="px-4 py-2.5 pt-3">
                    <input
                      type="text" inputMode="decimal"
                      {...numericInput(line.quantity, v => setLine(idx, { quantity: v }))}
                      readOnly={isReadOnly}
                      className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-right"
                    />
                  </td>
                  <td className="px-4 py-2.5 pt-3">
                    <input
                      value={line.unit}
                      onChange={e => setLine(idx, { unit: e.target.value })}
                      readOnly={isReadOnly}
                      className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-4 py-2.5 pt-3">
                    <input
                      type="text" inputMode="decimal"
                      {...numericInput(line.unit_price, v => setLine(idx, { unit_price: v }))}
                      readOnly={isReadOnly}
                      className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-right"
                    />
                  </td>
                  <td className="px-4 py-2.5 pt-3 text-right font-medium text-gray-800">
                    {fmt(lineTotal(line))}
                  </td>
                  {!isReadOnly && (
                    <td className="px-2 py-2.5 pt-3">
                      <button type="button" onClick={() => removeLine(idx)}
                        className="p-1 text-gray-300 hover:text-red-500 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {!isReadOnly && (
                <tr>
                  <td colSpan={8} className="px-4 py-2 border-t border-gray-100 text-right">
                    <button type="button" onClick={addLine} className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium">
                      <Plus className="w-4 h-4" />{s.addLine}
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="border-t border-gray-200 bg-gray-50">
              {/* Subtotal */}
              {discountAmount > 0 && (
                <tr>
                  <td colSpan={6} className="px-4 pt-3 pb-1 text-right text-sm text-gray-500">
                    {s.subtotal}
                  </td>
                  <td className="px-4 pt-3 pb-1 text-right text-sm text-gray-700">
                    {fmt(subtotal)}
                  </td>
                  {!isReadOnly && <td />}
                </tr>
              )}
              {/* Discount row */}
              <tr>
                <td colSpan={6} className="px-4 py-2 text-right text-sm text-gray-500">
                  {s.discount} (€)
                </td>
                <td className="px-4 py-2 text-right">
                  {isReadOnly ? (
                    <span className="text-sm font-semibold text-blue-600">
                      {discountAmount > 0 ? `- ${fmt(discountAmount)}` : '—'}
                    </span>
                  ) : (
                    <input
                      type="text" inputMode="decimal"
                      {...numericInput(discount, setDiscount)}
                      className="w-28 text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-right ml-auto block"
                    />
                  )}
                </td>
                {!isReadOnly && <td />}
              </tr>
              {/* Grand total */}
              <tr className="border-t-2 border-gray-300">
                <td colSpan={6} className="px-4 py-3 text-right text-sm font-bold text-gray-900">
                  {s.totalExVat}
                </td>
                <td className="px-4 py-3 text-right text-base font-bold text-blue-700">
                  {fmt(grandTotal)}
                </td>
                {!isReadOnly && <td />}
              </tr>
            </tfoot>
          </table>
        </div>

      </div>

      {/* Bottom actions — hidden on mobile (sticky bar handles it) */}
      {!isReadOnly && (
        <div className="hidden lg:flex justify-end gap-2">
          <Button variant="secondary" onClick={() => navigate(-1)} disabled={saving}>{t.common.cancel}</Button>
          {(poStatus === 'draft' || isNew) && (
            <Button variant="secondary" onClick={() => save('draft')} loading={saving}>
              {t.po.saveDraft}
            </Button>
          )}
          <Button onClick={() => save(isSent ? 'sent' : poStatus === 'draft' || isNew ? 'issued' : poStatus)} loading={saving}>
            {poStatus === 'draft' || isNew ? t.po.issuePO : t.common.saveChanges}
          </Button>
        </div>
      )}
    </div>
  )
}
