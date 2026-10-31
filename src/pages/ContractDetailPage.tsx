import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Eye, ChevronRight, BellRing, Pencil, Plus, Trash2, Upload, FileText, Download, Info, Coins, Paperclip, ShoppingCart, Building2, IdCard, Package, Ruler, CircleDot, CalendarClock } from 'lucide-react'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { useLanguage } from '../hooks/useLanguage'
import { toast } from '../components/ui/Toast'
import { dbError } from '../lib/dbError'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import ModalActions from '../components/ui/ModalActions'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import ImportModal from '../components/ui/ImportModal'
import ExportButton from '../components/ui/ExportButton'
import { exportToExcel, type ExportColumn } from '../lib/exportExcel'
import GridHead from '../components/ui/GridHead'
import PersonCell from '../components/ui/PersonCell'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import TableEmptyState from '../components/ui/TableEmptyState'
import ContractFormModal, { type PersonLite, type SupplierLite } from '../components/contracts/ContractFormModal'
import { closingDate, daysUntil, deleteContractCompletely, effectiveStatus, noticeDate, STATUS_BADGE } from '../lib/contracts'
import { unitLabel } from '../lib/units'
import type { Contract, ContractAttachment } from '../types/database'

type Full = Contract & { suppliers: { id: string; name: string } | null }
interface PriceRow { id: string; item_id: string; agreed_price: number; items: { name: string; item_number: string; default_unit: string | null; default_unit_price: number | null } | null }
interface OrderRow { id: string; po_number: string; status: string; total_amount: number | null; created_at: string }
type Tab = 'overview' | 'prices' | 'documents' | 'orders'

const fmtDate = (d: string | null) => (d ? format(new Date(d + 'T00:00:00'), 'dd.MM.yyyy') : '-')
const PO_BADGE: Record<string, string> = { draft: 'badge-neutral', issued: 'badge-warn', sent: 'badge-info', closed: 'badge-success', cancelled: 'badge-danger' }

/** A titled box of the overview. */
function Card({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`bg-white rounded-lg border border-field ${className}`}>
      <h2 className="px-5 py-3 border-b border-field text-[15px] font-semibold text-ink">{title}</h2>
      <div className="p-5">{children}</div>
    </section>
  )
}

/** Small grey label above a value. */
function Field({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[12.5px] font-medium text-ink2 mb-1">{label}</p>
      <div className="text-sm text-ink">{children || '-'}</div>
    </div>
  )
}

