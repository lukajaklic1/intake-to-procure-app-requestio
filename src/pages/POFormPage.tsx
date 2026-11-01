import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Plus, Trash2, ArrowLeft, ChevronRight, Search, X, Paperclip, FileText, UploadCloud, Hash, IdCard, Package, Tag, Ruler, Coins } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { useAuth } from '../hooks/useAuth'
import { useLanguage } from '../hooks/useLanguage'
import { toast } from '../components/ui/Toast'
import Button from '../components/ui/Button'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import GridHead from '../components/ui/GridHead'
import CatalogPicker from '../components/ui/CatalogPicker'
import BudgetStatus from '../components/budget/BudgetStatus'
import LineCategoryCells from '../components/ui/LineCategoryCells'
import { categoryScope, mainCategoryId } from '../lib/categories'
import type { Supplier, Category, Location, Department, Item, Contract } from '../types/database'
import { unitLabel, unitCode, unitOptions } from '../lib/units'
import { incotermOptions } from '../lib/incoterms'
import { effectiveStatus } from '../lib/contracts'
import { createPoFromRequest } from '../lib/createPo'

// ─── Types ───────────────────────────────────────────────────────────────────

interface LineItem {
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
  unit_price: string
}

interface POHeader {
  supplier_id: string
  contract_id: string
  location_id: string
  department_id: string
  payment_terms: string
  expected_delivery_date: string
  incoterm: string
  supplier_quote_ref: string
  notes: string
}

const EMPTY_HEADER: POHeader = {
  supplier_id: '', contract_id: '', location_id: '', department_id: '',
  payment_terms: '', expected_delivery_date: '', incoterm: '', supplier_quote_ref: '',
  notes: '',
}

