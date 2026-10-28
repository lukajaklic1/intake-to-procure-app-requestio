import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Pencil, Plus, Trash2, Upload, FileText, Download } from 'lucide-react'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { useLanguage } from '../hooks/useLanguage'
import { toast } from '../components/ui/Toast'
import { dbError } from '../lib/dbError'
import Button from '../components/ui/Button'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import EmptyState from '../components/ui/EmptyState'
import ContractFormModal, { type PersonLite, type SupplierLite } from '../components/contracts/ContractFormModal'
import { daysUntil, effectiveStatus, noticeDate, STATUS_BADGE } from '../lib/contracts'
import type { Contract, ContractAttachment } from '../types/database'

type Full = Contract & { suppliers: { id: string; name: string } | null }
interface PriceRow { id: string; item_id: string; agreed_price: number; items: { name: string; item_number: string; default_unit: string | null; default_unit_price: number | null } | null }
interface OrderRow { id: string; po_number: string; status: string; total_amount: number | null; created_at: string }
type Tab = 'overview' | 'prices' | 'documents' | 'orders'

const fmtDate = (d: string | null) => (d ? format(new Date(d + 'T00:00:00'), 'dd.MM.yyyy') : '—')
const PO_BADGE: Record<string, string> = { draft: 'badge-neutral', issued: 'badge-warn', sent: 'badge-info', closed: 'badge-success', cancelled: 'badge-danger' }