/** Agreed price in the price list: shown formatted like the catalog price ("30,00 €"), plain number while it is being edited. */
function PriceCell({ value, format, disabled, onSave }: { value: number; format: (n: number) => string; disabled: boolean; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      value={draft ?? format(value)}
      disabled={disabled}
      inputMode="decimal"
      onFocus={e => { setDraft(String(value).replace('.', ',')); e.target.select() }}
      onChange={e => { if (/^[0-9]*[,.]?[0-9]*$/.test(e.target.value)) setDraft(e.target.value) }}
      onBlur={() => { if (draft != null) onSave(draft); setDraft(null) }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      className="w-28 -mr-2 text-right tabular-nums rounded-lg border border-transparent hover:border-field focus:border-field-focus px-2 py-1 focus:outline-none disabled:bg-transparent"
    />
  )
}

export default function ContractDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { company, isAdmin, hasPerm } = useCompany()
  const { t, lang } = useLanguage()
  const s = t.contracts
  const canEdit = isAdmin || hasPerm('purchase_orders', 'create')
  const currency = company?.currency ?? 'EUR'
  const money = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency, minimumFractionDigits: 2 }).format(n)

  const [contract, setContract] = useState<Full | null>(null)
  const [prices, setPrices] = useState<PriceRow[]>([])
  const [attachments, setAttachments] = useState<ContractAttachment[]>([])
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [owner, setOwner] = useState('-')
  const [suppliers, setSuppliers] = useState<SupplierLite[]>([])
  const [people, setPeople] = useState<PersonLite[]>([])
  const [catalog, setCatalog] = useState<{ id: string; name: string; item_number: string; category_id: string | null; default_unit: string | null; default_unit_price: number | null }[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string; parent_id: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('overview')
  const [editOpen, setEditOpen] = useState(false)
  const [confirm, setConfirm] = useState<'delete' | null>(null)
  const [noticeOpen, setNoticeOpen] = useState(false)
  const [noticeOn, setNoticeOn] = useState(() => new Date().toISOString().slice(0, 10))
  const [removePriceRow, setRemovePriceRow] = useState<PriceRow | null>(null)
  const [removeDocRow, setRemoveDocRow] = useState<ContractAttachment | null>(null)
  const [newItem, setNewItem] = useState({ item_id: '', price: '' })
  const [uploading, setUploading] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (company && id) load() }, [company, id])

  async function load() {
    if (!company || !id) return
    const [{ data: c }, { data: pr }, { data: at }, { data: po }, { data: sup }, { data: us }, { data: it }, { data: cats }] = await Promise.all([
      supabase.from('contracts').select('*, suppliers(id, name)').eq('id', id).single(),
      supabase.from('contract_items').select('id, item_id, agreed_price, items(name, item_number, default_unit, default_unit_price)').eq('contract_id', id).order('created_at'),
      supabase.from('contract_attachments').select('*').eq('contract_id', id).order('created_at', { ascending: false }),
      supabase.from('purchase_orders').select('id, po_number, status, total_amount, created_at').eq('contract_id', id).order('created_at', { ascending: false }),
      supabase.from('suppliers').select('id, name, payment_terms').eq('company_id', company.id).eq('status', 'active').order('name'),
      supabase.from('users').select('id, first_name, last_name').eq('company_id', company.id).order('first_name'),
      supabase.from('items').select('id, name, item_number, category_id, default_unit, default_unit_price').eq('company_id', company.id).eq('status', 'active').order('name'),
      supabase.from('categories').select('id, name, parent_id').eq('company_id', company.id),
    ])
    if (!c) { toast.error(t.common.notFound); navigate('/contracts'); return }
    setContract(c as Full)
    setPrices((pr as unknown as PriceRow[]) ?? [])
    setAttachments((at as ContractAttachment[]) ?? [])
    setOrders((po as OrderRow[]) ?? [])
    setSuppliers(sup ?? []); setPeople(us ?? []); setCatalog(it ?? []); setCategories(cats ?? [])
    const o = (us ?? []).find(u => u.id === (c as Full).owner_id)
    setOwner(o ? `${o.first_name} ${o.last_name}` : '-')
    setLoading(false)
  }

  if (loading || !contract) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>

  const st = effectiveStatus(contract)
  const daysLeft = daysUntil(contract.end_date)
  const nd = noticeDate(contract)
  const noticeIn = contract.auto_renew ? daysUntil(nd) : null
  const spent = orders.filter(o => ['issued', 'sent', 'closed'].includes(o.status)).reduce((n, o) => n + Number(o.total_amount ?? 0), 0)
  const pct = contract.total_value && contract.total_value > 0 ? Math.min(100, Math.round((spent / contract.total_value) * 100)) : 0
  const over = contract.total_value != null && spent > contract.total_value
  // share of the validity period that has passed
  const startMs = new Date(contract.start_date + 'T00:00:00').getTime()
  const endMs = contract.end_date ? new Date(contract.end_date + 'T00:00:00').getTime() : null
  const elapsed = endMs && endMs > startMs ? Math.max(0, Math.min(100, Math.round(((Date.now() - startMs) / (endMs - startMs)) * 100))) : null

  // after notice: the contract ends on notice date + notice period, shown with a bar for the days of the notice period used so far
  const noticed = st === 'in_notice' || st === 'cancelled'
  const closing = noticed ? closingDate(contract) : null
  const closingIn = daysUntil(closing)
  const dayMs = 86_400_000
  const noticeTotal = contract.notice_given_at && closing
    ? Math.max(1, Math.round((new Date(closing + 'T00:00:00').getTime() - new Date(contract.notice_given_at + 'T00:00:00').getTime()) / dayMs))
    : null
  const noticeDone = noticeTotal != null && closingIn != null ? Math.max(0, Math.min(noticeTotal, noticeTotal - closingIn)) : null

  async function setStatus(status: Contract['status']) {
    const { error } = await supabase.from('contracts').update({ status, updated_at: new Date().toISOString() }).eq('id', contract!.id)
    setConfirm(null)
    if (error) { toast.error(dbError(error, t)); return }
    toast.success(t.common.saved); load()
  }
  async function setNotice(date: string | null) {
    const { error } = await supabase.from('contracts').update({ notice_given_at: date, updated_at: new Date().toISOString() }).eq('id', contract!.id)
    setNoticeOpen(false)
    if (error) { toast.error(dbError(error, t)); return }
    toast.success(t.common.saved); load()
  }
  async function deleteContract() {
    const error = await deleteContractCompletely(contract!.id)
    setConfirm(null)
    if (error) { toast.error(dbError(error, t)); return }
    toast.success(t.common.deleted); navigate('/contracts')
  }

  // ── price list ──
  async function addPrice() {
    if (!company || !newItem.item_id) { toast.error(s.pickItem); return }
    const price = Number(newItem.price.replace(',', '.'))
    if (!newItem.price.trim() || Number.isNaN(price)) { toast.error(t.common.import.invalidNumber); return }
    const { error } = await supabase.from('contract_items').insert({ contract_id: contract!.id, company_id: company.id, item_id: newItem.item_id, agreed_price: price })
    if (error) { toast.error(dbError(error, t)); return }
    setNewItem({ item_id: '', price: '' }); load()
  }
  async function savePrice(row: PriceRow, value: string) {
    const price = Number(value.replace(',', '.'))
    if (Number.isNaN(price) || price === row.agreed_price) return
    const { error } = await supabase.from('contract_items').update({ agreed_price: price }).eq('id', row.id)
    if (error) toast.error(dbError(error, t)); else load()
  }
  // an item in an import row: by code first, then by name (as in the catalog)
  function findCatalogItem(row: Record<string, string>) {
    const code = row.code.trim().toLowerCase()
    const name = row.name.trim().toLowerCase()
    return (code && catalog.find(x => x.item_number.toLowerCase() === code)) || (name && catalog.find(x => x.name.toLowerCase() === name)) || undefined
  }
  const toPrice = (v: string) => Number(v.replace(/\s/g, '').replace(',', '.'))
  // The file to edit: every catalog item with the price already agreed in this contract (empty if none). Uploading it again sets the prices.
  const agreedByItem = new Map(prices.map(p => [p.item_id, p.agreed_price]))
  // category and subcategory of an item (for sorting and filtering the file in Excel)
  const pathOf = (categoryId: string | null) => {
    const c = categories.find(x => x.id === categoryId)
    const parent = c?.parent_id ? categories.find(x => x.id === c.parent_id) : undefined
    return parent ? { top: parent.name, sub: c!.name } : { top: c?.name ?? '', sub: '' }
  }
  const priceRows = [...catalog].sort((a, b) => {
    const pa = pathOf(a.category_id), pb = pathOf(b.category_id)
    return pa.top.localeCompare(pb.top, 'sl') || pa.sub.localeCompare(pb.sub, 'sl') || a.item_number.localeCompare(b.item_number, undefined, { numeric: true })
  })
  const priceCols: ExportColumn<(typeof catalog)[number]>[] = [
    { header: t.items.itemNumber, get: x => x.item_number, width: 12 },
    { header: t.common.name, get: x => x.name, width: 40 },
    { header: t.categories.single, get: x => pathOf(x.category_id).top, width: 22 },
    { header: t.categories.subcategory, get: x => pathOf(x.category_id).sub, width: 26 },
    { header: t.items.defaultUnit, get: x => unitLabel(x.default_unit, lang), width: 14 },
    { header: s.catalogPrice, get: x => x.default_unit_price, kind: 'money', width: 16 },
    { header: s.agreedPrice, get: x => agreedByItem.get(x.id) ?? null, kind: 'money', width: 18 },
  ]
  async function removePrice(row: PriceRow) {
    const { error } = await supabase.from('contract_items').delete().eq('id', row.id)
    if (error) toast.error(dbError(error, t)); else load()
  }

  // ── documents ──
  async function upload(files: FileList | null) {
    if (!company || !files?.length) return
    setUploading(true)
    for (const file of Array.from(files)) {
      const path = `${company.id}/contracts/${contract!.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error } = await supabase.storage.from('quotations').upload(path, file, { upsert: true })
      if (error) { toast.error(`${t.common.uploadPrefix} ${file.name}: ${error.message}`); continue }
      await supabase.from('contract_attachments').insert({ contract_id: contract!.id, company_id: company.id, file_path: path, file_name: file.name, file_size: file.size })
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
    load()
  }
  // preview: opened in a new tab (the browser shows PDFs and images itself); download: the same link, but saved as a file
  async function openDoc(a: ContractAttachment, download = false) {
    const { data } = await supabase.storage.from('quotations').createSignedUrl(a.file_path, 3600, download ? { download: a.file_name } : undefined)
    if (data?.signedUrl) window.open(data.signedUrl, download ? '_self' : '_blank')
  }
  async function removeDoc(a: ContractAttachment) {
    // the record first: if the database refuses, the file stays; the file goes only after that, so nothing is left behind in storage
    const { error } = await supabase.from('contract_attachments').delete().eq('id', a.id)
    if (error) { toast.error(dbError(error, t)); return }
    await supabase.storage.from('quotations').remove([a.file_path])
    load()
  }

  const usedItems = new Set(prices.map(p => p.item_id))
  const tabs: { id: Tab; label: string; icon: React.ElementType; count?: number }[] = [
    { id: 'overview', label: s.overview, icon: Info },
    { id: 'prices', label: s.prices, icon: Coins, count: prices.length },
    { id: 'documents', label: s.documents, icon: Paperclip, count: attachments.length },
    { id: 'orders', label: s.orders, icon: ShoppingCart, count: orders.length },
  ]

  // The one main action of the header depends on the status; the rest sits in the menu.
  const primaryAction =
    contract.status === 'draft' ? <Button onClick={() => setStatus('active')}>{s.activate}</Button>
    : contract.status === 'terminated' ? <Button variant="secondary" onClick={() => setStatus('active')}>{s.reactivate}</Button>
    : contract.status === 'active' && contract.notice_given_at ? <Button variant="secondary" onClick={() => setNotice(null)}>{s.cancelNotice}</Button>
    : contract.status === 'active' && st !== 'expired' ? <Button variant="secondary" onClick={() => setNoticeOpen(true)} className="gap-2"><BellRing className="w-4 h-4" />{s.giveNotice}</Button>
    : null

  return (
    <div className="p-4 lg:p-6">
      <nav className="flex items-center gap-1.5 text-[13px] text-ink2 mb-4">
        <button type="button" onClick={() => navigate('/contracts')} aria-label={s.title} title={s.title}
          className="w-7 h-7 -ml-1.5 mr-1 inline-flex items-center justify-center rounded-lg text-icon hover:bg-selected hover:text-ink transition-colors">
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
        </button>
        <Link to="/contracts" className="hover:text-ink transition-colors">{s.title}</Link>
        <ChevronRight className="w-3.5 h-3.5 text-icon" />
        <span className="text-ink font-medium">{contract.contract_number}</span>
      </nav>

      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-semibold text-ink tracking-tight">{contract.title}</h1>
            <span className={`badge ${STATUS_BADGE[st]}`}>{s.st[st]}</span>
          </div>
          {contract.suppliers && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-ink2">
              <Building2 className="w-3.5 h-3.5 text-icon" strokeWidth={1.75} />
              <Link to="/suppliers" className="hover:text-ink hover:underline">{contract.suppliers.name}</Link>
            </p>
          )}
        </div>
        {canEdit && (
          <div className="flex items-center gap-2 flex-wrap">
            {primaryAction}
            <Button variant="secondary" onClick={() => setEditOpen(true)} className="gap-2"><Pencil className="w-4 h-4" />{t.common.editEntity}</Button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 mb-5 overflow-x-auto">
        {tabs.map(x => (
          <button key={x.id} onClick={() => setTab(x.id)}
            className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border text-sm font-medium transition-colors shrink-0 ${tab === x.id ? 'border-field bg-surface text-ink' : 'border-transparent text-ink2 hover:bg-hover'}`}>
            <x.icon className="w-3.5 h-3.5 text-icon" strokeWidth={1.75} />
            {x.label}
            {x.count != null && <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-md bg-surface border border-field text-[11px] font-normal text-ink2">{x.count}</span>}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
          <Card title={s.detailsTitle} className="xl:col-span-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
              <Field label={s.owner}>{owner !== '-' && <PersonCell name={owner} />}</Field>
              <Field label={s.paymentTerms}>{contract.payment_terms}</Field>
              <Field label={s.autoRenew}>{contract.auto_renew ? `${t.common.yes}${contract.renewal_months ? ` · ${contract.renewal_months} ${s.monthsShort}` : ''}` : t.common.no}</Field>
              <Field label={s.noticeDays}>{contract.notice_days ? `${contract.notice_days} ${s.daysShort}` : '-'}</Field>
              {contract.description && (
                <div className="sm:col-span-2">
                  <Field label={s.description}><span className="whitespace-pre-wrap">{contract.description}</span></Field>
                </div>
              )}
            </div>
          </Card>

          <div className="flex flex-col gap-4">
            <Card title={s.validity}>
              <div className="grid grid-cols-2 gap-x-6 gap-y-5">
                <Field label={s.startDate}>{fmtDate(contract.start_date)}</Field>
                <Field label={s.endDate}>{contract.end_date ? fmtDate(contract.end_date) : s.openEnded}</Field>
                {st !== 'expired' && st !== 'cancelled' && st !== 'draft' && st !== 'terminated' && daysLeft != null && daysLeft >= 0 && <Field label={s.timeLeft}>{daysLeft} {s.daysShort}</Field>}
                {st === 'expired' && <Field label={s.st.expired}>{fmtDate(contract.end_date)}</Field>}
                {noticed && <Field label={s.noticeGiven}>{fmtDate(contract.notice_given_at)}</Field>}
                {contract.auto_renew && nd && !noticed && st !== 'expired' && noticeIn != null && noticeIn >= 0 && (
                  <Field label={s.cancelBy}>{fmtDate(nd)} <span className="text-ink2">({noticeIn} {s.daysShort})</span></Field>
                )}
              </div>
              {elapsed != null && (
                <div className="h-1.5 rounded-full bg-selected mt-5 overflow-hidden"><div className="h-full rounded-full bg-icon" style={{ width: `${elapsed}%` }} /></div>
              )}
            </Card>

            {/* only while the contract is in its notice period */}
            {noticed && (
              <Card title={s.noticeCard}>
                <div className="grid grid-cols-2 gap-x-6 gap-y-5">
                  <Field label={s.noticeGiven}>{fmtDate(contract.notice_given_at)}</Field>
                  <Field label={s.noticeDays}>{contract.notice_days ? String(contract.notice_days) : '-'}</Field>
                  <Field label={s.closesOn}><span className="font-medium">{fmtDate(closing)}</span></Field>
                  {closingIn != null && closingIn >= 0 && <Field label={s.timeLeft}>{closingIn} {s.daysShort}</Field>}
                </div>
                {noticeTotal != null && noticeDone != null && (
                  <div className="mt-5">
                    {/* a countdown: full when the notice period starts, empty when the contract ends */}
                    <div className="h-1.5 rounded-full bg-selected overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.round(((noticeTotal - noticeDone) / noticeTotal) * 100)}%`, background: 'var(--badge-orange-text)' }} /></div>
                    <p className="text-xs text-ink2 mt-1.5 tabular-nums">{noticeTotal - noticeDone} / {noticeTotal} {s.daysShort}</p>
                  </div>
                )}
              </Card>
            )}

            <Card title={`${s.spent} / ${s.totalValue}`}>
              <p className="text-2xl font-semibold text-ink tracking-tight tabular-nums">{money(spent)}</p>
              {contract.total_value != null ? (
                <>
                  <div className="h-1.5 rounded-full bg-selected mt-3 overflow-hidden"><div className={`h-full rounded-full ${over ? 'bg-danger' : 'bg-primary'}`} style={{ width: `${pct}%` }} /></div>
                  <div className="flex justify-between text-[13px] text-ink2 mt-2.5 tabular-nums">
                    <span>{s.totalValue}: {money(contract.total_value)}</span>
                    <span>{s.remaining}: {money(Math.max(0, contract.total_value - spent))}</span>
                  </div>
                </>
              ) : <p className="text-sm text-ink2 mt-2">-</p>}
            </Card>
          </div>
        </div>
      )}

      {tab === 'prices' && (
        <>
          {canEdit && (
            <div className="form-skin flex items-end gap-3 flex-wrap mb-5">
              <div className="flex-1 min-w-[240px] max-w-md">
                <Select id="c-price-item" label={s.addItem} value={newItem.item_id} placeholder={s.pickItem}
                  options={catalog.filter(x => !usedItems.has(x.id)).map(x => ({ value: x.id, label: `${x.item_number} · ${x.name}` }))}
                  onChange={v => {
                    const it = catalog.find(x => x.id === v)
                    setNewItem({ item_id: v, price: it?.default_unit_price != null ? String(it.default_unit_price).replace('.', ',') : '' })
                  }} />
              </div>
              <div className="w-40">
                <Input id="c-price" label={s.agreedPrice} placeholder="0,00" inputMode="decimal" value={newItem.price}
                  onChange={e => { if (/^[0-9]*[,.]?[0-9]*$/.test(e.target.value)) setNewItem(n => ({ ...n, price: e.target.value })) }} />
              </div>
              <Button onClick={addPrice} className="gap-2"><Plus className="w-4 h-4" />{t.common.create}</Button>
              <div className="flex items-center gap-2 sm:ml-auto">
                <ExportButton fileName={`${contract.contract_number}-cenik`} columns={priceCols} rows={priceRows} />
                <Button variant="secondary" onClick={() => setImportOpen(true)} className="gap-2"><Upload className="w-4 h-4" />{t.common.import.button}</Button>
              </div>
            </div>
          )}
          <div className="data-card table-bleed table-grid bg-white rounded-lg border border-field overflow-hidden">
            <div className="overflow-x-auto"><table className="w-full text-sm min-w-[720px]">
              <GridHead cols={[[t.items.itemNumber, IdCard], [t.common.name, Package], [t.items.defaultUnit, Ruler], [s.catalogPrice, Coins, 'right'], [s.agreedPrice, Coins, 'right'], ['']]} />
              <tbody className="divide-y divide-field">
                {prices.length === 0 ? (
                  <TableEmptyState icon={Coins} colSpan={6} title={s.prices} subtitle={s.noPrices} />
                ) : prices.map(p => {
                  const cat = p.items?.default_unit_price
                  const diff = cat ? Math.round(((p.agreed_price - cat) / cat) * 100) : null
                  return (
                    <tr key={p.id} className="hover:bg-surface transition-colors">
                      <td className="px-4 py-3 text-ink2 whitespace-nowrap">{p.items?.item_number}</td>
                      <td className="px-4 py-3 font-medium text-ink">{p.items?.name}</td>
                      <td className="px-4 py-3 text-ink2">{unitLabel(p.items?.default_unit, lang) || '-'}</td>
                      <td className="px-4 py-3 text-right text-ink2 tabular-nums">{cat != null ? money(cat) : '-'}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center justify-end gap-3 min-w-[190px]">
                          {diff != null && diff !== 0 && <span className={`text-xs tabular-nums ${diff < 0 ? 'text-success' : 'text-danger'}`}>{diff > 0 ? '+' : ''}{diff} %</span>}
                          <PriceCell value={p.agreed_price} format={money} disabled={!canEdit} onSave={v => savePrice(p, v)} />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {canEdit && <div className="flex justify-end"><button onClick={() => setRemovePriceRow(p)} className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-icon hover:bg-selected hover:text-danger transition-colors"><Trash2 className="w-4 h-4" /></button></div>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table></div>
          </div>
        </>
      )}

      {tab === 'documents' && (
        <>
          {canEdit && (
            <div className="mb-5">
              <input ref={fileRef} type="file" multiple className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp" onChange={e => upload(e.target.files)} />
              <Button variant="secondary" loading={uploading} onClick={() => fileRef.current?.click()} className="gap-2"><Upload className="w-4 h-4" />{s.upload}</Button>
            </div>
          )}
          <div className="data-card table-bleed table-grid bg-white rounded-lg border border-field overflow-hidden">
            <div className="overflow-x-auto"><table className="w-full text-sm min-w-[560px]">
              <GridHead cols={[[t.common.name, FileText], [s.fileSize, Ruler], [t.common.created, CalendarClock], ['']]} />
              <tbody className="divide-y divide-field">
                {attachments.length === 0 ? (
                  <TableEmptyState icon={Paperclip} colSpan={4} title={s.documents} subtitle={s.noDocuments} />
                ) : attachments.map(a => (
                  <tr key={a.id} className="hover:bg-surface transition-colors">
                    <td className="px-4 py-3">
                      <button onClick={() => openDoc(a)} className="inline-flex items-center gap-2 max-w-full text-left font-medium text-ink hover:text-primary transition-colors">
                        <FileText className="w-4 h-4 text-icon shrink-0" strokeWidth={1.75} /><span className="truncate">{a.file_name}</span>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-ink2 whitespace-nowrap tabular-nums">{a.file_size ? `${Math.max(1, Math.round(a.file_size / 1024))} KB` : '-'}</td>
                    <td className="px-4 py-3 text-ink2 whitespace-nowrap">{fmtDate(a.created_at.slice(0, 10))}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-0.5">
                        <button onClick={() => openDoc(a)} title={s.preview} aria-label={s.preview} className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-icon hover:bg-selected transition-colors"><Eye className="w-4 h-4" /></button>
                        <button onClick={() => openDoc(a, true)} title={s.download} aria-label={s.download} className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-icon hover:bg-selected transition-colors"><Download className="w-4 h-4" /></button>
                        {canEdit && <button onClick={() => setRemoveDocRow(a)} className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-icon hover:bg-selected hover:text-danger transition-colors"><Trash2 className="w-4 h-4" /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        </>
      )}

      {tab === 'orders' && (
        <div className="data-card table-bleed table-grid bg-white rounded-lg border border-field overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[560px]">
            <GridHead cols={[[t.po.poNumber, FileText], [t.common.status, CircleDot], [t.common.created, CalendarClock], [t.po.total, Coins, 'right']]} />
            <tbody className="divide-y divide-field">
              {orders.length === 0 ? (
                <TableEmptyState icon={ShoppingCart} colSpan={4} title={s.orders} subtitle={s.noOrders} />
              ) : orders.map(o => (
                <tr key={o.id} className="hover:bg-surface transition-colors cursor-pointer" onClick={() => navigate(`/purchase-orders/${o.id}`)}>
                  <td className="px-4 py-3 font-medium text-ink whitespace-nowrap">{o.po_number}</td>
                  <td className="px-4 py-3"><span className={`badge ${PO_BADGE[o.status] ?? 'badge-neutral'}`}>{t.status[o.status as keyof typeof t.status] ?? o.status}</span></td>
                  <td className="px-4 py-3 text-ink2 whitespace-nowrap">{fmtDate(o.created_at.slice(0, 10))}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(Number(o.total_amount ?? 0))}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} title={t.common.import.priceListTitle}
        templateName="cenik" duplicateRule="priceList"
        columns={[
          { key: 'code', label: t.items.itemNumber, example: '100001' },
          { key: 'name', label: t.common.name, example: 'Goveji file' },
          { key: 'price', label: s.agreedPrice, example: '9,50' },
        ]}
        onTemplate={() => exportToExcel(`${contract.contract_number}-cenik`, priceCols, priceRows)}
        skip={row => !row.price}
        existing={new Set()}
        keyOf={row => findCatalogItem(row)?.id ?? ''}
        validate={row => {
          if (!row.code && !row.name) return `${t.common.import.missingValue}: ${t.items.itemNumber} / ${t.common.name}`
          if (Number.isNaN(toPrice(row.price)) || toPrice(row.price) < 0) return `${t.common.import.invalidNumber}: ${row.price}`
          return findCatalogItem(row) ? null : `${t.common.import.unknownItem}: ${row.code || row.name}`
        }}
        onImport={async rows => {
          const payload = rows.map(r => ({ contract_id: contract.id, company_id: company!.id, item_id: findCatalogItem(r)!.id, agreed_price: toPrice(r.price) }))
          // prices already in the price list are updated, the rest are added
          const { error } = await supabase.from('contract_items').upsert(payload, { onConflict: 'contract_id,item_id' })
          if (error) throw error
          load()
        }} />

      <ContractFormModal open={editOpen} onClose={() => setEditOpen(false)} contract={contract} suppliers={suppliers} people={people} onSaved={load}
        onDelete={isAdmin ? () => setConfirm('delete') : undefined} deleteBlocked={orders.length > 0 ? s.deleteBlockedMsg : null} />
      <Modal open={noticeOpen} onClose={() => setNoticeOpen(false)} title={s.noticeTitle} size="sm" icon={BellRing}>
        <Input id="c-notice-on" type="date" label={s.noticeGivenOn} value={noticeOn} onChange={e => setNoticeOn(e.target.value)} />
        <p className="text-xs text-ink2 mt-1.5">{s.noticeGivenHint}</p>
        <ModalActions className="justify-end">
          <Button variant="secondary" onClick={() => setNoticeOpen(false)}>{t.common.cancel}</Button>
          <Button disabled={!noticeOn} onClick={() => setNotice(noticeOn)}>{s.giveNotice}</Button>
        </ModalActions>
      </Modal>

      <ConfirmDialog open={confirm === 'delete'} onClose={() => setConfirm(null)} onConfirm={deleteContract}
        title={s.deleteTitle} message={s.deleteQuestion} name={`${contract.contract_number} · ${contract.title}`} danger confirmLabel={t.common.deleteEntity} />
      <ConfirmDialog open={!!removePriceRow} onClose={() => setRemovePriceRow(null)}
        onConfirm={async () => { if (removePriceRow) await removePrice(removePriceRow); setRemovePriceRow(null) }}
        title={t.common.deletePriceTitle} message={t.common.deletePriceQuestion} name={removePriceRow ? `${removePriceRow.items?.name ?? ''} (${removePriceRow.items?.item_number ?? ''})` : ''} danger confirmLabel={t.common.deleteEntity} />

      <ConfirmDialog open={!!removeDocRow} onClose={() => setRemoveDocRow(null)}
        onConfirm={async () => { if (removeDocRow) await removeDoc(removeDocRow); setRemoveDocRow(null) }}
        title={t.common.deleteDocTitle} message={t.common.deleteDocQuestion} name={removeDocRow?.file_name ?? ''} danger confirmLabel={t.common.deleteEntity} />

    </div>
  )
}