function newLine(position: number): LineItem {
  return { position, name: '', long_description: '', quantity: '1', unit: 'kos', unit_price: '0', item_id: null, category_id: '' }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function POFormPage() {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  // an order opened from an approved request is prefilled from it and only created when it is saved
  const fromRequestId = useSearchParams()[0].get('fromRequest')
  const fromSourcingId = useSearchParams()[0].get('fromSourcing')   // an awarded sourcing event: supplier, items and prices come from it
  const { company } = useCompany()
  const { t, lang } = useLanguage()
  const s = t.po
  const { session } = useAuth()

  const isNew = !id
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [poStatus, setPoStatus] = useState<string>('draft')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [attToDelete, setAttToDelete] = useState<{ id: string; file_path: string; file_name: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [poNumber, setPoNumber] = useState<string | null>(null)

  const [header, setHeader] = useState<POHeader>(EMPTY_HEADER)
  const [lines, setLines] = useState<LineItem[]>([newLine(10)])
  const [discount, setDiscount] = useState<string>('0')
  // extra discount agreed by procurement: internal, for tracking savings, never on the order document
  const [negotiated, setNegotiated] = useState<string>('')

  // Attachments
  interface Attachment { id: string; file_name: string; file_path: string }
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [uploadingFiles, setUploadingFiles] = useState(false)

  // Reference data
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [contracts, setContracts] = useState<Pick<Contract, 'id' | 'title' | 'contract_number' | 'supplier_id' | 'status' | 'end_date' | 'notice_days' | 'notice_given_at' | 'auto_renew'>[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [refsLoaded, setRefsLoaded] = useState(false)
  const [requestAtts, setRequestAtts] = useState<{ id: string; file_name: string; file_path: string }[]>([])
  const prefilled = useRef(false)
  // Agreed prices of the selected contract (item id -> price): they take the place of the catalog price.
  const [contractPrices, setContractPrices] = useState<Map<string, number>>(new Map())

  useEffect(() => {
    if (company) { loadRefs(); if (!isNew) loadPO() }
  }, [company, id])

  useEffect(() => {
    if (!isNew || !fromRequestId || !refsLoaded || !company || prefilled.current) return
    prefilled.current = true
    ;(async () => {
      const { data: r } = await supabase.from('requests').select('*').eq('id', fromRequestId).single()
      if (!r || r.po_id || r.status !== 'approved') { toast.error(t.common.notFound); navigate('/requests'); return }
      const [{ data: ls }, { data: at }] = await Promise.all([
        supabase.from('request_line_items').select('*').eq('request_id', fromRequestId).order('position'),
        supabase.from('request_attachments').select('id, file_name, file_path').eq('request_id', fromRequestId),
      ])
      const sup = suppliers.find(x => x.id === r.supplier_id)
      const usable = r.supplier_id ? usableContracts(r.supplier_id) : []
      setHeader({
        ...EMPTY_HEADER, supplier_id: r.supplier_id ?? '', location_id: r.location_id ?? '', department_id: r.department_id ?? '',
        payment_terms: sup?.payment_terms ?? '', incoterm: sup?.incoterm ?? '', expected_delivery_date: r.needed_by_date ?? '',
        notes: r.note ?? '', contract_id: usable.length === 1 ? usable[0].id : '',
      })
      setDiscount(String(r.discount_amount ?? 0).replace('.', ','))
      setLines((ls ?? []).map(l => ({
        item_id: l.item_id, category_id: l.category_id ?? '', position: l.position, name: l.name, long_description: l.long_description ?? '',
        quantity: String(l.quantity), unit: l.unit, unit_price: String(l.est_unit_price ?? 0).replace('.', ','),
      })))
      setRequestAtts(at ?? [])
    })()
  }, [isNew, fromRequestId, refsLoaded, company])

  // from an awarded sourcing event: the winner's supplier, the items and the prices of the offer
  useEffect(() => {
    if (!isNew || !fromSourcingId || !refsLoaded || !company || prefilled.current) return
    prefilled.current = true
    ;(async () => {
      const { data: ev } = await supabase.from('sourcing_events').select('*').eq('id', fromSourcingId).single()
      if (!ev || ev.status !== 'awarded' || !ev.awarded_invitation_id) { toast.error(t.common.notFound); navigate('/sourcing'); return }
      const [{ data: inv }, { data: its }, { data: bid }] = await Promise.all([
        supabase.from('sourcing_invitations').select('supplier_id').eq('id', ev.awarded_invitation_id).single(),
        supabase.from('sourcing_items').select('*').eq('event_id', ev.id).order('position'),
        supabase.from('sourcing_bids').select('id, delivery_days, payment_terms').eq('invitation_id', ev.awarded_invitation_id).eq('round', ev.current_round).maybeSingle(),
      ])
      const { data: bl } = bid ? await supabase.from('sourcing_bid_lines').select('item_id, unit_price').eq('bid_id', bid.id) : { data: [] as { item_id: string; unit_price: number | null }[] }
      const sup = suppliers.find(x => x.id === inv?.supplier_id)
      const usable = inv?.supplier_id ? usableContracts(inv.supplier_id) : []
      const days = bid?.delivery_days
      setHeader({
        ...EMPTY_HEADER, supplier_id: inv?.supplier_id ?? '', location_id: ev.location_id ?? '', department_id: ev.department_id ?? '',
        payment_terms: bid?.payment_terms ?? sup?.payment_terms ?? '', incoterm: sup?.incoterm ?? '',
        expected_delivery_date: days != null ? new Date(Date.now() + days * 86400000).toISOString().slice(0, 10) : '',
        notes: ev.event_number + ' - ' + ev.title, contract_id: usable.length === 1 ? usable[0].id : '',
      })
      setLines((its ?? []).filter(i => (bl ?? []).some(l => l.item_id === i.id && l.unit_price != null)).map((i, idx) => ({
        item_id: i.item_id, category_id: i.category_id ?? '', position: (idx + 1) * 10, name: i.name, long_description: i.description ?? '',
        quantity: String(i.quantity), unit: i.unit ?? '', unit_price: String((bl ?? []).find(l => l.item_id === i.id)?.unit_price ?? 0).replace('.', ','),
      })))
    })()
  }, [isNew, fromSourcingId, refsLoaded, company])

  useEffect(() => {
    if (!header.contract_id) { setContractPrices(new Map()); return }
    let cancelled = false
    supabase.from('contract_items').select('item_id, agreed_price').eq('contract_id', header.contract_id).then(({ data }) => {
      if (!cancelled) setContractPrices(new Map((data ?? []).map(r => [r.item_id as string, Number(r.agreed_price)])))
    })
    return () => { cancelled = true }
  }, [header.contract_id])

  /** Contracts of a supplier that can still be used for an order: active and not past their end date. */
  function usableContracts(supplierId: string, keepId?: string) {
    // valid contracts, also while in their notice period or close to expiry; not drafts, terminated ones or those that have ended (also by notice)
    return contracts.filter(c => c.supplier_id === supplierId && (c.id === keepId || ['active', 'expiring', 'in_notice'].includes(effectiveStatus(c))))
  }

  async function loadRefs() {
    if (!company) return
    const cid = company.id
    const [s, cat, loc, dept, itm] = await Promise.all([
      supabase.from('suppliers').select('*').eq('company_id', cid).eq('status', 'active').order('name'),
      supabase.from('categories').select('*').eq('company_id', cid).order('name'),
      supabase.from('locations').select('*').eq('company_id', cid).eq('status', 'active').order('name'),
      supabase.from('departments').select('*').eq('company_id', cid).eq('status', 'active').order('name'),
      supabase.from('items').select('*').eq('company_id', cid).eq('status', 'active').order('name'),
    ])
    setSuppliers(s.data ?? [])
    setCategories(cat.data ?? [])
    setLocations(loc.data ?? [])
    // Only one delivery location? Pre-select it for new orders.
    if (isNew && loc.data?.length === 1) setHeader(h => ({ ...h, location_id: h.location_id || loc.data![0].id }))
    setDepartments(dept.data ?? [])
    setItems(itm.data ?? [])
    const { data: ctr } = await supabase.from('contracts').select('id, title, contract_number, supplier_id, status, end_date, notice_days, notice_given_at, auto_renew').eq('company_id', cid)
    setContracts(ctr ?? [])
    setRefsLoaded(true)
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
      contract_id: po.contract_id ?? '',
      location_id: po.location_id ?? '',
      department_id: po.department_id ?? '',
      payment_terms: po.payment_terms ?? '',
      expected_delivery_date: po.expected_delivery_date ?? '',
      incoterm: po.incoterm ?? '',
      supplier_quote_ref: po.supplier_quote_ref ?? '',
      notes: po.notes ?? '',
    })

    setDiscount(String(po.discount_amount ?? 0))
    setNegotiated(po.negotiated_discount ? String(po.negotiated_discount).replace('.', ',') : '')

    const { data: atts } = await supabase.from('po_attachments').select('id, file_name, file_path').eq('po_id', id!)
    setAttachments(atts ?? [])

    const { data: lineData } = await supabase.from('po_line_items').select('*').eq('po_id', id).order('position')
    setLines((lineData ?? []).map(l => ({
      id: l.id,
      item_id: l.item_id,
      category_id: l.category_id ?? '',
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
    // the catalog stays narrowed to a category the user chose by hand; a category that only came from picking an item does not narrow it
    const ids = categoryScope(lines[idx].main_id ?? mainCategoryId(lines[idx].category_id, categories), lines[idx].category_id, categories)
    const stayScoped = !!lines[idx].scoped && !!ids && ids.has(item.category_id ?? '')
    setLine(idx, {
      scoped: stayScoped,
      item_id: item.id,
      category_id: item.category_id ?? '',
      main_id: mainCategoryId(item.category_id, categories),
      name: item.name,
      long_description: item.long_description ?? '',
      unit: item.default_unit ? unitLabel(item.default_unit, lang) : lines[idx].unit,
      // the price agreed in the selected contract comes before the catalog price
      unit_price: (() => {
        const price = contractPrices.get(item.id) ?? item.default_unit_price
        return price != null ? String(price).replace('.', ',') : lines[idx].unit_price
      })(),
    })
  }

  // the catalog offered on a line follows the category chosen on it
  const itemsForLine = (l: LineItem) => {
    const ids = categoryScope(l.main_id ?? mainCategoryId(l.category_id, categories), l.category_id, categories)
    // narrowed only by a category chosen by hand; a category that came from picking an item leaves the whole catalog open
    return ids && l.scoped ? items.filter(i => ids.has(i.category_id ?? '')) : items
  }

  // lines of catalog items whose price differs from the one agreed in the selected contract
  const contractMismatches = lines.filter(l => l.item_id && contractPrices.has(l.item_id) && Math.abs(parseNum(l.unit_price) - contractPrices.get(l.item_id)!) >= 0.005)
  function applyContractPrices() {
    setLines(ls => ls.map(l => { const p = l.item_id ? contractPrices.get(l.item_id) : undefined; return p != null ? { ...l, unit_price: String(p).replace('.', ',') } : l }))
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
  // what the lines add to each main category (for the budget hint)
  const budgetByCategory: Record<string, number> = {}
  for (const l of lines) { const m = mainCategoryId(l.category_id, categories); if (m) budgetByCategory[m] = (budgetByCategory[m] ?? 0) + lineTotal(l) }

  function fmt(n: number) {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: company?.currency ?? 'EUR' }).format(n)
  }

  const selectedLoc = locations.find(l => l.id === header.location_id)
  const locationHint = selectedLoc
    ? [selectedLoc.address_street, [selectedLoc.address_postal_code, selectedLoc.address_city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
    : undefined

  function validate() {
    if (!header.supplier_id) { toast.error(t.common.nameRequired); return false }
    if (!header.location_id) { toast.error(t.common.nameRequired); return false }
    if (!header.department_id) { toast.error(`${s.department} *`); return false }
    if (!header.payment_terms.trim()) { toast.error(t.common.nameRequired); return false }
    if (!header.expected_delivery_date) { toast.error(t.common.nameRequired); return false }
    if (lines.length === 0) { toast.error(t.po.lineItems); return false }
    if (lines.some(l => !l.name.trim())) { toast.error(t.common.lineItemsNeedName); return false }
    if (lines.some(l => !l.category_id)) { toast.error(s.category + ' *'); return false }
    return true
  }

  async function uploadAttachments(poId: string) {
    if (!newFiles.length || !company) return
    setUploadingFiles(true)
    for (const file of newFiles) {
      const path = `${company.id}/${poId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error } = await supabase.storage.from('quotations').upload(path, file, { upsert: true })
      if (error) { toast.error(`${t.common.uploadPrefix} ${file.name}: ${error.message}`); continue }
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

  async function deleteDraft() {
    setDeleting(true)
    const { error } = await supabase.from('purchase_orders').delete().eq('id', id!)
    setDeleting(false); setConfirmDelete(false)
    if (error) { toast.error(error.message); return }
    toast.success(t.common.deleted); navigate('/purchase-orders')
  }

  async function save(targetStatus = poStatus) {
    if (!validate() || !company || !session) return
    setSaving(true)

    const linePayload = lines.map(l => ({
      position: l.position,
      item_id: l.item_id || null,
      category_id: l.category_id || null,
      name: l.name,
      long_description: l.long_description || null,
      quantity: parseNum(l.quantity) || 1,
      unit: l.unit,
      unit_price: parseNum(l.unit_price),
    }))

    // from a request: the order is created from it now (number, link, offers), then saved with what was typed
    let editId = id
    if (isNew && fromRequestId) {
      const res = await createPoFromRequest(fromRequestId, company.id)
      if ('error' in res) { toast.error(res.error); setSaving(false); return }
      editId = res.poId
      await supabase.from('po_activity_log').insert({ company_id: company.id, po_id: editId, actor_id: session.user.id, action: 'created' })
    }

    if (isNew && !fromRequestId) {
      // Generate PO number atomically
      const { data: poNum, error: numErr } = await (supabase as any).rpc('generate_po_number', { p_company_id: company.id })
      if (numErr || !poNum) { toast.error(t.common.numberGenerateFailed); setSaving(false); return }

      const { data: po, error: poErr } = await supabase.from('purchase_orders').insert({
        company_id: company.id,
        created_by: session.user.id,
        po_number: poNum,
        status: targetStatus,
        total_amount: grandTotal,
        ...header,
        sourcing_event_id: fromSourcingId || null,
        contract_id: header.contract_id || null,
        department_id: header.department_id || null,
        incoterm: header.incoterm || null,
        supplier_quote_ref: header.supplier_quote_ref || null,
        notes: header.notes || null,
        discount_amount: discountAmount,
        negotiated_discount: parseNum(negotiated),
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
        contract_id: header.contract_id || null,
        department_id: header.department_id || null,
        incoterm: header.incoterm || null,
        supplier_quote_ref: header.supplier_quote_ref || null,
        notes: header.notes || null,
        discount_amount: discountAmount,
        negotiated_discount: parseNum(negotiated),
      }).eq('id', editId)
      if (poErr) { toast.error(poErr.message); setSaving(false); return }

      await uploadAttachments(editId!)

      // Replace line items
      await supabase.from('po_line_items').delete().eq('po_id', editId)
      if (linePayload.length > 0) {
        await supabase.from('po_line_items').insert(linePayload.map(l => ({ ...l, po_id: editId })))
      }

      // Audit: status transition (e.g. draft -> issued) or a plain edit
      const action = targetStatus !== poStatus ? targetStatus : 'edited'
      await supabase.from('po_activity_log').insert({ company_id: company.id, po_id: editId!, actor_id: session.user.id, action })

      toast.success(t.common.saved)
      // Osnutek → seznam, ostalo → view
      navigate(targetStatus === 'draft' ? '/purchase-orders' : `/purchase-orders/${editId}`)
    }
    setSaving(false)
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>
  }

  const title = isNew ? t.po.newPO : `${t.common.edit} ${poNumber}`
  const supplierOptions = suppliers.map(x => ({ value: x.id, label: x.name }))
  const contractOptions = [{ value: '', label: '-' }, ...usableContracts(header.supplier_id, header.contract_id).map(c => ({ value: c.id, label: `${c.contract_number} · ${c.title}` }))]
  const issueTarget = isSent ? 'sent' : poStatus === 'draft' || isNew ? 'issued' : poStatus
  const actionButtons = (
    <>
      {!isNew && poStatus === 'draft' && (
        <Button variant="secondary" onClick={() => setConfirmDelete(true)} disabled={saving} className="gap-2 !text-danger !border-line"><Trash2 className="w-4 h-4" />{t.po.deleteDraft}</Button>
      )}
      <Button variant="secondary" onClick={() => navigate(-1)} disabled={saving}>{t.common.cancel}</Button>
      {(poStatus === 'draft' || isNew) && <Button variant="secondary" onClick={() => save('draft')} loading={saving}>{t.po.saveDraft}</Button>}
      <Button onClick={() => save(issueTarget)} loading={saving}>{poStatus === 'draft' || isNew ? t.po.issuePO : t.common.saveChanges}</Button>
    </>
  )

  return (
    <div className="p-4 lg:p-6 pb-28 lg:pb-6 form-skin">
      <nav className="flex items-center gap-2 text-sm text-ink2 mb-5">
        <button type="button" onClick={() => navigate('/purchase-orders')} aria-label={t.nav.purchaseOrders} title={t.nav.purchaseOrders}
          className="w-7 h-7 -ml-1.5 mr-1 inline-flex items-center justify-center rounded-lg text-icon hover:bg-selected hover:text-ink transition-colors">
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
        </button>
        <Link to="/purchase-orders" className="hover:text-ink transition-colors">{t.nav.purchaseOrders}</Link>
        <ChevronRight className="w-3.5 h-3.5 text-icon" />
        <span className="text-ink font-medium">{isNew ? t.po.newPO : (poNumber ?? title)}</span>
      </nav>

      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="text-xl font-semibold text-ink tracking-tight">{title}</h1>
          {isReadOnly && <p className="text-sm text-danger mt-1">{s.readOnlyNote}</p>}
          {isSent && <p className="text-sm text-ink2 mt-1">{s.sentNote}</p>}
        </div>
        {!isReadOnly && <div className="hidden lg:flex items-center gap-2">{actionButtons}</div>}
      </div>

      {/* Mobile sticky bottom bar */}
      {!isReadOnly && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-field px-4 py-3 flex gap-2 shadow-lg">
          <Button variant="secondary" onClick={() => navigate(-1)} disabled={saving} className="flex-1">{t.common.cancel}</Button>
          {(poStatus === 'draft' || isNew) && <Button variant="secondary" onClick={() => save('draft')} loading={saving} className="flex-1">{t.po.saveDraft}</Button>}
          <Button onClick={() => save(issueTarget)} loading={saving} className="flex-1">{poStatus === 'draft' || isNew ? t.po.issuePO : t.common.saveChanges}</Button>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {/* Order details */}
        <section className="bg-white rounded-lg border border-field">
          <h2 className="px-5 py-3 border-b border-field text-[15px] font-semibold text-ink">{t.po.orderDetails}</h2>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Select id="po-supplier" label={s.supplier} required value={header.supplier_id} disabled={isReadOnly} placeholder={t.common.select} options={supplierOptions}
              onChange={v => {
                const sup = suppliers.find(su => su.id === v)
                const usable = usableContracts(v)
                setHeader(h => ({
                  ...h,
                  supplier_id: v,
                  // keep the contract if it is this supplier's, otherwise take the supplier's only usable contract
                  contract_id: contracts.find(c => c.id === h.contract_id)?.supplier_id === v ? h.contract_id : usable.length === 1 ? usable[0].id : '',
                  payment_terms: h.payment_terms || sup?.payment_terms || '',
                  incoterm: h.incoterm || sup?.incoterm || '',
                }))
              }} />
            <div>
              <Select id="po-contract" label={t.contracts.linkedContract} value={header.contract_id} disabled={isReadOnly || !header.supplier_id} placeholder="-" options={contractOptions}
                onChange={v => setHeader(h => ({ ...h, contract_id: v }))} />
              {header.supplier_id && !isReadOnly && contractOptions.length === 1 && <p className="text-xs text-ink2 mt-1.5">{s.noContracts}</p>}
            </div>
            <div>
              <Select id="po-location" label={s.deliveryLocation} required value={header.location_id} disabled={isReadOnly} placeholder={t.common.select}
                options={locations.map(l => ({ value: l.id, label: l.name }))}
                onChange={v => setHeader(h => ({ ...h, location_id: v }))} />
              {locationHint && <p className="text-xs text-ink2 mt-1.5">{locationHint}</p>}
            </div>
            <Select id="po-department" label={s.department} required value={header.department_id} disabled={isReadOnly} placeholder={t.common.select}
              options={departments.map(d => ({ value: d.id, label: d.name }))}
              onChange={v => setHeader(h => ({ ...h, department_id: v }))} />
            <Input id="payment_terms" label={s.paymentTermsLabel + ' *'}
              value={header.payment_terms}
              onChange={e => setHeader(h => ({ ...h, payment_terms: e.target.value }))}
              readOnly={isReadOnly} />
            <Input id="delivery_date" label={s.desiredDelivery + ' *'} type="date"
              value={header.expected_delivery_date}
              onChange={e => setHeader(h => ({ ...h, expected_delivery_date: e.target.value }))}
              readOnly={isReadOnly} />
            <Select id="po-incoterm" label={s.incoterm} value={header.incoterm} disabled={isReadOnly} placeholder="-" options={incotermOptions(header.incoterm)}
              onChange={v => setHeader(h => ({ ...h, incoterm: v }))} />
            <Input id="quote_ref" label={s.quoteRef}
              value={header.supplier_quote_ref}
              onChange={e => setHeader(h => ({ ...h, supplier_quote_ref: e.target.value }))}
              readOnly={isReadOnly} />
            <div>
              <Input id="negotiated" label={`${s.negotiatedDiscount} (${company?.currency ?? 'EUR'})`} inputMode="decimal" placeholder="0,00"
                {...numericInput(negotiated, setNegotiated)} readOnly={isReadOnly} />
              <p className="text-xs text-ink2 mt-1.5">{s.negotiatedHint}</p>
            </div>
            <div className="sm:col-span-2 lg:col-span-4 flex flex-col gap-1">
              <label htmlFor="po-notes" className="text-sm font-medium text-gray-700">{s.notes}</label>
              <textarea id="po-notes" rows={3} value={header.notes}
                onChange={e => setHeader(h => ({ ...h, notes: e.target.value }))}
                readOnly={isReadOnly}
                placeholder={s.notesPlaceholder}
                className="rounded-lg border border-field px-3 py-2 hover:border-field-hover text-sm focus:outline-none focus:border-field-focus resize-none" />
            </div>
            {header.department_id && (
              <div className="sm:col-span-2 lg:col-span-4">
                <BudgetStatus className="pt-4 border-t border-field" departmentId={header.department_id} amount={grandTotal} byCategory={budgetByCategory} excludePoId={id} excludeRequestId={fromRequestId} />
              </div>
            )}
          </div>
        </section>

        {/* Line items */}
        <section className="bg-white rounded-lg border border-field overflow-hidden">
          <div className="px-5 py-3 border-b border-field flex items-center justify-between gap-3 min-h-[49px]">
            <h2 className="text-[15px] font-semibold text-ink">{t.po.lineItems}</h2>
            {!isReadOnly && header.contract_id && contractMismatches.length > 0 && (
              <Button variant="secondary" onClick={applyContractPrices} className="!h-8 text-[13px]">{s.applyContractPrices.replace('{n}', String(contractMismatches.length))}</Button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="table-grid w-full text-sm min-w-[1300px]">
              <GridHead cols={[[t.po.position, Hash], [s.catalog, Search], [s.code, IdCard], [t.po.itemName, Package], [s.category + ' *', Tag], [t.categories.subcategory + ' *', Tag], [t.po.qty, Hash, 'right'], [t.po.unit, Ruler], [t.po.unitPrice, Coins, 'right'], [t.po.amount, Coins, 'right'], ...(isReadOnly ? [] : [['']] as [string][])]} />
              <tbody className="divide-y divide-field">
                {lines.map((line, idx) => (
                  <tr key={idx} className="align-top">
                    <td className="px-4 py-2.5 text-ink2 pt-4 tabular-nums">{idx + 1}</td>
                    <td className="px-3 py-2.5 min-w-[150px]">
                      {!isReadOnly && <CatalogPicker items={itemsForLine(line)} allItems={items} onSelect={item => applyItem(idx, item)} placeholder={t.common.searchCatalog} />}
                    </td>
                    <td className="px-4 py-2.5 pt-4 text-ink2 whitespace-nowrap">{line.item_id ? items.find(i => i.id === line.item_id)?.item_number ?? '-' : '-'}</td>
                    <td className="px-3 py-2.5 min-w-[220px]">
                      <input value={line.name} onChange={e => setLine(idx, { name: e.target.value })} readOnly={isReadOnly} placeholder={s.itemNamePlaceholder}
                        className="w-full h-9 px-3 text-sm font-medium rounded-lg border border-field hover:border-field-hover bg-white text-ink placeholder:text-placeholder placeholder:font-normal focus:outline-none focus:border-field-focus" />
                      <input value={line.long_description} onChange={e => setLine(idx, { long_description: e.target.value })} readOnly={isReadOnly} placeholder={s.descPlaceholder}
                        className="w-full h-9 px-3 mt-2.5 text-sm rounded-lg border border-field hover:border-field-hover bg-white text-ink placeholder:text-placeholder focus:outline-none focus:border-field-focus" />
                    </td>
                    <LineCategoryCells categories={categories} mainId={line.main_id} categoryId={line.category_id} disabled={isReadOnly} onChange={patch => setLine(idx, { ...patch, scoped: true })} />
                    <td className="px-3 py-2.5 w-24">
                      <input type="text" inputMode="decimal" {...numericInput(line.quantity, v => setLine(idx, { quantity: v }))} readOnly={isReadOnly}
                        className="w-full text-sm tabular-nums border border-field rounded-lg hover:border-field-hover px-2 py-1.5 focus:outline-none focus:border-field-focus text-right" />
                    </td>
                    <td className="px-3 py-2.5 w-28">
                      <Select value={unitCode(line.unit) ?? line.unit} disabled={isReadOnly} options={unitOptions(line.unit, lang)}
                        onChange={v => setLine(idx, { unit: v ? unitLabel(v, lang) : '' })} />
                    </td>
                    <td className="px-3 py-2.5 w-32">
                      <input type="text" inputMode="decimal" {...numericInput(line.unit_price, v => setLine(idx, { unit_price: v }))} readOnly={isReadOnly}
                        className="w-full text-sm tabular-nums border border-field rounded-lg hover:border-field-hover px-2 py-1.5 focus:outline-none focus:border-field-focus text-right" />
                      {(() => {
                        const agreed = line.item_id ? contractPrices.get(line.item_id) : undefined
                        if (agreed == null || isReadOnly) return null
                        const current = parseNum(line.unit_price)
                        if (Math.abs(current - agreed) < 0.005) return <p className="mt-1 text-[11px] leading-4 text-ink2 text-right">{s.fromContract}</p>
                        return (
                          <button type="button" onClick={() => setLine(idx, { unit_price: String(agreed).replace('.', ',') })}
                            className={`mt-1 w-full text-right text-[11px] leading-4 hover:underline ${current > agreed ? 'text-danger' : 'text-ink2'}`}>
                            {s.contractPriceIs}: {fmt(agreed)}
                          </button>
                        )
                      })()}
                    </td>
                    <td className="px-4 py-2.5 pt-4 text-right text-ink tabular-nums whitespace-nowrap">{fmt(lineTotal(line))}</td>
                    {!isReadOnly && (
                      <td className="px-3 py-2.5 pt-3">
                        <button type="button" onClick={() => removeLine(idx)} aria-label={t.common.deleteEntity}
                          className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-icon hover:bg-selected hover:text-danger transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!isReadOnly && (
            <div className="px-5 py-3 border-t border-field">
              <button type="button" onClick={addLine} className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary-hover font-medium"><Plus className="w-4 h-4" />{s.addLine}</button>
            </div>
          )}
          <div className="flex justify-end px-5 py-4 border-t border-field">
            <div className="w-72 flex flex-col gap-2 text-sm">
              {discountAmount > 0 && <div className="flex justify-between"><span className="text-ink2">{s.subtotal}</span><span className="tabular-nums text-ink2">{fmt(subtotal)}</span></div>}
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="po-discount" className="text-ink2">{s.discount} ({company?.currency ?? 'EUR'})</label>
                {isReadOnly
                  ? <span className="tabular-nums text-ink">{discountAmount > 0 ? `-${fmt(discountAmount)}` : '-'}</span>
                  : <input id="po-discount" type="text" inputMode="decimal" {...numericInput(discount, setDiscount)} className="w-28 text-sm tabular-nums border border-field rounded-lg hover:border-field-hover px-2 py-1.5 focus:outline-none focus:border-field-focus text-right" />}
              </div>
              <div className="flex justify-between items-baseline pt-2 border-t border-field"><span className="font-medium text-ink2">{s.totalExVat}</span><span className="text-lg font-semibold text-ink tabular-nums">{fmt(grandTotal)}</span></div>
            </div>
          </div>
        </section>

        {/* Attachments */}
        <section className="bg-white rounded-lg border border-field">
          <h2 className="px-5 py-3 border-b border-field text-[15px] font-semibold text-ink flex items-center gap-1.5"><Paperclip className="w-3.5 h-3.5" />{t.po.attachQuotation}</h2>
          <div className="p-5 flex flex-col gap-2">
            {attachments.map(att => (
              <div key={att.id} className="flex items-center gap-2.5 px-3 py-2 bg-surface rounded-lg">
                <FileText className="w-4 h-4 text-icon shrink-0" strokeWidth={1.75} />
                <button type="button" onClick={() => openAttachment(att.file_path)} className="text-sm text-ink hover:text-primary font-medium flex-1 text-left truncate transition-colors">{att.file_name}</button>
                {!isReadOnly && <button type="button" onClick={() => setAttToDelete(att)} aria-label={t.common.deleteEntity} className="text-icon hover:text-danger transition-colors shrink-0"><X className="w-4 h-4" /></button>}
              </div>
            ))}
            {requestAtts.map(att => (
              <div key={att.id} className="flex items-center gap-2.5 px-3 py-2 bg-surface rounded-lg">
                <FileText className="w-4 h-4 text-icon shrink-0" strokeWidth={1.75} />
                <button type="button" onClick={() => openAttachment(att.file_path)} className="text-sm text-ink hover:text-primary font-medium flex-1 text-left truncate transition-colors">{att.file_name}</button>
                <span className="text-xs text-ink2 shrink-0">{t.requests.fromRequest}</span>
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
            {!isReadOnly && (
              <label className="flex items-center gap-2 h-10 px-3 rounded-lg border border-dashed border-field cursor-pointer text-sm text-ink2 hover:bg-surface transition-colors w-full">
                <UploadCloud className="w-4 h-4 text-icon shrink-0" />
                <span>{t.po.uploadQuotation}</span>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" multiple className="hidden" onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
              </label>
            )}
            {uploadingFiles && <p className="text-xs text-ink2">{s.uploading}</p>}
          </div>
        </section>

        {/* Bottom actions: hidden on mobile (the sticky bar handles it) */}
        {!isReadOnly && <div className="hidden lg:flex justify-end gap-2">{actionButtons}</div>}
      </div>


      <ConfirmDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} onConfirm={deleteDraft}
        title={t.po.deleteTitle} message={t.po.deleteQuestion} name={poNumber ?? ''} danger loading={deleting} confirmLabel={t.common.deleteEntity} />
      <ConfirmDialog open={!!attToDelete} onClose={() => setAttToDelete(null)}
        onConfirm={async () => { if (attToDelete) await deleteAttachment(attToDelete); setAttToDelete(null) }}
        title={t.common.deleteDocTitle} message={t.common.deleteDocQuestion} name={attToDelete?.file_name ?? ''} danger confirmLabel={t.common.deleteEntity} />

    </div>
  )
}