export default function ContractDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { company, isAdmin, hasPerm } = useCompany()
  const { t } = useLanguage()
  const s = t.contracts
  const canEdit = isAdmin || hasPerm('purchase_orders', 'create')
  const currency = company?.currency ?? 'EUR'
  const money = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency, minimumFractionDigits: 2 }).format(n)

  const [contract, setContract] = useState<Full | null>(null)
  const [prices, setPrices] = useState<PriceRow[]>([])
  const [attachments, setAttachments] = useState<ContractAttachment[]>([])
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [owner, setOwner] = useState('—')
  const [suppliers, setSuppliers] = useState<SupplierLite[]>([])
  const [people, setPeople] = useState<PersonLite[]>([])
  const [catalog, setCatalog] = useState<{ id: string; name: string; item_number: string; default_unit_price: number | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('overview')
  const [editOpen, setEditOpen] = useState(false)
  const [confirm, setConfirm] = useState<'terminate' | 'delete' | null>(null)
  const [removePriceRow, setRemovePriceRow] = useState<PriceRow | null>(null)
  const [removeDocRow, setRemoveDocRow] = useState<ContractAttachment | null>(null)
  const [newItem, setNewItem] = useState({ item_id: '', price: '' })
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (company && id) load() }, [company, id])

  async function load() {
    if (!company || !id) return
    const [{ data: c }, { data: pr }, { data: at }, { data: po }, { data: sup }, { data: us }, { data: it }] = await Promise.all([
      supabase.from('contracts').select('*, suppliers(id, name)').eq('id', id).single(),
      supabase.from('contract_items').select('id, item_id, agreed_price, items(name, item_number, default_unit, default_unit_price)').eq('contract_id', id).order('created_at'),
      supabase.from('contract_attachments').select('*').eq('contract_id', id).order('created_at', { ascending: false }),
      supabase.from('purchase_orders').select('id, po_number, status, total_amount, created_at').eq('contract_id', id).order('created_at', { ascending: false }),
      supabase.from('suppliers').select('id, name, payment_terms').eq('company_id', company.id).eq('status', 'active').order('name'),
      supabase.from('users').select('id, first_name, last_name').eq('company_id', company.id).order('first_name'),
      supabase.from('items').select('id, name, item_number, default_unit_price').eq('company_id', company.id).eq('status', 'active').order('name'),
    ])
    if (!c) { toast.error(t.common.notFound); navigate('/contracts'); return }
    setContract(c as Full)
    setPrices((pr as unknown as PriceRow[]) ?? [])
    setAttachments((at as ContractAttachment[]) ?? [])
    setOrders((po as OrderRow[]) ?? [])
    setSuppliers(sup ?? []); setPeople(us ?? []); setCatalog(it ?? [])
    const o = (us ?? []).find(u => u.id === (c as Full).owner_id)
    setOwner(o ? `${o.first_name} ${o.last_name}` : '—')
    setLoading(false)
  }

  if (loading || !contract) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>

  const st = effectiveStatus(contract)
  const daysLeft = daysUntil(contract.end_date)
  const nd = noticeDate(contract)
  const noticeIn = daysUntil(nd)
  const spent = orders.filter(o => ['issued', 'sent', 'closed'].includes(o.status)).reduce((n, o) => n + Number(o.total_amount ?? 0), 0)
  const pct = contract.total_value && contract.total_value > 0 ? Math.min(100, Math.round((spent / contract.total_value) * 100)) : 0
  const over = contract.total_value != null && spent > contract.total_value

  async function setStatus(status: Contract['status']) {
    const { error } = await supabase.from('contracts').update({ status, updated_at: new Date().toISOString() }).eq('id', contract!.id)
    setConfirm(null)
    if (error) { toast.error(dbError(error, t)); return }
    toast.success(t.common.saved); load()
  }
  async function deleteContract() {
    const { error } = await supabase.from('contracts').delete().eq('id', contract!.id)
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
  async function openDoc(a: ContractAttachment) {
    const { data } = await supabase.storage.from('quotations').createSignedUrl(a.file_path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }
  async function removeDoc(a: ContractAttachment) {
    await supabase.storage.from('quotations').remove([a.file_path])
    await supabase.from('contract_attachments').delete().eq('id', a.id)
    load()
  }

  const usedItems = new Set(prices.map(p => p.item_id))
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'overview', label: s.overview },
    { id: 'prices', label: s.prices, count: prices.length },
    { id: 'documents', label: s.documents, count: attachments.length },
    { id: 'orders', label: s.orders, count: orders.length },
  ]

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div><p className="text-xs text-gray-400 mb-0.5">{label}</p><div className="text-sm text-ink">{children || '—'}</div></div>
  )

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto">
      <button onClick={() => navigate('/contracts')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4"><ChevronLeft className="w-4 h-4" />{s.title}</button>

      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">{contract.title}</h1>
            <span className={`badge ${STATUS_BADGE[st]}`}>{s.st[st]}</span>
          </div>
          <p className="text-sm text-ink2 mt-1">{contract.contract_number} · {contract.suppliers?.name}</p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            {contract.status === 'draft' && <Button onClick={() => setStatus('active')}>{s.activate}</Button>}
            {contract.status === 'terminated' && <Button variant="secondary" onClick={() => setStatus('active')}>{s.reactivate}</Button>}
            {contract.status === 'active' && <Button variant="secondary" onClick={() => setConfirm('terminate')}>{s.terminate}</Button>}
            <Button variant="secondary" onClick={() => setEditOpen(true)} className="gap-2"><Pencil className="w-4 h-4" />{t.common.editEntity}</Button>
          </div>
        )}
      </div>

      {(st === 'expired' || (st === 'active' && ((daysLeft != null && daysLeft <= 60) || (noticeIn != null && noticeIn >= 0 && noticeIn <= 30)))) && (
        <div className={`rounded-lg border px-4 py-3 mb-5 text-sm ${st === 'expired' ? 'badge-danger !rounded-lg' : 'badge-warn !rounded-lg'} !whitespace-normal`}>
          {st === 'expired' ? `${s.expiredOn}: ${fmtDate(contract.end_date)}` : `${s.expiresSoon}: ${fmtDate(contract.end_date)} (${daysLeft} ${s.daysLeft})`}
          {nd && st === 'active' && noticeIn != null && noticeIn >= 0 && ` · ${s.noticeDue}: ${fmtDate(nd)}`}
        </div>
      )}

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
            <Field label={s.supplier}>{contract.suppliers && <Link to="/suppliers" className="text-accent hover:underline">{contract.suppliers.name}</Link>}</Field>
            <Field label={s.startDate}>{fmtDate(contract.start_date)}</Field>
            <Field label={s.endDate}>{contract.end_date ? fmtDate(contract.end_date) : s.openEnded}</Field>
            <Field label={s.noticeDays}>{contract.notice_days ? `${contract.notice_days} (${fmtDate(nd)})` : '—'}</Field>
            <Field label={s.autoRenew}>{contract.auto_renew ? `${t.common.yes ?? 'Da'}${contract.renewal_months ? ` · ${contract.renewal_months} ${s.renewalMonths.toLowerCase()}` : ''}` : '—'}</Field>
            <Field label={s.paymentTerms}>{contract.payment_terms}</Field>
            <Field label={s.owner}>{owner}</Field>
            {contract.description && <div className="col-span-2 sm:col-span-3"><Field label={s.description}><span className="whitespace-pre-wrap">{contract.description}</span></Field></div>}
          </div>

          <div className="bg-white rounded-lg border border-field p-6">
            <p className="text-xs text-gray-400 mb-1">{s.spent} / {s.totalValue}</p>
            <p className="text-2xl font-semibold text-ink">{money(spent)}</p>
            {contract.total_value != null ? (
              <>
                <div className="h-1.5 rounded-full bg-selected mt-3 overflow-hidden"><div className={`h-full rounded-full ${over ? 'bg-danger' : pct >= 80 ? 'bg-warn' : 'bg-primary'}`} style={{ width: `${pct}%` }} /></div>
                <div className="flex justify-between text-xs text-ink2 mt-2">
                  <span>{money(contract.total_value)}</span>
                  <span>{s.remaining}: {money(Math.max(0, contract.total_value - spent))}</span>
                </div>
              </>
            ) : <p className="text-xs text-gray-400 mt-2">—</p>}
          </div>
        </div>
      )}

      {tab === 'prices' && (
        <div className="bg-white rounded-lg border border-field overflow-hidden">
          {canEdit && (
            <div className="flex items-end gap-3 flex-wrap p-4 border-b border-field">
              <div className="flex flex-col gap-1 flex-1 min-w-[220px]">
                <label className="text-xs text-gray-400">{s.addItem}</label>
                <select value={newItem.item_id} onChange={e => {
                  const it = catalog.find(x => x.id === e.target.value)
                  setNewItem({ item_id: e.target.value, price: it?.default_unit_price != null ? String(it.default_unit_price).replace('.', ',') : '' })
                }} className="rounded-lg border border-field px-3 py-2 text-sm bg-white focus:outline-none hover:border-field-hover">
                  <option value="">{s.pickItem}</option>
                  {catalog.filter(x => !usedItems.has(x.id)).map(x => <option key={x.id} value={x.id}>{x.item_number} · {x.name}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1 w-36">
                <label className="text-xs text-gray-400">{s.agreedPrice}</label>
                <input value={newItem.price} onChange={e => { if (/^[0-9]*[,.]?[0-9]*$/.test(e.target.value)) setNewItem(n => ({ ...n, price: e.target.value })) }}
                  placeholder="0,00" className="rounded-lg border border-field px-3 py-2 text-sm text-right focus:outline-none hover:border-field-hover" />
              </div>
              <Button onClick={addPrice} className="gap-2"><Plus className="w-4 h-4" />{t.common.create}</Button>
            </div>
          )}
          {prices.length === 0 ? (
            <div className="py-14"><EmptyState icon={FileText} title={s.prices} subtitle={s.noPrices} /></div>
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-sm min-w-[620px]">
              <thead className="bg-surface border-b border-field"><tr>
                {[t.items.itemNumber, t.common.name, t.items.defaultUnit, s.catalogPrice, s.agreedPrice, ''].map((h, i) => <th key={i} className={`px-4 py-3 text-sm font-medium text-ink2 ${i >= 3 && i < 5 ? 'text-right' : 'text-left'}`}>{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-field">
                {prices.map(p => {
                  const cat = p.items?.default_unit_price
                  const diff = cat ? Math.round(((p.agreed_price - cat) / cat) * 100) : null
                  return (
                    <tr key={p.id}>
                      <td className="px-4 py-3 text-xs text-gray-500">{p.items?.item_number}</td>
                      <td className="px-4 py-3 font-medium text-ink">{p.items?.name}</td>
                      <td className="px-4 py-3 text-ink2">{p.items?.default_unit ?? '—'}</td>
                      <td className="px-4 py-3 text-right text-ink2">{cat != null ? money(cat) : '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          {diff != null && diff !== 0 && <span className={`text-xs ${diff < 0 ? 'text-success' : 'text-danger'}`}>{diff > 0 ? '+' : ''}{diff}%</span>}
                          <input defaultValue={String(p.agreed_price).replace('.', ',')} disabled={!canEdit} onBlur={e => savePrice(p, e.target.value)}
                            className="w-28 text-right rounded-lg border border-transparent hover:border-field focus:border-field-focus px-2 py-1 focus:outline-none disabled:bg-transparent" />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">{canEdit && <button onClick={() => setRemovePriceRow(p)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table></div>
          )}
        </div>
      )}

      {tab === 'documents' && (
        <div className="bg-white rounded-lg border border-field overflow-hidden">
          {canEdit && (
            <div className="p-4 border-b border-field">
              <input ref={fileRef} type="file" multiple className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp" onChange={e => upload(e.target.files)} />
              <Button variant="secondary" loading={uploading} onClick={() => fileRef.current?.click()} className="gap-2"><Upload className="w-4 h-4" />{s.upload}</Button>
            </div>
          )}
          {attachments.length === 0 ? (
            <div className="py-14"><EmptyState icon={FileText} title={s.documents} subtitle={s.noDocuments} /></div>
          ) : (
            <ul className="divide-y divide-field">
              {attachments.map(a => (
                <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                  <FileText className="w-4 h-4 text-icon shrink-0" />
                  <button onClick={() => openDoc(a)} className="flex-1 min-w-0 text-left text-sm text-ink truncate hover:text-accent">{a.file_name}</button>
                  <span className="text-xs text-gray-400">{a.file_size ? `${Math.max(1, Math.round(a.file_size / 1024))} KB` : ''} · {fmtDate(a.created_at.slice(0, 10))}</span>
                  <button onClick={() => openDoc(a)} className="p-1.5 text-gray-400 hover:text-ink rounded-lg"><Download className="w-3.5 h-3.5" /></button>
                  {canEdit && <button onClick={() => setRemoveDocRow(a)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'orders' && (
        <div className="bg-white rounded-lg border border-field overflow-hidden">
          {orders.length === 0 ? (
            <div className="py-14"><EmptyState icon={FileText} title={s.orders} subtitle={s.noOrders} /></div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-surface border-b border-field"><tr>
                {[t.po.poNumber, t.common.status, t.common.created, t.po.total].map((h, i) => <th key={i} className={`px-4 py-3 text-sm font-medium text-ink2 ${i === 3 ? 'text-right' : 'text-left'}`}>{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-field">
                {orders.map(o => (
                  <tr key={o.id} className="hover:bg-surface cursor-pointer" onClick={() => navigate(`/purchase-orders/${o.id}`)}>
                    <td className="px-4 py-3 font-medium text-ink">{o.po_number}</td>
                    <td className="px-4 py-3"><span className={`badge ${PO_BADGE[o.status] ?? 'badge-neutral'}`}>{t.status[o.status as keyof typeof t.status] ?? o.status}</span></td>
                    <td className="px-4 py-3 text-ink2">{fmtDate(o.created_at.slice(0, 10))}</td>
                    <td className="px-4 py-3 text-right">{money(Number(o.total_amount ?? 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <ContractFormModal open={editOpen} onClose={() => setEditOpen(false)} contract={contract} suppliers={suppliers} people={people} onSaved={load}
        onDelete={() => setConfirm('delete')} deleteBlocked={orders.length > 0 ? s.deleteBlockedMsg : null} />
      <ConfirmDialog open={confirm === 'terminate'} onClose={() => setConfirm(null)} onConfirm={() => setStatus('terminated')}
        title={s.terminateTitle} message={s.terminateQuestion} name={`${contract.contract_number} · ${contract.title}`} danger confirmLabel={s.terminate} />
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
